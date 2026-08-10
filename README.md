# MedLibrary MVP

A private, searchable lecture-slide library for medical school. This MVP imports PDF decks in the browser, extracts slide-level text, detects SLOs, stores the trial library on the current device, and provides exact keyword search with page references.

## Included

- Library, search, and SLO dashboard
- Two representative genetics lecture records
- Browser-based PDF text extraction (no visual analysis)
- Device-local trial persistence
- Netlify-ready production build
- Optional server-side OpenAI lecture structuring

## Run locally

Requires Node.js 22 and pnpm.

```bash
pnpm install
pnpm dev:netlify
```

Open the local URL shown in the terminal.

## Deploy to Netlify

1. Put this project in a Git repository and import it into Netlify, or use the Netlify CLI.
2. Netlify reads `netlify.toml`; no custom build settings are required.
3. Add `OPENAI_API_KEY` in **Site configuration → Environment variables** to enable AI summaries.
4. Deploy.

Without an API key, PDF import, SLO detection, device-local storage, browsing, and keyword search still work. The OpenAI key is read only by the Netlify function and is never exposed to the browser.

## Trial limitations

- Uploaded data is saved in browser storage on one device; it does not sync across devices.
- The original PDF is not uploaded or permanently stored in this MVP.
- Search is exact keyword search. Semantic search and cloud persistence belong in the next phase.
- This tool organizes source material; it is not a substitute for verifying the original slide or medical guidance.
