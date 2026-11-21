# BookWise frontend

React + Vite storefront. Public catalogue, account, profile, wishlist, and
reading-progress data are loaded from the FastAPI backend. The cart and checkout
remain browser-local demo functionality; the AI Reader chat remains the existing
demo service and is not changed by the API integration.

## Run locally

Start the backend at `http://127.0.0.1:8000` (see
[`bookwise-backend/README.md`](../bookwise-backend/README.md)), then run:

```powershell
npm install
npm run dev
```

Vite proxies `/api` requests to `http://127.0.0.1:8000`. For another backend
address, define `VITE_API_URL` as the API prefix, for example
`https://api.example.com/api/v1`.

The backend must have its database migrated and populated with published,
public books and categories before they appear in the storefront. API errors are
shown on the affected page rather than replaced with the old demo catalogue.

## Reading online

Signed-in readers can open any published book that has a PDF at `/read/:id`
(the "Read now" button on the book page). The reader uses PDF.js
(`pdfjs-dist`, loaded only on that page), saves the reader's page to
`/api/v1/reader/progress` as they read and reopens there next time. It offers
page turning by keyboard, swipe or slider, zoom, light/sepia/night themes, the
PDF's table of contents and full screen. Upload a book's PDF from
**Admin → Books → Edit → Book files**; books with a PDF show a "Read online"
badge and can be listed with the "Available to read online" filter.

## Superadmin catalogue dashboard

Create the initial superadmin using the interactive command documented in the
backend README, then sign in at `/admin/login`. The admin portal is available
only to accounts with the backend-issued `superadmin` role:

- `/admin`: catalogue statistics and recently added books
- `/admin/books`: search, filter by status, paginate, publish/unpublish, delete
- `/admin/books/new` and `/admin/books/:bookId`: the book form, with inline
  creation of authors and categories, cover upload and PDF management
- `/admin/authors`, `/admin/categories`, `/admin/publishers`: add, edit, delete
- `/admin/settings`: your account and the server's upload/storage settings

Cover and PDF uploads also require `ADMIN_UPLOADS_ENABLED=true` in the backend.
Admin pages live in `src/pages/admin/`.

## Verify

```powershell
npm run lint
npm run build
```
