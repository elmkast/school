# FCOM.lib product specification

Last updated: August 29, 2026

## Product direction

FCOM.lib is a private, AI-assisted medical curriculum workspace. Its active product surface is intentionally narrow: a visual lecture archive, a slide reader with Luna and personal study tools, curriculum search, and session learning objectives (SLOs).

The current simplification is deliberate. Pre-reads and Question Bank were removed after prototyping because their first implementations added more interface and maintenance cost than study value. Question Bank may return later as a newly designed feature; the retired implementation is not a compatibility target.

## Active information architecture

The application has no sidebar and no separate Home route.

1. **Lectures** — default route and visual archive.
2. **SLOs** — objective review, filtering, Luna re-parsing, flagging, and export.
3. **Search** — entered through the persistent top search field.

Account sync, diagnostics, and lecture import remain available from the top bar.

## Active capabilities

### Lecture archive

- Displays the first page of every lecture PDF as a visual thumbnail.
- Groups lectures by course and curriculum week, with the most recent week first.
- Reveals lecture title and lecturer on hover or keyboard focus.
- Filters the archive by course using a dynamic course dropdown.
- Opens the selected PDF directly in the lecture viewer.
- Supports multi-PDF import with a visible processing queue.
- Uses Luna during import to propose lecture title, lecturer, course, summary, outline, and SLO structure.

### Lecture viewer

- Page-accurate PDF navigation with page number input and Q/E keyboard shortcuts.
- Luna chat scoped to the current and nearby pages; chat is intentionally non-persistent.
- Per-page autosaving notes.
- Persistent marked slides and SLO context.
- Persistent pen markup with undo.
- Independently collapsible PDF and Luna panes.
- Lecture deletion remains available inside the viewer with confirmation.

### SLO workspace

- Displays one standardized lecture card per SLO collection.
- Filters by curriculum week or flagged status.
- Sorts by week or lecture name.
- Expands and collapses a lecture's complete SLO list.
- Flags individual objectives persistently.
- Opens the originating lecture.
- Sends an objective list back to Luna for an approval-gated re-parse.
- Exports selected lecture SLOs to PDF or Excel.
- PDF export supports optional Strong / O.K. / Weak progress boxes and prevents a lecture's objective block from splitting inelegantly when possible.

### Search

- Catalog mode searches lecture titles, metadata, summaries, outlines, and SLOs.
- Source-text mode searches text extracted from individual PDF pages.
- Filters by academic year, course, and lecturer.
- Opens a matching slide or SLO at the relevant destination.

### Storage and hosting

- Netlify hosts the production Vite application and serverless Luna endpoints.
- Supabase Auth protects user access.
- Supabase Database stores synchronized lecture records.
- Supabase Storage stores private lecture PDFs.
- IndexedDB remains a device cache and supports migration of an older local library.

## Retired capabilities

### Pre-reads

Status: removed from the application and navigation. Existing legacy records are left untouched so feature retirement does not unexpectedly destroy reading content.

### Question Bank and quizzes

Status: removed. All embedded question arrays are stripped from lecture records and from legacy pre-read records during local or cloud library hydration. Question generation endpoints, quiz state, Question Bank UI, and question-specific Luna chat were deleted.

If Question Bank returns, it should begin from a new, focused product specification and a normalized storage model rather than restore the retired implementation.

## Near-term product focus

The next feature phase is a re-tool of SLOs. Product decisions should optimize fast objective review and study usefulness before adding another major content type.

Likely design questions for that phase:

- What is the smallest useful SLO review loop?
- Which Luna actions materially improve an objective instead of adding novelty?
- How should progress or confidence persist without making the page feel administrative?
- Which relationships among SLO, lecture, and source slide should be one click away?

## Engineering guardrails

- Prefer one canonical route and component per user concept.
- Do not preserve retired feature behavior unless explicitly requested.
- Keep AI edits approval-gated when they overwrite extracted or user-corrected study data.
- Keep PDFs and account data private by default.
- Run lint and the Netlify production build before deployment.
- Keep the visual archive functional with missing local thumbnails; a missing preview must never block lecture access.
