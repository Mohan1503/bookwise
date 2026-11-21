import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import useApiData from '../../hooks/useApiData';
import {
  createAdminEntity,
  deleteAdminEntity,
  listAdminEntities,
  updateAdminEntity,
} from '../../services/api';
import { SLUG_PATTERN, slugify } from '../../utils/admin';
import { ADMIN_ENTITIES } from './adminEntities';

function emptyForm(config, item) {
  const form = { name: item?.name ?? '', slug: item?.slug ?? '' };
  config.fields.forEach((field) => {
    form[field.name] = item?.[field.name] ?? '';
  });
  return form;
}

/** List + inline form for authors, categories or publishers (`kind`). */
export default function AdminEntityManager({ kind }) {
  const config = ADMIN_ENTITIES[kind];
  const { notify } = useOutletContext();
  const items = useApiData(() => listAdminEntities(kind), [kind]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null); // null = create mode

  const list = items.data ?? [];
  const term = filter.trim().toLowerCase();
  const visible = term
    ? list.filter((item) => `${item.name} ${item.slug}`.toLowerCase().includes(term))
    : list;

  async function removeItem(item) {
    const usage = item.book_count
      ? ` It is used by ${item.book_count} ${item.book_count === 1 ? 'book' : 'books'}.`
      : '';
    if (!window.confirm(`Delete the ${config.singular} “${item.name}”?${usage} This cannot be undone.`)) return;
    try {
      await deleteAdminEntity(kind, item.id);
      notify(`Deleted “${item.name}”.`);
      if (editing?.id === item.id) setEditing(null);
      items.setData((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function handleSaved(saved, isNew) {
    items.setData((current) => {
      const rest = (current ?? []).filter((entry) => entry.id !== saved.id);
      return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    notify(isNew ? `Added “${saved.name}”.` : `Saved “${saved.name}”.`);
    setEditing(null);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__intro">
        <p className="admin-page__lead">{config.lead}</p>
      </div>

      <div className="admin-split">
        <section className="panel admin-card">
          <div className="admin-card__head">
            <div>
              <h2 className="admin-card__title">All {config.plural.toLowerCase()}</h2>
              <p className="admin-card__hint">{items.data ? `${list.length} total` : 'Loading…'}</p>
            </div>
            <div className="admin-search admin-search--compact">
              <Search size={15} aria-hidden="true" />
              <label className="sr-only" htmlFor={`${kind}-filter`}>Filter {config.plural.toLowerCase()}</label>
              <input id={`${kind}-filter`} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter…" />
            </div>
          </div>

          {items.error ? <p className="admin-alert admin-alert--error" role="alert">{items.error}</p> : null}

          {items.data && visible.length === 0 ? (
            <div className="admin-empty">
              <h3>{term ? 'No matches' : `No ${config.plural.toLowerCase()} yet`}</h3>
              <p>{term ? 'Try a different filter.' : `Use the form to add your first ${config.singular}.`}</p>
            </div>
          ) : (
            <div className="admin-table-wrap" aria-busy={items.loading}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="num">Books</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id} className={editing?.id === item.id ? 'is-selected' : undefined}>
                      <td>
                        <strong>{item.name}</strong>
                        <small>/{item.slug}{config.summary(item) ? ` · ${config.summary(item)}` : ''}</small>
                      </td>
                      <td className="num">{item.book_count}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}>
                            <Pencil size={15} aria-hidden="true" /> Edit
                          </button>
                          <button type="button" className="btn btn--ghost btn--sm admin-danger" onClick={() => removeItem(item)} aria-label={`Delete ${item.name}`}>
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <EntityForm
          key={`${kind}-${editing?.id ?? 'new'}`}
          kind={kind}
          config={config}
          item={editing}
          onCancel={() => setEditing(null)}
          onSaved={handleSaved}
        />
      </div>
    </div>
  );
}

function EntityForm({ kind, config, item, onCancel, onSaved }) {
  const isNew = !item;
  const [form, setForm] = useState(() => emptyForm(config, item));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function handleInput(event) {
    const { name, value } = event.target;
    if (name === 'slug') setSlugTouched(true);
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'name' && !slugTouched ? { slug: slugify(value) } : {}),
    }));
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = 'Use at least 2 characters.';
    if (!SLUG_PATTERN.test(form.slug.trim())) nextErrors.slug = 'Use lowercase letters, numbers and single hyphens.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload = { name: form.name.trim(), slug: form.slug.trim() };
    config.fields.forEach((field) => {
      payload[field.name] = form[field.name].trim() || null;
    });

    setSaving(true);
    try {
      const saved = isNew
        ? await createAdminEntity(kind, payload)
        : await updateAdminEntity(kind, item.id, payload);
      onSaved(saved, isNew);
      if (isNew) {
        // Stay in "add" mode, ready for the next entry.
        setForm(emptyForm(config, null));
        setSlugTouched(false);
      }
    } catch (error) {
      setErrors(error.status === 409 ? { slug: error.message } : { form: error.message });
    } finally {
      setSaving(false);
    }
  }

  const idFor = (name) => `${kind}-${name}`;

  return (
    <form className="panel admin-card admin-form admin-split__form" onSubmit={handleSubmit} noValidate>
      <div className="admin-card__head">
        <h2 className="admin-card__title">{isNew ? `Add ${config.singular}` : `Edit ${config.singular}`}</h2>
        {isNew ? null : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} aria-label="Cancel editing">
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      {errors.form ? <p className="admin-alert admin-alert--error" role="alert">{errors.form}</p> : null}

      <div className="field">
        <label className="field__label" htmlFor={idFor('name')}>Name <span aria-hidden="true">*</span></label>
        <input id={idFor('name')} name="name" className={errors.name ? 'input input--error' : 'input'} value={form.name} onChange={handleInput} maxLength={255} required aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? idFor('name-error') : undefined} />
        {errors.name ? <p className="field__error" id={idFor('name-error')}>{errors.name}</p> : null}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={idFor('slug')}>URL slug <span aria-hidden="true">*</span></label>
        <input id={idFor('slug')} name="slug" className={errors.slug ? 'input input--error' : 'input'} value={form.slug} onChange={handleInput} maxLength={255} required aria-invalid={Boolean(errors.slug)} aria-describedby={errors.slug ? idFor('slug-error') : undefined} />
        {errors.slug ? <p className="field__error" id={idFor('slug-error')}>{errors.slug}</p> : null}
      </div>

      {config.fields.map((field) => (
        <div className="field" key={field.name}>
          <label className="field__label" htmlFor={idFor(field.name)}>{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea id={idFor(field.name)} name={field.name} className="input admin-textarea" value={form[field.name]} onChange={handleInput} maxLength={field.maxLength} rows={4} />
          ) : (
            <input id={idFor(field.name)} name={field.name} type={field.type} className="input" value={form[field.name]} onChange={handleInput} maxLength={field.maxLength} placeholder={field.placeholder} />
          )}
        </div>
      ))}

      <div className="admin-form__footer">
        {isNew ? null : <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {isNew ? <Plus size={16} aria-hidden="true" /> : null}
          {saving ? 'Saving…' : isNew ? `Add ${config.singular}` : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
