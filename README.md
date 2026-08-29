# FCOM.lib

A private, searchable, AI-assisted lecture library for medical school. FCOM.lib imports PDF decks, extracts page-level text, structures lecture metadata and SLOs with Luna, and synchronizes a private library through Supabase.

See the [product specification](docs/MEDLIBRARY_PRODUCT_SPEC.md) and [UX system](docs/UX_SYSTEM_SPEC.md) for current scope and design rules.

## Current product

- Visual lecture archive with first-page PDF previews
- Dynamic course filtering and newest-week-first grouping
- Multi-PDF import with visible sequential processing
- Page-accurate PDF viewer with persistent pen markup and marked slides
- Autosaving per-page notes
- Non-persistent Luna chat in the lecture viewer
- Exact lecture, SLO, and extracted slide-text search
- SLO review with week/flag filters, Luna re-parsing, and PDF/Excel export
- Supabase email/password accounts, private records, and private PDF storage
- Device caching plus one-time, non-destructive lecture migration to cloud
- Netlify production build and serverless AI endpoints

Question Bank and pre-reads are intentionally retired. The legacy Question Bank implementation and its stored questions are removed; legacy pre-read content is left untouched but is no longer part of the active application.

## Development

Netlify is the supported application runtime. Frontend development uses:

```powershell
pnpm dev:netlify
```

Run checks before deployment:

```powershell
pnpm lint
pnpm build:netlify
```

## Configure Supabase

1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Run [`supabase/migrations/202608120001_fcom_library.sql`](supabase/migrations/202608120001_fcom_library.sql).
3. In **Authentication → URL Configuration**, set the Site URL to the Netlify production URL.
4. Keep the Email authentication provider enabled.

The Supabase publishable key is browser-safe; row-level security protects user records. Never put a secret or service-role key in a `VITE_` variable.

## Deploy to Netlify

1. Import the Git repository into Netlify.
2. Let Netlify use `netlify.toml` for build settings.
3. Add `OPENAI_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` in **Site configuration → Environment variables**.
4. Deploy.

The OpenAI key is read only by Netlify functions and is never exposed to the browser.

## Current limitations

- Search is keyword-based, not vector semantic search.
- The first cloud migration runs in the open browser tab.
- Missing device thumbnails do not block lecture access, but the first-page preview requires the PDF to exist locally or in private cloud storage.
- FCOM.lib organizes study material; the original curriculum source remains authoritative.
