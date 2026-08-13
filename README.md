# FCOM.lib MVP

A private, searchable lecture-slide library for medical school. It imports PDF decks in the browser, extracts slide-level text, detects SLOs, syncs a private curriculum library through Supabase, and provides exact keyword search with page references.

See the [product feature and development specification](docs/MEDLIBRARY_PRODUCT_SPEC.md) for the complete feature register, architecture direction, risks, and phased roadmap.

## Included

- Home, Lectures, search, SLO, and Concept Bank views
- Two representative genetics lecture records
- Browser-based PDF text extraction (no visual analysis)
- Supabase email/password accounts, private cloud records, and private PDF storage
- Device-local caching with a one-time, non-destructive migration into the cloud library
- Netlify-ready production build
- In-session Luna chat grounded in the current slide and nearby lecture context
- Local PDF viewer and per-slide notes
- Persistent freehand pen markup on individual PDF pages with per-stroke undo
- Selectable PDF text with a persistent, page-linked concept bank, source-page highlights, and archive
- Academic-year folders, favorites, and removable lecture records
- A controlled page-by-page PDF reader so AI explanations match the visible page
- Editable course designations and direct lecture access from the SLO dashboard
- Sequential multi-PDF imports with current, next, completed, and failed queue states
- Persistent per-slide bookmarks with quick return links in the lecture reader
- Flagged lecture SLOs displayed inside the study companion below slide notes
- Matching collapsible academic-year/course trees for Lectures and SLO filtering
- Lecturer subfolders within every course, mirrored in Lectures and SLOs
- Persistent course, lecturer, and lecture-date editing
- Lecture sorting by date or name, with newest lecture date as the default
- Persistent per-SLO flags with a dedicated Flagged SLOs view
- Plain black-and-white SLO PDF export with year, course, lecturer, and lecture selection, date/lecturer ordering, last-name-only lecturer labels, and an optional Strong / O.K. / Weak progress tracker
- Editable SLO Excel export with last-name-only lecturer labels, lecture date, lecture title, SLO text, a Strong / O.K. / Weak dropdown, and notes
- Keep-together SLO pagination with repeated headings for unusually long lectures
- Clickable SLO folder breadcrumbs and larger objective text
- Grouped curriculum search across lectures, SLOs, slides, and pre-reads with modern filters and sorting
- Discreet Luna SLO re-parsing with optional instructions and review-before-replace
- Separate Lectures & SLO and exact Source text search modes
- Minimal Home view for flagged SLOs with direct lecture access
- Automatically expiring notifications and count-free SLO navigation
- Persistent pre-read library for PDF or pasted web readings
- Unread, Read, and Re-review pre-read states with a dedicated re-review queue
- Page-level PDF pre-read indexing and saved article-text search

## Run locally

Requires Node.js 22 and pnpm.

For the full local demo, create `.env.local` from `.env.example` and add your keys locally:

```text
OPENAI_API_KEY=your_key_here
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

Then run:

```bash
pnpm install
pnpm dev:local
```

Open `http://127.0.0.1:5173`. The Vite server keeps the OpenAI key off the browser. Supabase's publishable key is intentionally available to the browser; row-level security protects each user's data. IndexedDB remains a local cache. Luna chat is intentionally session-only and is cleared when a lecture is reopened.

## Configure Supabase once

1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Copy and run [`supabase/migrations/202608120001_fcom_library.sql`](supabase/migrations/202608120001_fcom_library.sql). This creates the three private tables, the private `fcom-library` Storage bucket, and per-user access policies.
3. In **Authentication → URL Configuration**, set the Site URL to the Netlify production URL. Add `http://127.0.0.1:5173/**` as an additional redirect URL while developing locally.
4. In **Authentication → Providers → Email**, keep Email enabled. Choose whether email confirmation is required; confirmation is recommended before inviting additional users.

On the first signed-in launch, FCOM.lib detects an empty cloud account and offers **Migrate this device**. Migration copies all local lecture records, PDFs, notes, markups, SLO flags, pre-reads, and concepts. It does not remove the local copies.

Browser data belongs to the exact origin that created it. To migrate an existing local library, start FCOM.lib at the same address originally used (for this project, `http://127.0.0.1:5173`), sign into the cloud account there, and choose **Sync this device** in the lower-left account area. Opening the Netlify site cannot directly read IndexedDB owned by `127.0.0.1`.

## Deploy to Netlify

1. Put this project in a Git repository and import it into Netlify, or use the Netlify CLI.
2. Netlify reads `netlify.toml`; no custom build settings are required.
3. Add `OPENAI_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` in **Site configuration → Environment variables**. The OpenAI key is server-only; the two `VITE_` values are the browser-safe Supabase project URL and publishable key.
4. Deploy.

The OpenAI key is read only by the Netlify function and is never exposed to the browser. Never place a Supabase secret key or service-role key in a `VITE_` variable.

## Current limitations

- Search is structured keyword search across lecture metadata, SLOs, slide text, and saved pre-read text. Semantic search belongs in a later phase.
- The first cloud migration runs in the open browser tab; keep that tab open until it reports completion.
- This tool organizes source material; it is not a substitute for verifying the original slide or medical guidance.
