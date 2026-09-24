# lectures.lib

A private, searchable, AI-assisted lecture library for medical school. lectures.lib imports PDF decks, extracts page-level text, structures lecture metadata and SLOs with Luna, and synchronizes a private library through Supabase.

See the [product specification](docs/MEDLIBRARY_PRODUCT_SPEC.md) and [UX system](docs/UX_SYSTEM_SPEC.md) for current scope and design rules.

## Current product

- Visual lecture archive with first-page PDF previews
- Dynamic course filtering and newest-week-first grouping
- Multi-PDF import with visible sequential processing
- Full-screen PDF viewer with Luna-generated contents, marked slides, 60–400% zoom, touch gestures, and persistent Apple Pencil/pen markup
- Exact lecture, SLO, and extracted slide-text search
- SLO confidence board with priority review, persistent study sets, Luna re-parsing, and PDF/Excel export
- Session-only adaptive quizzes with verified lecture evidence, automatic quality recovery, and five-question buffering
- Supabase email/password accounts, private records, and private PDF storage
- Device caching plus one-time, non-destructive lecture migration to cloud
- Netlify production build and serverless AI endpoints

Question Bank, pre-reads, Concept Bank, lecture notes, and reader chat are intentionally retired. Quiz questions are generated for the active session and are not stored.

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
- lectures.lib organizes study material; the original curriculum source remains authoritative.
