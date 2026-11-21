# BookWise backend

FastAPI backend for the BookWise catalogue, using PostgreSQL, SQLAlchemy, and Alembic.

## Requirements

- Python 3.10+
- PostgreSQL (the current deployment uses Neon)
- boto3 (installed from `requirements.txt`)

## Configuration

Run backend commands from this directory so Pydantic Settings loads `.env`. Copy
`.env.example` to `.env`, set `DATABASE_URL`, and keep `.env` out of source control.
Never put database or object-storage credentials in Python source or frontend code.

The existing local storage provider remains the default. To store uploaded book
PDFs in Filebase, configure:

```dotenv
STORAGE_PROVIDER=filebase
FILEBASE_ACCESS_KEY=your-filebase-access-key
FILEBASE_SECRET_KEY=your-filebase-secret-key
FILEBASE_ENDPOINT=https://s3.filebase.io
FILEBASE_BUCKET=bookwise-books
FILEBASE_REGION=auto
```

Create S3 credentials in the Filebase account and grant them access only to the
private `bookwise-books` bucket. The backend signs S3 requests with Signature
Version 4. It does not set a public ACL. Do not commit the real `.env` file.

Other supported settings include `ADMIN_UPLOADS_ENABLED` (defaults to `false`),
`MAX_UPLOAD_SIZE_MB` (defaults to `50`), and the existing local path and allowed
extension settings. `STORAGE_PROVIDER` accepts only `local` or `filebase`.
In Filebase mode both book PDFs and cover images are stored in the private bucket
(PDFs under `books/pdf/<book>/`, covers under `covers/<book>/`; a Filebase cover is
recorded as `filebase:covers/...`). EPUB uploads are refused in Filebase mode.
Cover paths can't be set through the API, only by uploading a cover.

Set `AUTH_SECRET_KEY` to a unique random value of at least 32 characters outside
development. Production startup rejects the built-in development key.
`ACCESS_TOKEN_EXPIRE_MINUTES` controls bearer token lifetime, and
`CORS_ALLOW_ORIGINS` is a comma-separated list (the default allows the local
Vite development origins).

## Install and run

```powershell
cd D:\react\book-project\bookwise-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

The server listens on `http://127.0.0.1:8000`; OpenAPI/Swagger is at
`http://127.0.0.1:8000/docs`. Applying the migration is an explicit deployment
step; the app does not migrate the database automatically.

## Superadmin account and book administration

After applying migrations, create the initial superadmin interactively from the
backend directory:

```powershell
python -m app.scripts.create_superadmin
```

The command prompts for name, email, and a confirmed password (minimum 12
characters); it hashes the password and refuses to create another superadmin.
It does not print or store the plaintext password. Regular public registration
never assigns roles. Keep the created credentials secure.

Sign in at `/admin/login` in the frontend. The admin portal manages books,
authors, categories and publishers, including draft and private records. Admin
API routes require a valid bearer token and the `superadmin` role; the frontend
route guard is supplementary, not the security boundary.

Admin API (`/api/v1/admin`):

- `GET /stats` (catalogue counts and recent books) and `GET /settings`
  (non-secret upload/storage configuration)
- `GET /books?page&size&search&status&sort`, `GET /books/{id}`, `POST /books`,
  `PUT /books/{id}`, `DELETE /books/{id}`, `POST /books/{id}/publish`,
  `POST /books/{id}/unpublish`
- `GET|POST|DELETE /books/{id}/cover` (covers are previewable while drafts)
- `POST /books/{id}/files`, `DELETE /books/{id}/files/{file_id}`
- `GET|POST /authors`, `PUT|DELETE /authors/{id}`, and the same shape for
  `/categories` and `/publishers`; list responses include `book_count`

Slugs are normalised to lowercase words separated by hyphens; a duplicate slug
returns `409`. In `PUT` requests an explicit `null` clears an optional field
(for example `description`, `isbn`, `publisher_id`). Deleting a category or
author unlinks it from its books; deleting a publisher leaves its books without
a publisher. Deleting a book also removes its local cover and files.

Uploads are separately gated: set `ADMIN_UPLOADS_ENABLED=true` and restart to
enable cover and book-file uploads. `POST /api/v1/admin/books/{book_id}/files`
accepts validated PDF uploads; `GET /api/v1/books/{book_id}/files/{file_id}/download`
streams a file only for a published public book. Filebase remains private and
the API does not return a presigned URL. Deleting a book also attempts to remove
its stored objects; a storage cleanup error prevents deleting the database
record.

The backend now supports end-user registration/login, profiles, wishlists, and
per-user reading progress. Subscription checks and per-user protected-book
access are not implemented. Private and draft books are denied by the public
catalogue and download endpoints. The admin feature flag is not administrator
authentication; do not expose admin routes to an untrusted network.

## Frontend API

The frontend uses these `/api/v1` routes:

- `GET /books` (add `readable=true` for books with a PDF), `/books/featured`, `/books/recent`, `/books/{id}`, `/books/{id}/related`, and `/books/{id}/cover`
- `GET /books/{id}/files/{file_id}/download`: streams a published book's PDF to a **signed-in** reader (used by the online reader)
- `GET /categories`
- `POST /auth/register`, `POST /auth/login`
- `GET /users/me`, `PATCH /users/me`
- `GET /wishlist`, `POST /wishlist`, `DELETE /wishlist/{book_id}`, `DELETE /wishlist`
- `GET /reader/progress`, `GET /reader/progress/{book_id}` (null if not started), `PUT /reader/progress`

Authenticated routes use `Authorization: Bearer <access_token>`. Passwords are
stored as PBKDF2 hashes. The frontend cart and checkout remain demo-only. The AI
Reader page uses `GET /ai/books` and `POST /ai/ask` (see AI Reader below).

The storefront fields `price` (in Indian rupees, INR), `rating`, and `featured` are stored on books;
authors and categories are attached through `author_ids` and `category_ids`
when using the existing admin book create/update endpoints. Apply all Alembic
migrations before starting the API.

## AI Reader (RAG)

The AI Reader answers questions about a book from the book's own PDF text:

1. **Indexing**: `python -m app.scripts.index_books` extracts each book's PDF text
   (pypdf), removes the running header, splits it into ~280-word passages that keep
   their page numbers, and embeds them with a local model (fastembed,
   `ibm-granite/granite-embedding-small-english-r2`, CPU only; no API calls; chosen
   over `bge-small-en-v1.5` because it found the right passage far more often in tests). Passages go to the
   `book_chunks` table (pgvector) and per-file status to `book_indexes`. Files that
   are already indexed are skipped; pass `--force` to redo one or more slugs. A new
   admin PDF upload is indexed automatically in the background
   (`AI_AUTO_INDEX_UPLOADS`). The model downloads once into `storage/models`.
2. **Retrieval**: first the AI rewrites the question into up to three short
   search phrases describing the scene (who, where, what happens), using the
   conversation so follow-ups like "what do they eat?" become self-contained
   (`AI_QUERY_REWRITE`, model `GROQ_REWRITE_MODEL` or `AI_MODEL`; if it fails the
   question is searched alone). The question and each phrase are ranked by vector
   similarity; those lists take turns filling the 8 places (so one good phrase is
   enough), with Postgres full-text matches for the question last, since in tests
   keyword matches rarely found the scene asked about. A dropped database
   connection is retried once. Whole-book questions (summaries, themes, reading
   plans) also get passages sampled evenly through the book.
3. **Answering**: `POST /api/v1/ai/ask` (signed-in readers, published books only)
   sends the passages to the AI service (Claude: as `search_result` blocks with
   citations on), and
   streams the answer back as server-sent events: `sources`, `text`, `citations`
   (which numbered passages support the text before it), then `done` or `error`.
   Policy declines retry on the model's default fallback (`fallbacks: "default"`).
   `GET /api/v1/ai/books` lists every published book with its `mode`.
4. **Books without text** (no PDF, e.g. copyrighted titles) are answered in
   *catalogue mode*: from the book's catalogue details and the model's general
   knowledge, with no search, no page links, and a "not from the book's text"
   label in the UI. These answers are less reliable.
5. **Limits**: each signed-in reader may ask `AI_REQUESTS_PER_HOUR` questions per
   hour, counted in the `ai_questions` table (survives restarts; no question text
   is stored). On Groq, a model at its free-tier limit hands over to the next one in
   `GROQ_FALLBACK_MODELS` (each model has its own allowance).

Two services can write the answers (`AI_PROVIDER`):

- `anthropic` (default): Claude, with `ANTHROPIC_API_KEY` and `AI_MODEL` (default
  `claude-opus-5-5`). Paid per question; citations are native.
- `groq`: Groq's free tier, with `GROQ_API_KEY` and `GROQ_MODEL` (default
  `openai/gpt-oss-120b`). Passages are numbered in the prompt and the model's `[n]`
  (or `【n】`) markers become citation events. The free tier allows about 8,000
  tokens a minute (roughly one question a minute), so at most `GROQ_MAX_PASSAGES`
  (10) passages and `GROQ_MAX_OUTPUT_TOKENS` (1500) are used per answer.

Without the chosen provider's key `/ai/ask` returns 503. Other settings:
`AI_EFFORT` (default `low`),
`AI_REQUESTS_PER_HOUR` per user (default 30, `0` disables; stored in Postgres), `EMBEDDING_MODEL`. The embedding size (384) is fixed by the migration. Changing to
another 384-size model only needs re-indexing, which starts automatically on the next
server start; until a book is re-indexed it is searched by keywords only.

```powershell
python -m alembic upgrade head
python -m app.scripts.index_books
```

## Deploying the AI Reader (e.g. Render)

The embeddings live in Neon and the PDFs in Filebase, so a deployed backend uses them
as they are. Only the search model (~190 MB) has to be on the server. Download it in
the **build** step; files created during the build ship with the deploy, so it isn't
downloaded again on the first question or after a restart:

- Build command: `pip install -r requirements.txt && python -m app.scripts.download_model`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Environment: everything from `.env` (it is not deployed), plus `ENVIRONMENT=production`,
  a long random `AUTH_SECRET_KEY`, and `CORS_ALLOW_ORIGINS=https://<your frontend>`.
  Pick the region closest to the Neon database.

The model is loaded in the background at startup (`AI_PRELOAD_MODEL`). Memory,
measured with the whole API loaded: answering questions peaks at ~350 MB; indexing an
uploaded PDF peaks at ~410 MB with `EMBEDDING_BATCH_SIZE=1` (the default; larger
batches need far more: 8 -> ~770 MB, 16 -> ~1.2 GB, and are not faster on CPU). That
fits a 512 MB instance, but with little room. If indexing runs out of memory there,
set `AI_AUTO_INDEX_UPLOADS=false` on the server and index from your own computer:
`python -m app.scripts.index_books` reads the PDFs from Filebase and writes the
embeddings to Neon, which the server then uses.

## Storage migration

The `book_files.storage_provider` migration adds a `local` default for existing
rows. Existing `storage_path` values and files are preserved. No files are
copied, deleted, or uploaded during migration. New Filebase records store the
provider and S3 object key in the existing `book_files` table.

To switch an existing deployment to Filebase, set the Filebase environment
variables and `STORAGE_PROVIDER=filebase`, then move the existing local files:

```powershell
python -m app.scripts.move_files_to_filebase --dry-run
python -m app.scripts.move_files_to_filebase
```

Each file is uploaded, read back and compared before its database row is switched;
local copies are kept unless you pass `--delete-local`. Checksums don't change, so
the AI Reader index stays valid. Records still marked `local` keep being read from
local storage. (This deployment's 13 PDFs were moved on 2026-11-21.)

## Troubleshooting

- Missing credentials: verify `FILEBASE_ACCESS_KEY` and `FILEBASE_SECRET_KEY`
  are set in the backend `.env`; credentials are checked when the Filebase
  service is first used.
- Authorization errors: confirm the keys are valid and have access to the
  configured bucket; do not make the bucket public to work around an error.
- Endpoint/network errors: confirm outbound HTTPS access to
  `https://s3.filebase.io`, the bucket name, and Filebase service status.
- Upload rejected: confirm the filename ends in `.pdf`, the request MIME type is
  `application/pdf`, the bytes begin with a PDF header, and the configured size
  limit is not exceeded.
- Database migration error: check `DATABASE_URL` and review the Alembic output;
  the application does not modify existing records automatically.

Filebase operations log only the operation and error code, not S3 credentials or
presigned URLs. Automated tests mock the S3 client and do not connect to a real
bucket.