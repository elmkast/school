# lectures.lib product specification

Last updated: September 23, 2026

## Product definition

lectures.lib is a private medical-curriculum workspace for importing lecture PDFs, reading and annotating slides, studying session learning objectives (SLOs), searching extracted content, and taking temporary AI-generated quizzes.

The product is intentionally narrow. Lectures and their SLOs are the durable source material. Quiz questions are generated for a study session and then discarded. The application does not maintain a permanent question bank, pre-read library, concept bank, or general-purpose AI chat.

## Information architecture

The application has one persistent top bar and no sidebar.

1. **Lectures** — the default visual archive.
2. **SLOs** — confidence tracking, priority review, study sets, re-parsing, and export.
3. **Quiz** — a modal, single-lecture adaptive quiz.
4. **Search** — opened automatically when text is entered in the top search field.

Lecture import, cloud sync, diagnostics, and account controls also live in the top bar. There is no separate Home page or UI-review route.

## Lecture archive

- Displays the first page of each PDF as the lecture's primary navigation object.
- Groups lectures by academic year, course, and curriculum week.
- Sorts weeks newest first and lectures alphabetically within a group.
- Filters by course using values derived from the current library.
- Reveals the lecture title and instructor on hover or keyboard focus.
- Loads previews lazily; an unavailable thumbnail never blocks opening the lecture.
- Opens the selected lecture directly in the full-screen PDF reader.

## Lecture import

- Accepts one or more PDF files in a batch.
- Processes files sequentially and shows extracting, analyzing, ready, and error states.
- Extracts page-level text in the browser.
- Uses Luna to propose title, course, instructor, summary, outline, SLOs, and optional table-of-contents data.
- Keeps processed lectures staged until the user reviews them.
- Checks page extraction, readable-text coverage, SLO detection, and AI-analysis fallback before finalization.
- Detects likely duplicates against both the saved library and the current batch using normalized filenames, metadata, page counts, and extracted slide-text similarity.
- Blocks structurally unusable imports. Possible duplicates require an explicit **Keep anyway** acknowledgement; informational quality warnings do not prevent import.
- Requires a title, course, instructor, and curriculum week before finalization.
- Allows title, course, instructor, and week to be corrected before saving.
- Finalizes the reviewed records and their PDFs into the private library.

## PDF reader

- Opens as a full-screen workspace with the PDF as the primary object.
- Navigates by previous/next controls, direct page position, the table of contents, marked slides, or Q/E keyboard shortcuts when focus is outside a text field.
- Supports zoom from 60% through 400%, button zoom, and touch gestures.
- Uses Luna to generate or rebuild a persistent table of contents with page links.
- Preserves the table-of-contents scroll position while navigating.
- Persists marked slides.
- Persists per-page ink using pen, highlighter, or eraser tools.
- Supports three stroke widths, four ink colors, undo, and redo.
- Handles Apple Pencil separately from touch so fingers can pan while the pencil writes.
- Can start a quiz with the open lecture preselected.
- Deletes the lecture and its PDF only after confirmation.

The current reader does not include slide notes or Luna chat.

## SLO workspace

- Presents every objective on a three-column confidence board: Weak, O.K., and Strong.
- Filters by course, curriculum week, instructor, and priority status.
- Marks individual objectives as priority.
- Changes confidence persistently per objective.
- Selects individual objectives or all currently visible objectives into a persistent study set.
- Studies the selected set one objective at a time with previous/next navigation, confidence controls, priority control, and a link to the originating lecture.
- Sends one lecture's objective list to Luna for re-parsing with an optional instruction.
- Requires review and explicit approval before replacing existing SLOs.
- Preserves matching priority, selection, and confidence state when a re-parse replaces equivalent text.
- Exports selected lectures' objectives to PDF or Excel.
- PDF export can include Strong / O.K. / Weak tracking boxes and avoids splitting a lecture block when practical.
- Export ordering supports curriculum week or instructor.

## Adaptive quiz

- Selects one lecture per quiz session; starting from the reader preselects that lecture.
- Prepares five validated questions before showing the first question.
- Shows one multiple-choice question at a time with four or five choices.
- Keeps at least 70% of the scheduled questions clinical and second-order.
- Replenishes one background question after every submitted answer.
- Adapts future topic choice and difficulty using actual correct and incorrect responses.
- Randomizes answer position while preserving rationales and the correct mapping.
- Displays the answer, explanation, reasoning steps, distractor rationales, and verified lecture excerpt after submission.
- Rejects malformed, duplicate, unsupported, or double-lead-in questions and regenerates them automatically within a finite retry budget.
- Never asks the user to manually retry a failed generation.
- Preserves prepared questions and the real score if future generation stops.
- Exits at any time and discards the questions, score, and adaptive state.

Quiz questions and quiz performance are not saved to Supabase or browser storage. See `ADAPTIVE_QUIZ.md` for generation, recovery, privacy, and test details.

## Search

- **Lectures & SLOs** searches lecture titles, course, instructor, summaries, outlines, and objective text.
- **Source text** searches extracted text and headings from individual PDF pages.
- Filters by academic year, course, and instructor.
- Sorts by relevance, week, or name.
- Opens a lecture, SLO, or slide at the relevant destination.

Search is currently lexical/keyword-based rather than vector semantic search. Image-only slide content is unavailable unless the PDF already contains extractable text.

## Accounts, storage, and diagnostics

- Netlify hosts the Vite application and authenticated serverless AI endpoints.
- Supabase Auth provides private email/password accounts and password recovery.
- Supabase Database stores each user's normalized lecture records.
- Supabase Storage stores private source PDFs.
- IndexedDB caches records and PDFs on the device and supports the one-time migration of an older local library.
- Cloud changes are saved locally first when possible; sync failures surface a visible status and diagnostics.
- Diagnostics record bounded technical context without API keys, raw lecture content, quiz questions, or answers.

## Retired features

The following features are not part of the active product and are not compatibility targets:

- Sidebar and nested curriculum filesystem
- Separate Home page
- Favorites destination
- Pre-reads
- Concept Bank
- Permanent Question Bank
- Saved quizzes
- Lecture notes
- Luna chat in the PDF reader
- Historical UI-review prototypes

Legacy internal storage names and Supabase bucket identifiers may retain their original `fcom` names to avoid disconnecting existing data. They are implementation details, not product branding.

## Current limitations

- Quizzes use one lecture at a time.
- Quizzes and performance do not resume after exit.
- Search does not use embeddings or OCR.
- Ink cannot yet be flattened into a downloadable annotated PDF.
- Cloud conflict resolution is last-write-oriented rather than a user-facing merge workflow.
- Initial cloud migration must remain open in the browser while it runs.
- AI output is structurally validated but still requires ordinary educational judgment.

## Engineering guardrails

- Preserve one canonical production component per user concept.
- Remove superseded prototypes instead of maintaining parallel implementations.
- Keep durable state centered on lectures, slides, SLOs, marks, and annotations.
- Keep AI overwrites approval-gated.
- Keep PDFs and curriculum data private by default.
- Never expose `OPENAI_API_KEY` or a Supabase secret/service-role key to the browser.
- Preserve stable storage identifiers unless a tested migration accompanies the change.
- A missing preview or AI enhancement must never block access to the original PDF.
- Run adaptive quiz tests, lint, and the Netlify production build before deployment.
