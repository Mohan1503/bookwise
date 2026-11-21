import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  ImagePlus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import useApiData from '../../hooks/useApiData';
import LoadingSpinner from '../../components/LoadingSpinner';
import {
  createAdminBook,
  createAdminEntity,
  deleteAdminBook,
  deleteAdminBookFile,
  deleteAdminCover,
  getAdminAiIndex,
  getAdminBook,
  getAdminSettings,
  listAdminEntities,
  reindexAdminBook,
  setAdminBookPublished,
  updateAdminBook,
  uploadAdminBookFile,
} from '../../services/api';
import AdminCover from '../../components/admin/AdminCover';
import MultiPicker from '../../components/admin/MultiPicker';
import StatusPill from '../../components/admin/StatusPill';
import { BOOK_STATUSES, formatBytes, formatDate, SLUG_PATTERN, slugify } from '../../utils/admin';

function loadLookups() {
  return Promise.all([
    listAdminEntities('authors'),
    listAdminEntities('categories'),
    listAdminEntities('publishers'),
    getAdminSettings(),
  ]).then(([authors, categories, publishers, settings]) => ({ authors, categories, publishers, settings }));
}

function initialForm(book) {
  return {
    title: book?.title ?? '',
    slug: book?.slug ?? '',
    description: book?.description ?? '',
    author_ids: book?.authors.map((author) => author.id) ?? [],
    category_ids: book?.categories.map((category) => category.id) ?? [],
    publisher_id: book?.publisher_id ?? '',
    isbn: book?.isbn ?? '',
    language: book?.language ?? 'en',
    publication_date: book?.publication_date?.slice(0, 10) ?? '',
    price: book ? String(book.price) : '0',
    rating: book ? String(book.rating) : '0',
    featured: Boolean(book?.featured),
    status: book?.status ?? 'DRAFT',
    visibility: book?.visibility ?? 'PRIVATE',
    rights_status: book?.rights_status ?? '',
  };
}

function validate(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'Enter a title.';
  if (!form.slug.trim()) errors.slug = 'Enter a URL slug.';
  else if (!SLUG_PATTERN.test(form.slug.trim())) errors.slug = 'Use lowercase letters, numbers and single hyphens.';
  const price = Number(form.price);
  if (form.price === '' || Number.isNaN(price) || price < 0) errors.price = 'Enter a price of 0 or more.';
  else if (!/^\d+(\.\d{1,2})?$/.test(String(form.price).trim())) errors.price = 'Use at most two decimal places.';
  const rating = Number(form.rating);
  if (form.rating === '' || Number.isNaN(rating) || rating < 0 || rating > 5) errors.rating = 'Rating must be between 0 and 5.';
  const isbn = form.isbn.replace(/-/g, '').trim();
  if (isbn && (isbn.length < 10 || isbn.length > 17)) errors.isbn = 'ISBN must have 10–17 characters (hyphens ignored).';
  if (form.language.trim().length < 2) errors.language = 'Use a language code such as “en”.';
  return errors;
}

function toPayload(form) {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    description: form.description.trim() || null,
    author_ids: form.author_ids,
    category_ids: form.category_ids,
    publisher_id: form.publisher_id || null,
    isbn: form.isbn.trim() || null,
    language: form.language.trim(),
    publication_date: form.publication_date ? `${form.publication_date}T00:00:00` : null,
    price: Number(form.price),
    rating: Number(form.rating),
    featured: form.featured,
    status: form.status,
    visibility: form.visibility,
    rights_status: form.rights_status.trim() || null,
  };
}

export default function AdminBookEditor() {
  const { bookId } = useParams();
  const isNew = !bookId;
  const bookData = useApiData(() => (bookId ? getAdminBook(bookId) : Promise.resolve(null)), [bookId]);
  const lookups = useApiData(loadLookups);

  const ready = !bookData.loading && lookups.data && (isNew || bookData.data);
  const loadError = bookData.error || lookups.error;

  return (
    <div className="admin-page">
      <Link to="/admin/books" className="admin-back"><ArrowLeft size={16} aria-hidden="true" /> All books</Link>

      {loadError ? <p className="admin-alert admin-alert--error" role="alert">{loadError}</p> : null}
      {!ready && !loadError ? <p className="muted" role="status">Loading…</p> : null}
      {ready ? (
        <BookEditorForm
          key={bookId ?? 'new'}
          book={bookData.data}
          setBook={bookData.setData}
          lookups={lookups.data}
          setLookups={lookups.setData}
        />
      ) : null}
    </div>
  );
}

function BookEditorForm({ book, setBook, lookups, setLookups }) {
  const { notify } = useOutletContext();
  const navigate = useNavigate();
  const isNew = !book;
  const [form, setForm] = useState(() => initialForm(book));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function setField(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === 'title' && !slugTouched) next.slug = slugify(value);
      return next;
    });
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
  }

  function handleInput(event) {
    const { name, type, value, checked } = event.target;
    if (name === 'slug') setSlugTouched(true);
    setField(name, type === 'checkbox' ? checked : value);
  }

  function quickCreate(kind) {
    return async (name) => {
      const created = await createAdminEntity(kind, { name, slug: slugify(name) });
      setLookups((current) => ({
        ...current,
        [kind]: [...current[kind], created].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      notify(`Added “${created.name}”.`);
      return created;
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      notify('Please fix the highlighted fields.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createAdminBook(toPayload(form));
        notify('Book created. You can now add a cover and the PDF.');
        navigate(`/admin/books/${created.id}`, { replace: true });
      } else {
        const updated = await updateAdminBook(book.id, toPayload(form));
        setBook(updated);
        notify('Changes saved.');
      }
    } catch (error) {
      setErrors({ form: error.message, ...(error.status === 409 ? { slug: error.message } : {}) });
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = (name) => (errors[name] ? 'input input--error' : 'input');
  const fieldError = (name) => (errors[name] ? <p className="field__error" id={`book-${name}-error`}>{errors[name]}</p> : null);
  const describedBy = (name, hint) => [errors[name] ? `book-${name}-error` : '', hint ? `book-${name}-hint` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="admin-editor">
      <form className="panel admin-card admin-form" onSubmit={handleSubmit} noValidate>
        <div className="admin-card__head">
          <div>
            <h2 className="admin-card__title">{isNew ? 'New book' : book.title}</h2>
            <p className="admin-card__hint">{isNew ? 'Fill in the details, then save to add a cover and PDF.' : `Last updated ${formatDate(book.updated_at)}`}</p>
          </div>
        </div>

        {errors.form ? <p className="admin-alert admin-alert--error" role="alert">{errors.form}</p> : null}

        <fieldset className="admin-fieldset">
          <legend>Basics</legend>
          <div className="field">
            <label className="field__label" htmlFor="book-title">Title <span aria-hidden="true">*</span></label>
            <input id="book-title" name="title" className={fieldClass('title')} value={form.title} onChange={handleInput} aria-invalid={Boolean(errors.title)} aria-describedby={describedBy('title')} required maxLength={255} />
            {fieldError('title')}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="book-slug">URL slug <span aria-hidden="true">*</span></label>
            <input id="book-slug" name="slug" className={fieldClass('slug')} value={form.slug} onChange={handleInput} aria-invalid={Boolean(errors.slug)} aria-describedby={describedBy('slug', true)} required maxLength={255} />
            <p className="field__hint" id="book-slug-hint">Used in links. Generated from the title until you edit it.</p>
            {fieldError('slug')}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="book-description">Description</label>
            <textarea id="book-description" name="description" className="input admin-textarea" value={form.description} onChange={handleInput} maxLength={4000} rows={5} />
            <p className="field__hint">{form.description.length}/4000 characters</p>
          </div>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>People and categories</legend>
          <div className="admin-form__grid">
            <MultiPicker
              label="Authors"
              options={lookups.authors}
              selectedIds={form.author_ids}
              onChange={(ids) => setField('author_ids', ids)}
              onCreate={quickCreate('authors')}
              placeholder="Find or add an author"
              emptyText="No authors yet. Type a name to add one."
            />
            <MultiPicker
              label="Categories"
              options={lookups.categories}
              selectedIds={form.category_ids}
              onChange={(ids) => setField('category_ids', ids)}
              onCreate={quickCreate('categories')}
              placeholder="Find or add a category"
              emptyText="No categories yet. Type a name to add one."
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="book-publisher">Publisher</label>
            <select id="book-publisher" name="publisher_id" className="input" value={form.publisher_id} onChange={handleInput}>
              <option value="">No publisher</option>
              {lookups.publishers.map((publisher) => (
                <option key={publisher.id} value={publisher.id}>{publisher.name}</option>
              ))}
            </select>
            <p className="field__hint"><Link to="/admin/publishers" className="text-link">Manage publishers</Link></p>
          </div>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Details</legend>
          <div className="admin-form__grid">
            <div className="field">
              <label className="field__label" htmlFor="book-isbn">ISBN</label>
              <input id="book-isbn" name="isbn" className={fieldClass('isbn')} value={form.isbn} onChange={handleInput} aria-invalid={Boolean(errors.isbn)} aria-describedby={describedBy('isbn')} maxLength={32} inputMode="numeric" />
              {fieldError('isbn')}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="book-language">Language code</label>
              <input id="book-language" name="language" className={fieldClass('language')} value={form.language} onChange={handleInput} aria-invalid={Boolean(errors.language)} aria-describedby={describedBy('language')} maxLength={50} placeholder="en" />
              {fieldError('language')}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="book-publication-date">Publication date</label>
              <input id="book-publication-date" name="publication_date" type="date" className="input" value={form.publication_date} onChange={handleInput} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="book-rights">Rights status</label>
              <input id="book-rights" name="rights_status" className="input" value={form.rights_status} onChange={handleInput} maxLength={255} placeholder="e.g. Public domain" />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="book-price">Price (₹ INR)</label>
              <input id="book-price" name="price" type="number" min="0" step="1" className={fieldClass('price')} value={form.price} onChange={handleInput} aria-invalid={Boolean(errors.price)} aria-describedby={describedBy('price')} />
              {fieldError('price')}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="book-rating">Rating (0–5)</label>
              <input id="book-rating" name="rating" type="number" min="0" max="5" step="0.1" className={fieldClass('rating')} value={form.rating} onChange={handleInput} aria-invalid={Boolean(errors.rating)} aria-describedby={describedBy('rating')} />
              {fieldError('rating')}
            </div>
          </div>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Publishing</legend>
          <div className="admin-form__grid">
            <div className="field">
              <label className="field__label" htmlFor="book-status">Status</label>
              <select id="book-status" name="status" className="input" value={form.status} onChange={handleInput}>
                {BOOK_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="book-visibility">Visibility</label>
              <select id="book-visibility" name="visibility" className="input" value={form.visibility} onChange={handleInput}>
                <option value="PRIVATE">Private</option>
                <option value="PUBLIC">Public</option>
              </select>
            </div>
          </div>
          <p className="field__hint">The store shows a book only when it is <strong>Published</strong> and <strong>Public</strong>.</p>
          <label className="checkbox">
            <input type="checkbox" name="featured" checked={form.featured} onChange={handleInput} />
            <span>Feature on the store home page (“Editor’s picks”)</span>
          </label>
        </fieldset>

        <div className="admin-form__footer">
          <Link to="/admin/books" className="btn btn--ghost">Cancel</Link>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            <Save size={16} aria-hidden="true" />
            {saving ? 'Saving…' : isNew ? 'Create book' : 'Save changes'}
          </button>
        </div>
      </form>

      <aside className="admin-editor__side">
        {isNew ? (
          <section className="panel admin-card">
            <h2 className="admin-card__title">Cover and files</h2>
            <p className="admin-card__hint">Create the book first; then you can upload its cover image and PDF here.</p>
          </section>
        ) : (
          <>
            <PublishPanel book={book} setBook={setBook} setForm={setForm} />
            <CoverPanel book={book} setBook={setBook} settings={lookups.settings} />
            <FilesPanel book={book} setBook={setBook} settings={lookups.settings} />
            <AiReaderPanel book={book} />
            <DangerPanel book={book} />
          </>
        )}
      </aside>
    </div>
  );
}

function PublishPanel({ book, setBook, setForm }) {
  const { notify } = useOutletContext();
  const [busy, setBusy] = useState(false);
  const isLive = book.status === 'PUBLISHED' && book.visibility === 'PUBLIC';

  async function toggle() {
    setBusy(true);
    try {
      const updated = await setAdminBookPublished(book.id, !isLive);
      setBook(updated);
      setForm((current) => ({ ...current, status: updated.status, visibility: updated.visibility }));
      notify(isLive ? 'Moved back to drafts.' : 'Published. The book is now live in the store.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel admin-card">
      <h2 className="admin-card__title">Store status</h2>
      <div className="admin-publish">
        <StatusPill book={book} />
        <span className="muted">{isLive ? 'Visible in the store' : 'Hidden from the store'}</span>
      </div>
      <div className="admin-card__actions">
        <button type="button" className={`btn btn--sm ${isLive ? 'btn--secondary' : 'btn--primary'}`} onClick={toggle} disabled={busy}>
          {isLive ? 'Unpublish' : 'Publish now'}
        </button>
        {isLive ? (
          <a href={`/books/${book.id}`} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm">
            <ExternalLink size={15} aria-hidden="true" /> View in store
          </a>
        ) : null}
      </div>
    </section>
  );
}

function UploadsOff() {
  return (
    <p className="admin-alert admin-alert--warning">
      Uploads are turned off on the server. Set <code>ADMIN_UPLOADS_ENABLED=true</code> and restart the backend.
    </p>
  );
}

function CoverPanel({ book, setBook, settings }) {
  const { notify } = useOutletContext();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const accept = settings.allowed_cover_extensions.join(',');

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > settings.max_upload_size_mb * 1024 * 1024) {
      notify(`That image is larger than ${settings.max_upload_size_mb} MB.`, 'error');
      return;
    }
    setBusy(true);
    try {
      setBook(await uploadAdminBookFile(book.id, 'cover', file));
      notify('Cover uploaded.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeCover() {
    if (!window.confirm('Remove this cover image?')) return;
    setBusy(true);
    try {
      setBook(await deleteAdminCover(book.id));
      notify('Cover removed.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel admin-card">
      <h2 className="admin-card__title">Cover image</h2>
      <div className="admin-cover-preview"><AdminCover book={book} /></div>
      {settings.uploads_enabled ? (
        <>
          <input ref={inputRef} type="file" accept={accept} className="sr-only" id="cover-upload" onChange={handleFile} disabled={busy} />
          <div className="admin-card__actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              <ImagePlus size={15} aria-hidden="true" /> {busy ? 'Working…' : book.cover_image_path ? 'Replace cover' : 'Upload cover'}
            </button>
            {book.cover_image_path ? (
              <button type="button" className="btn btn--ghost btn--sm admin-danger" onClick={removeCover} disabled={busy}>Remove</button>
            ) : null}
          </div>
          <p className="field__hint">{settings.allowed_cover_extensions.join(', ')} up to {settings.max_upload_size_mb} MB.</p>
        </>
      ) : <UploadsOff />}
    </section>
  );
}

function FilesPanel({ book, setBook, settings }) {
  const { notify } = useOutletContext();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const accept = settings.allowed_book_extensions.join(',');

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > settings.max_upload_size_mb * 1024 * 1024) {
      notify(`That file is larger than ${settings.max_upload_size_mb} MB.`, 'error');
      return;
    }
    setBusy(true);
    try {
      setBook(await uploadAdminBookFile(book.id, 'book', file));
      notify(`Uploaded ${file.name}.`);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(file) {
    if (!window.confirm(`Delete ${file.original_filename}? Readers will no longer be able to open it.`)) return;
    setBusy(true);
    try {
      setBook(await deleteAdminBookFile(book.id, file.id));
      notify('File deleted.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel admin-card">
      <h2 className="admin-card__title">Book files</h2>
      {book.files.length === 0 ? (
        <p className="admin-card__hint">No files yet. Upload the PDF readers will open.</p>
      ) : (
        <ul className="admin-files">
          {book.files.map((file) => (
            <li key={file.id} className="admin-file">
              <FileText size={18} aria-hidden="true" />
              <span className="admin-file__meta">
                <strong title={file.original_filename}>{file.original_filename}</strong>
                <small>{file.format.toUpperCase()} · {formatBytes(file.file_size)} · {file.storage_provider}</small>
              </span>
              <button type="button" className="btn btn--ghost btn--sm admin-danger" onClick={() => removeFile(file)} disabled={busy} aria-label={`Delete ${file.original_filename}`}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {settings.uploads_enabled ? (
        <>
          <input ref={inputRef} type="file" accept={accept} className="sr-only" id="book-file-upload" onChange={handleFile} disabled={busy} />
          <div className="admin-card__actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload size={15} aria-hidden="true" /> {busy ? 'Uploading…' : 'Upload file'}
            </button>
          </div>
          <p className="field__hint">{settings.allowed_book_extensions.join(', ')} up to {settings.max_upload_size_mb} MB · stored in {settings.storage_provider}.</p>
        </>
      ) : <UploadsOff />}
    </section>
  );
}

const AI_WORKING = new Set(['queued', 'indexing']);

/** Shows whether readers can ask the AI Reader about this book, and lets the admin re-prepare it. */
function AiReaderPanel({ book }) {
  const { notify } = useOutletContext();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const filesKey = book.files.map((file) => file.id).join(',');
  const working = AI_WORKING.has(status?.state);
  const isLive = book.status === 'PUBLISHED' && book.visibility === 'PUBLIC';

  // Load the status, and again whenever the book's files change (upload or delete).
  useEffect(() => {
    let active = true;
    getAdminAiIndex(book.id)
      .then((next) => {
        if (!active) return;
        setStatus(next);
        setLoadError('');
      })
      .catch((error) => active && setLoadError(error.message));
    return () => {
      active = false;
    };
  }, [book.id, filesKey]);

  // While the book is queued or being prepared, check again every few seconds.
  useEffect(() => {
    if (!working) return undefined;
    const timer = window.setTimeout(() => {
      getAdminAiIndex(book.id).then(setStatus).catch(() => {});
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [book.id, working, status]);

  async function reindex() {
    setBusy(true);
    try {
      setStatus(await reindexAdminBook(book.id));
      notify('Preparing the book for the AI Reader.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const state = status?.state;
  const canReindex = state && state !== 'no_pdf' && !working;

  return (
    <section className="panel admin-card">
      <h2 className="admin-card__title">AI Reader</h2>
      {loadError ? <p className="admin-alert admin-alert--error">{loadError}</p> : null}
      {!status && !loadError ? <LoadingSpinner label="Checking…" inline size="sm" /> : null}

      {state === 'no_pdf' ? (
        <p className="admin-card__hint">
          Upload a PDF and it will be prepared for the AI Reader automatically. Until then,
          readers can still ask about it: answers come from the catalogue details, without page links.
        </p>
      ) : null}
      {state === 'pending' ? (
        <p className="admin-card__hint">
          Not prepared yet.{status.auto_index ? ' It will be picked up automatically, or prepare it now.' : ''}
        </p>
      ) : null}
      {working ? (
        <div className="admin-ai-status">
          <LoadingSpinner label={state === 'queued' ? 'Waiting to be prepared…' : 'Preparing the text…'} inline size="sm" />
          <p className="admin-card__hint">Long books can take a few minutes. You can leave this page.</p>
        </div>
      ) : null}
      {state === 'indexed' ? (
        <div className="admin-ai-status">
          <p className="admin-ai-status__ready">
            <Sparkles size={15} aria-hidden="true" /> Ready: {status.chunk_count} passages from {status.page_count} pages
          </p>
          <p className="admin-card__hint">
            {isLive ? 'Readers can ask about this book in the AI Reader.' : 'Publish the book to show it in the AI Reader.'}
          </p>
        </div>
      ) : null}
      {state === 'empty' ? (
        <p className="admin-alert admin-alert--warning">
          No text could be read from this PDF. It may be scanned pages; upload a PDF with selectable text.
        </p>
      ) : null}
      {state === 'failed' ? (
        <p className="admin-alert admin-alert--error">Preparing failed: {status.error || 'unknown error'}</p>
      ) : null}

      {canReindex ? (
        <div className="admin-card__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={reindex} disabled={busy}>
            <RefreshCw size={15} aria-hidden="true" />
            {state === 'pending' ? 'Prepare now' : state === 'indexed' ? 'Prepare again' : 'Try again'}
          </button>
          {state === 'indexed' && isLive ? (
            <Link to="/ai-reader" className="btn btn--ghost btn--sm">Open AI Reader</Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DangerPanel({ book }) {
  const { notify } = useOutletContext();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function removeBook() {
    if (!window.confirm(`Delete “${book.title}”? Its cover and files are removed too. This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteAdminBook(book.id);
      notify(`Deleted “${book.title}”.`);
      navigate('/admin/books', { replace: true });
    } catch (error) {
      notify(error.message, 'error');
      setBusy(false);
    }
  }

  return (
    <section className="panel admin-card admin-card--danger">
      <h2 className="admin-card__title">Delete book</h2>
      <p className="admin-card__hint">Removes the book, its cover and its files permanently.</p>
      <button type="button" className="btn btn--secondary btn--sm admin-danger" onClick={removeBook} disabled={busy}>
        <Trash2 size={15} aria-hidden="true" /> Delete book
      </button>
    </section>
  );
}
