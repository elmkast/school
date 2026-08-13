# FCOM.lib MVP

A private, searchable lecture-slide library for medical school. This MVP imports PDF decks in the browser, extracts slide-level text, detects SLOs, stores the trial library on the current device, and provides exact keyword search with page references.

See the [product feature and development specification](docs/MEDLIBRARY_PRODUCT_SPEC.md) for the complete feature register, architecture direction, risks, and phased roadmap.

## Included

- Home, Lectures, search, SLO, and Concept Bank views
- Two representative genetics lecture records
- Browser-based PDF text extraction (no visual analysis)
- Device-local trial persistence
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

For the full local demo, create `.env.local` from `.env.example` and add your key locally:

```text
OPENAI_API_KEY=your_key_here
```

Then run:

```bash
pnpm install
pnpm dev:local
```

Open `http://127.0.0.1:5173`. The Vite server keeps the OpenAI key off the browser, while lecture, pre-read, concept-bank records, and uploaded PDFs stay in IndexedDB on this device. Luna chat is intentionally session-only and is cleared when a lecture is reopened. If no key is present, importing, notes, the concept bank, and keyword search still work with local extraction.

## Deploy to Netlify

1. Put this project in a Git repository and import it into Netlify, or use the Netlify CLI.
2. Netlify reads `netlify.toml`; no custom build settings are required.
3. Add `OPENAI_API_KEY` in **Site configuration → Environment variables** to enable AI summaries.
4. Deploy.

Without an API key, PDF import, SLO detection, device-local storage, browsing, and keyword search still work. The OpenAI key is read only by the Netlify function and is never exposed to the browser.

## Trial limitations

- Uploaded data is saved in browser storage on one device; it does not sync across devices.
- The original PDF is stored locally in this browser for the slide viewer; it is not uploaded by the local demo.
- Search is structured keyword search across lecture metadata, SLOs, slide text, and saved pre-read text. Semantic search and cloud persistence belong in the next phase.
- This tool organizes source material; it is not a substitute for verifying the original slide or medical guidance.
