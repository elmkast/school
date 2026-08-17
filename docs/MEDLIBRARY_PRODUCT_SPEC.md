# FCOM.lib Product Feature and Development Specification

**Document status:** Living product specification  
**Version:** 1.7  
**Date:** August 14, 2026  
**Current product stage:** Cloud-connected private beta  
**Intended audience:** Product owner, design, engineering, and future implementation partners

## 1. Executive summary

FCOM.lib is an AI-powered medical-school lecture library. It converts lecture PDFs into a structured, searchable curriculum, preserves the original slides for study, and provides slide-specific AI assistance without requiring the student to leave the lecture context.

The current MVP proves the central workflow locally:

1. Import one or more lecture PDFs.
2. Extract slide-level text in the browser.
3. Use GPT-5.6 Luna to structure lecture metadata, SLOs, summaries, outlines, and slide references.
4. Browse lectures and SLOs through an academic-year/course hierarchy.
5. Read the original PDF page by page while requesting slide-specific explanations.
6. Save favorites, notes, course corrections, marked slides, and flagged SLOs on the current device.
7. Search across lectures, SLOs, slides, and assigned pre-reads or export selected SLOs as a clean PDF.
8. Track assigned pre-reads as unread, read, or re-review without mixing them into the lecture/SLO model.
9. Select one or more lectures—or individual PDF pages—ask Luna to draft multiple-choice study questions, review and edit every draft, and approve only the questions that should enter a persistent Question Bank.

The next major milestone is not another interface prototype. It is a cloud-foundation release that adds accounts, durable PDF storage, synchronized metadata, reliable background processing, and grounded AI retrieval across the curriculum.

## 2. Product vision

Create the fastest way for a medical student to move between source slides, course objectives, personal notes, and trustworthy AI explanation.

The product should feel like a personal curriculum operating system rather than a generic document repository or chatbot.

## 3. Product principles

- **Source first:** The original slide remains visible and authoritative.
- **AI in context:** AI actions start from a specific lecture, SLO, slide, or selected concept.
- **Fast navigation:** A student should move from library to course to slide with minimal clicks.
- **Structured by default:** Lecture metadata, SLOs, outlines, and slide text become reusable product data.
- **Correctable automation:** AI-generated metadata must be editable when extraction is imperfect.
- **Cost aware:** Expensive AI work should happen once during ingestion or only when explicitly requested.
- **Private by design:** The product is for educational material and personal study data, not patient records.
- **No visual analysis by default:** Text extraction is the default because it is faster and less expensive. Visual analysis is reserved for slides that require it.

### 3.1 Current visual language — Design B

Design B is a precision scientific workspace: neutral, highly functional, and deliberately less ornamental than the original academic-editorial treatment.

- Graphite navigation, white work surfaces, cool gray structure, and a restrained slate accent replace the original green-led palette.
- One system sans-serif family is used throughout for consistent rendering and a technical, instrument-like character.
- Corners are tighter, shadows are minimal, and borders carry most of the interface hierarchy.
- Decorative icons are removed from navigation, headings, empty states, and other places where text already communicates meaning.
- Icons remain when they encode an action or persistent state, including favorite, delete, flag, bookmark, close, upload/download, and external-link actions.
- Primary screens use one compact contextual label instead of repeating that context in a large page title.
- Objectives and outline entries share the same number marker, text size, alignment, spacing, and line height.
- Typography, radii, surfaces, accents, and core sizing are defined as reusable design variables so later visual experiments do not require rewriting the product layer.

The original “quiet academic modernism” Design A stylesheet is preserved in `.design-snapshots/design-a` and can be restored without changing application data or functionality.

## 4. Users and scope

### Primary user

A medical student managing dozens or hundreds of lecture decks across academic years, courses, and organ-system blocks.

### In-scope content

- Lecture PDFs
- Pre-read PDFs, saved article links, and pasted assigned reading text
- Course and academic-year metadata
- Session Learning Objectives (SLOs)
- Extracted slide text and headings
- AI-generated summaries and explanations
- Personal notes, favorites, and marked slides
- AI-drafted and user-approved study questions with lecture/page provenance

### Explicit constraints

- No patient-identifiable information, protected health information, or personally identifiable patient data.
- The application is an educational organizer, not a clinical decision-support system.
- AI answers must not replace checking the original lecture material.
- Copyrighted lecture material remains private to the account owner unless future institutional sharing is explicitly authorized.

## 5. Information architecture

The sidebar is the canonical curriculum navigation model:

```text
Home

Lectures
├── 2026-2027
│   ├── MCF
│   │   ├── Mitsouras
│   │   ├── Huwe
│   │   └── Vandal
│   ├── IMD
│   └── Hem Onc
└── 2027-2028
    ├── GI
    └── Renal

Pre-reads
├── Unread
├── Read
└── Re-review

SLOs
├── Flagged SLOs
├── 2026-2027
│   ├── MCF
│   │   ├── Mitsouras
│   │   ├── Huwe
│   │   └── Vandal
│   ├── IMD
│   └── Hem Onc
└── 2027-2028
    ├── GI
    └── Renal

```

Lectures, SLOs, and Question Bank use the same academic-year/course/lecturer taxonomy. Their filters remain independent so a user can inspect one lecture folder without losing a different study-data filter. Their section headers serve as complete-collection views, avoiding redundant "All" child nodes. Question Bank stores approved questions beneath their source lectures.

Pre-reads are a separate content type because they do not have lecture SLOs or lecturers. They retain academic-year and course metadata, source attribution, reading status, searchable source text, and an optional original link or locally stored PDF.

## 6. Current feature register

Status definitions:

- **Implemented:** Available in the current local MVP.
- **Partial:** Demonstrated, but requires hardening or cloud support.
- **Planned:** Required for the next product phase.
- **Candidate:** Valuable later, pending prioritization.

### 6.1 Lectures and organization

| Feature | Status | Current behavior | Production requirement |
|---|---|---|---|
| Lecture collection | Implemented | Displays imported lecture records and representative seed lectures | Cloud-synchronized account library |
| Visual lecture home | Implemented | Opens as the default landing page and presents the actual first page of each lecture PDF in an archival contact sheet grouped by course and curriculum week; hovering reveals the title and selecting a preview opens the lecture | Consider an optional compact/list switch only if the visual archive proves insufficient for a specific workflow |
| Academic-year folders | Implemented | Years are generated from lecture metadata | Persist and manage year metadata server-side |
| Course folders | Implemented | Courses are generated within each academic year | Course rename/merge and ordering controls |
| Lecturer subfolders | Implemented | Each course expands into lecturer-specific filters using the lecturers already in the library | Lecturer merge and canonical-name controls |
| Lectures root view | Implemented | The Lectures destination opens the complete collection across all years and courses in the two-level navigator | Server-side pagination for large libraries |
| Collapsible Lectures tree | Implemented | A dedicated curriculum column expands into years, courses, and lecturers; chevrons control expansion independently from folder selection | Persist expansion preference per device |
| Lecture sorting | Implemented | Sorts by manually assigned curriculum week, earliest first with unassigned lectures last, or lecture name A–Z | Persist sort preference per user |
| Favorites | Implemented | Mark/unmark lectures and retrieve them using the Favorited option in the Lectures Filter by menu | Sync favorites across devices |
| Lecture deletion | Implemented | Removes lecture metadata and local PDF after confirmation | Soft delete, recovery window, and storage cleanup job |
| Editable lecture details | Implemented | Manually correct course, select an existing lecturer or add a new lecturer, and assign Week 1 through Week 52 or leave the lecture unassigned; Luna does not infer the week | Add title and academic-year editing plus canonical lecturer management |
| Lecture detail panel | Implemented | Shows summary, editable course/lecturer/week metadata, every SLO, and a consistently formatted session outline without redundant count boxes | Full metadata editor and re-analysis controls |
| Lecture card study actions | Implemented | Keeps the primary brief action in a dedicated right-hand control and previews the full SLO list when the SLO badge is hovered or keyboard-focused | Add mobile tap behavior and usage testing |

### 6.2 Import and processing

| Feature | Status | Current behavior | Production requirement |
|---|---|---|---|
| Single PDF upload | Implemented | Imports a PDF from the browser | Signed cloud upload and validation |
| Multi-PDF upload | Implemented | Accepts multiple lecture decks in one selection or drop | Resumable uploads and duplicate detection |
| Sequential processing queue | Implemented | Shows queued, current, next, complete, and failed states | Durable background jobs that survive tab closure |
| Browser text extraction | Implemented | Extracts text page by page with PDF.js | Server fallback for malformed or large PDFs |
| Text-first processing | Implemented | Avoids routine visual analysis | Selective OCR/vision for image-only slides |
| AI lecture structuring | Implemented | Luna produces structured lecture metadata and brief content | Versioned prompt, schema validation, retries, and evaluation suite |
| Local fallback | Implemented | Lecture still imports when AI analysis is unavailable | Retry action and visible processing status |
| Duplicate handling | Partial | User can remove accidental duplicate imports | File hash, title similarity check, and pre-import warning |
| Processing provenance | Planned | — | Store prompt version, model, timestamp, token usage, and analysis status |

### 6.3 SLO management

| Feature | Status | Current behavior | Production requirement |
|---|---|---|---|
| SLO extraction | Implemented | Local detection plus AI structuring | Confidence score and source-slide reference for every SLO |
| SLO dashboard | Implemented | Groups objectives by lecture | Sorting and compact/expanded display options |
| SLO curriculum tree | Implemented | Mirrors the Lectures year/course/lecturer hierarchy | Persist filter in URL for sharing/bookmarking |
| Course- and lecturer-filtered SLOs | Implemented | The SLOs header opens the complete objective collection; year, course, and lecturer nodes narrow it | Search and multi-course filters |
| Clickable SLO breadcrumbs | Implemented | Year, course, and lecturer labels provide a second path through the active SLO hierarchy | Persist breadcrumb scope in URL |
| Open lecture from SLOs | Implemented | Opens the corresponding lecture brief | Open the specific source slide for an SLO |
| Flagged SLOs | Implemented | Flag/unflag individual objectives, persist flags locally, and review them in a dedicated sidebar view | Sync flags across devices and add flagged-only study mode |
| SLO PDF export | Implemented | Select multiple lectures individually or by academic year, course, or lecturer; order lecture/SLO blocks by curriculum week or lecturer; show only the lecturer's last name and assigned week in compact PDF metadata; optionally add fixed Strong / O.K. / Weak assessment boxes beside every objective; and download a plain black-and-white PDF. Each lecture is kept on one page whenever possible, while oversized lectures break only between objectives and repeat their heading | Server-generated exports for very large selections and optional source-page references |
| SLO Excel export | Implemented | Reuses the same lecture selection and week/lecturer ordering controls to download one editable tracker row per SLO with the lecturer's last name, Week, Lecture Title, SLO Text, a validated Strong / O.K. / Weak Progress field, and Notes | Add optional cloud re-import if workbook progress should later synchronize back into FCOM.lib |
| Luna SLO re-parse | Implemented | Re-read extracted objective-slide text with an optional user instruction, review/edit Luna’s proposed list, and explicitly approve replacement | Add source-page citations, correction history, and selective visual fallback |
| Manual SLO correction | Planned | — | Add, edit, delete, reorder, and confirm extracted SLOs |
| SLO coverage map | Candidate | — | Show which slides and concepts support each objective |

### 6.4 Pre-read management

| Feature | Status | Current behavior | Production requirement |
|---|---|---|---|
| Separate pre-read library | Implemented | Stores assigned readings independently from lectures and SLOs | Cloud-synchronized pre-read records and private ownership rules |
| PDF pre-read ingestion | Implemented | Saves the PDF locally and extracts searchable text page by page | Signed cloud upload, OCR fallback, and processing jobs |
| Web/article pre-read ingestion | Implemented | Saves title, author/source, optional original link, and pasted searchable reading text | Safe server-side article import where licensing and site policies permit |
| Reading status | Implemented | Persists Unread, Read, and Re-review per item | Cross-device sync and optional completed date/history |
| Re-review queue | Implemented | Dedicated sidebar filter contains items explicitly marked Re-review | Study scheduling and reminders |
| Pre-read source access | Implemented | Opens local PDFs or original web links; saved text remains readable in-app | Authenticated cloud file viewer and link-health checks |
| Pre-read deletion | Implemented | Removes metadata, saved text, and local PDF after confirmation | Soft delete and recovery window |
| AI pre-read brief | Planned | — | Optional Luna summary, concepts, and user-directed re-analysis grounded in the reading |

### 6.5 PDF reader and study workflow

| Feature | Status | Current behavior | Production requirement |
|---|---|---|---|
| Embedded PDF reader | Implemented | Renders the stored lecture PDF page by page | CDN delivery, range requests, and loading optimization |
| Reader close placement | Implemented | The close control is in the upper-right of the study companion, matching the overall modal edge | Preserve predictable placement across responsive layouts |
| Synchronized page number | Implemented | App controls the visible PDF page and uses the same page for AI | Preserve page on close/reopen |
| Previous/next navigation | Implemented | Buttons, direct page input, and arrow-key navigation | Touch gestures and thumbnail rail |
| Slide-specific notes | Implemented | Saves a note per PDF page through the Note drawer beneath the conversation composer | Autosave, cloud sync, edit history, and export |
| Freehand PDF markup | Implemented | A Pen mode draws persistent red freehand strokes on the current PDF page; Undo ink removes the most recent stroke | Add colors, stroke widths, eraser, stylus pressure, and cloud sync |
| Marked slides | Implemented | Mark/unmark slides and jump back through a compact contextual drawer beneath the conversation composer | Cross-device sync and optional marked-slide review mode |
| Selectable PDF text | Implemented | Adds a PDF.js text layer so words and phrases can be highlighted directly on the rendered page | Preserve selection accuracy across rotations, OCR, and unusual embedded fonts |
| Luna slide chat | Implemented | Uses a conversation-first, ChatGPT-inspired companion with a single-question empty state and anchored composer; answers directly from medical knowledge, using nearby slides silently as optional context, and does not persist messages | Streaming output, optional source citations on request, retry, and feedback controls |
| Flagged SLOs in reader | Implemented | Makes the current lecture's flagged objectives available through a compact contextual drawer beneath the conversation composer | Link objectives to exact supporting slides |
| Go deeper on slide | Planned | — | Choose explanation depth and focus without leaving the reader |
| Slide-linked flashcards | Candidate | — | Generate editable cards with source-page citations |
| Study session mode | Candidate | — | Review marked slides, notes, and SLOs as a queue |

### 6.6 Question Bank

| Feature | Status | Current behavior | Production requirement |
|---|---|---|---|
| Luna question drafting | Implemented | Generates up to 100 multiple-choice medical-study questions from lecture material, selected SLOs, or assigned pre-reads; larger requests run as parallel batches of no more than 20 using the same strict server-side structured-output schema | Add prompt/version provenance, latency and token instrumentation, duplicate detection across batches, and a representative quality evaluation set |
| Flexible source selection | Implemented | Switch between lecture/page, SLO-only, and pre-read modes; select entire folders or individual sources, with direct drafting entry points from SLO and pre-read pages | Add selected text-range support |
| Draft review gate | Implemented | Nothing enters the bank automatically; every multiple-choice draft can be edited, approved/rejected, or removed before saving | Add duplicate-question detection and richer answer-choice validation |
| Persistent approved questions | Implemented | Approved questions preserve explicit source kind plus lecture, pre-read, SLO-index, and page provenance as applicable; pre-read questions persist with their source reading | Add revision history, soft deletion, and explicit sync-conflict handling |
| Question Bank curriculum tree | Implemented | Mirrors the Lectures/SLO year, course, and lecturer hierarchy and counts approved questions within each folder | Add user-created sets, tags, and multi-course filters only after the core practice workflow is validated |
| Source-page return | Implemented | Every approved question can reopen its source lecture at the cited PDF page | Highlight the supporting passage when reliable text coordinates are available |
| Compact bank browsing | Implemented | Lecture groups are collapsed by default and show question counts, reducing the need to scroll through every full question card | Add text search and question-type filters when the bank becomes substantially larger |
| Quiz builder | Implemented | Select any combination of lectures with per-lecture question counts, choose up to 100 questions, and start a non-persistent randomized attempt. Optional history filters combine as `not seen before OR previously answered incorrectly`, while the curriculum-week filter is applied with `AND`; matching counts and source selection update before the quiz begins | Add flagged-only and difficulty settings without cluttering the initial builder |
| Focused quiz session | Implemented | Shows one question at a time, randomizes question and answer-choice order, grades multiple choice automatically, and reveals the saved answer and explanation after submission; persistent Previous/Next controls allow free movement while retaining each response, and results remain gated until every question is complete | Add keyboard shortcuts and optional timing only if needed |
| Quiz results and review | Implemented | Calculates percent correct and opens a one-question-at-a-time review of every incorrect response; complete attempts are intentionally not persisted, but per-question aggregate counts for seen, correct, and incorrect answers are retained for future quiz filtering | Add spaced repetition, richer longitudinal performance history, and SLO-level analytics as opt-in later capabilities |
| Question-specific Luna chat | Implemented | Opens a non-persistent discussion from Question Bank or an active quiz question; Luna can explain, challenge, or clarify the item using general medical knowledge | Add optional source retrieval and feedback instrumentation |
| Approval-gated AI question editing | Implemented | An edit request produces a complete four-choice replacement in a separate review panel; the stored question remains unchanged until the student explicitly approves, and an edited active quiz item resets its response | Add revision history and side-by-side textual diff highlighting |

#### Planned Question Bank expansion

The next Question Bank release should treat a question's source as explicit structured provenance rather than assuming every question came from a lecture page.

1. **SLO-only drafting — implemented:** Select SLOs across one or more lectures and ask Luna for original NBME-style questions aligned to those objectives. This mode may use broader medical knowledge to construct a useful vignette, while retaining the selected SLOs as the pedagogic target and clearly distinguishing them from page-grounded questions.
2. **Pre-read drafting — implemented:** Select one or more assigned pre-reads as grounded question sources. Indexed PDF pages retain page provenance; saved article text retains pre-read provenance.
3. **Source-aware organization:** Filter and sort by source kind (`lecture`, `slide`, `SLO`, or `pre-read`), academic year, course, lecturer, originating lecture/pre-read, and quality signal. A question may retain both a pedagogic SLO link and supporting lecture/page links.
4. **Large-pool quiz sampling:** Let the student choose how many questions to draw from a selected pool so a lecture with 100 questions does not consume the entire 100-question quiz limit.
5. **In-quiz curation:** Delete a bad question immediately while taking a quiz, with confirmation, and mark a particularly useful question as **Great question** for later filtered review.
6. **Variable answer-choice count:** Permit four, five, or six choices. Luna should use more than four only when the additional distractors are distinct and educationally credible; the schema must enforce 4–6 choices and exactly one matching answer.
7. **Question-specific Luna chat — implemented:** Provide a non-persistent chat from Question Bank and the active quiz question for explanations, clarification, discussion, and approval-gated revisions without forcing the student back to the lecture viewer.

### 6.7 Search and retrieval

| Feature | Status | Current behavior | Production requirement |
|---|---|---|---|
| Exact keyword search | Implemented | Searches lecture metadata, summaries, SLOs, extracted slide text, pre-read metadata, and saved pre-read source text | Indexed server-side search for large libraries |
| Explicit search sources | Implemented | Separates Lectures & SLO metadata search from exact Source text search across slides and pre-reads | Persist the selected search source per user |
| Grouped search results | Implemented | Separates matching lectures, SLOs, slides, and pre-reads into scannable result groups | Virtualize or paginate large result sets |
| Search filters | Implemented | Filters by academic year and course across supported sources; lecturer applies to lecture/SLO/slide results | Add source-type, status, marked, flagged, curriculum-week, and multi-select filters |
| Search sorting | Implemented | Sorts by relevance, curriculum week, or source name | Tune relevance with usage data and source-confidence signals |
| Search result page references | Implemented | Opens the exact lecture slide or pre-read PDF page when available | Highlight matched text on the source/side panel |
| Semantic search | Planned | — | Retrieve conceptually related slides across all lectures |
| Grounded curriculum Q&A | Planned | — | Answer only from selected curriculum scope with page-level citations |
| Saved searches | Candidate | — | Re-run recurring curriculum queries |

### 6.8 Account, storage, and platform

| Feature | Status | Current behavior | Production requirement |
|---|---|---|---|
| Device-local persistence | Implemented | IndexedDB stores lecture and pre-read records/PDFs plus notes, favorites, marks, flags, and reading statuses | Remains useful for cache/offline support only |
| Netlify deployment build | Implemented | Production client and serverless AI functions build successfully | Automated preview and production deployments |
| Server-side API key | Implemented | OpenAI key is not sent to the browser | Secret rotation and environment separation |
| User authentication | Implemented | Supabase email/password accounts gate the private library | Harden recovery, email confirmation, and account deletion |
| Cloud PDF storage | Implemented | Private Supabase Storage bucket stores lecture and pre-read PDFs | Add upload verification, quotas, and backup policy |
| Cloud metadata database | Implemented | Supabase records synchronize lecture, pre-read, concept, question, and study metadata | Normalize high-growth question and slide data into dedicated tables as scale requires |
| Cross-device synchronization | Implemented | Signed-in devices load and save the same private curriculum library | Add explicit conflict handling and last-write visibility |
| Self-expiring notices | Implemented | Success and error notices dismiss automatically after a short period and remain manually dismissible | Add accessible live-region priority by notice type |
| Offline support | Candidate | Current local architecture proves feasibility | Explicit cache policy and conflict resolution |
| SLO document export | Implemented | Generates a simple readable PDF entirely in the browser | Cloud export history and optional saved templates |
| Full library export and backup | Planned | — | Export metadata/notes and download or restore library backup |

## 7. AI product specification

### 7.1 Current AI jobs

The current application uses the configured GPT-5.6 Luna model for four bounded jobs:

1. **Ingestion analysis:** Convert extracted lecture text into structured metadata, summary, outline, SLOs, and slide records.
2. **In-session slide chat:** Answer the user's question directly, using the current slide, nearby slide context, and a short non-persistent conversation window only when they help interpret or answer the question.
3. **SLO correction:** Re-parse a lecture’s extracted text with an optional user instruction and return an editable proposal that requires explicit approval.

4. **Question drafting:** Generate multiple-choice drafts from explicitly selected lecture pages, SLO targets, or pre-read content; require human review before persistence. SLO mode may use broader medical knowledge for original NBME-style assessment, while lecture and pre-read modes stay grounded in selected source text. New question creation is intentionally multiple-choice only; any legacy short-answer records remain readable.

GPT-5.6 Luna is intended for cost-sensitive workloads and supports structured outputs and the Responses API. The production implementation should retain Luna as the default model while allowing model configuration by job type. See the [official model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

### 7.2 Required AI quality controls

- Validate every ingestion response against a strict JSON schema.
- Store the source page for extracted SLOs, outline sections, and key facts.
- Never silently replace source text with generated text.
- Label AI-generated content and make it regenerable.
- Provide manual correction for every critical field.
- Record model, prompt version, response status, latency, and token usage.
- Create a small evaluation set from representative course decks before changing prompts or models.
- Test title, course, lecturer, SLO, and page-reference accuracy separately.

### 7.3 Grounding strategy

Near-term grounded answers should use application-managed retrieval:

1. Split extracted slide text into page-addressable records.
2. Index those records for semantic retrieval.
3. Filter retrieval by the user's selected scope: slide, lecture, course, year, or entire library.
4. Pass only the highest-value source passages to the model.
5. Require citations containing lecture ID, lecture title, and PDF page.
6. Let the user open every cited page directly.

OpenAI file search is also supported by Luna and can be evaluated as an alternative to application-managed vectors. The decision should be based on citation control, storage cost, latency, deletion behavior, and portability—not implementation convenience alone.

### 7.4 Cost controls

- Analyze each lecture once and cache the structured result.
- Send extracted text instead of the PDF when visual information is unnecessary.
- Limit slide explanations to the current slide plus a small context window.
- Set explicit maximum output sizes for every job.
- Cache repeated explanations when the source and prompt version are unchanged.
- Use a project-specific API key and tag usage by environment and job type.
- Add a user-visible monthly usage estimate before any high-cost action.
- Monitor model and tool usage through OpenAI project usage/cost reporting; see the [official Usage API reference](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage).

## 8. Recommended production architecture

### 8.1 Current Netlify-first architecture

```text
Browser
├── React/Vite interface
├── PDF.js text extraction and page rendering
├── Supabase Auth, private records, and private PDF storage
└── IndexedDB device cache

Netlify Functions
└── Server-side OpenAI API requests
```

Netlify is the only supported server runtime. The former standalone local AI server was retired in August 2026 to prevent duplicated prompts, schemas, and environment-specific behavior. Frontend modules are organized by responsibility: PDF rendering, curriculum navigation, curriculum search, persistence, document export, and question-domain utilities. Further extraction should remain incremental and behavior-preserving rather than becoming a rewrite.

### 8.2 Target cloud architecture

```text
Web client
├── Home, Lectures, SLO, Question Bank, search, and reader interface
├── Local cache for responsiveness
└── Direct private upload using signed URLs

Application/API layer
├── Authentication and authorization
├── Lecture and study-data APIs
├── Background-job orchestration
├── Retrieval and citation assembly
└── OpenAI API proxy

Managed data services
├── Relational database: users, lectures, slides, SLOs, notes, marks, jobs
├── Object storage: original PDFs and derived artifacts
└── Search/vector index: semantic slide retrieval
```

For the previously discussed Netlify/Supabase deployment, the likely mapping is:

- **Netlify:** web hosting, deploy previews, serverless/edge API functions.
- **Supabase Auth:** private user accounts.
- **Supabase Postgres:** lecture and pre-read metadata, slide/page records, SLOs, notes, favorites, reading statuses, bookmarks, and job status.
- **Supabase Storage:** private lecture/pre-read PDFs and optional rendered thumbnails.
- **OpenAI API:** lecture structuring, explanations, and grounded question answering.

This mapping is now the working private-beta architecture. Future work should harden it rather than reintroduce a parallel local backend.

## 9. Core production data model

### User

- `id`
- `email`
- `created_at`
- `preferences`

### AcademicYear

- `id`
- `user_id`
- `label`
- `sort_order`

### Course

- `id`
- `user_id`
- `academic_year_id`
- `name`
- `sort_order`

### Lecture

- `id`
- `user_id`
- `course_id`
- `title`
- `lecturer`
- `lecture_date`
- `summary`
- `outline`
- `source_file_key`
- `source_file_hash`
- `page_count`
- `processing_status`
- `analysis_model`
- `analysis_prompt_version`
- `created_at`
- `updated_at`
- `deleted_at`

### Slide

- `id`
- `lecture_id`
- `page_number`
- `heading`
- `extracted_text`
- `search_embedding`
- `extraction_status`

### SLO

- `id`
- `lecture_id`
- `position`
- `text`
- `source_page_number`
- `confidence`
- `confirmed_by_user`

### StudyState

- `user_id`
- `lecture_id`
- `slide_id`
- `note`
- `is_marked`
- `updated_at`

### Favorite

- `user_id`
- `lecture_id`
- `created_at`

### PreRead

- `id`
- `user_id`
- `course_id`
- `title`
- `author_or_source`
- `source_type` (`pdf` or `web`)
- `source_url`
- `source_file_key`
- `extracted_text`
- `reading_status` (`unread`, `read`, or `rereview`)
- `created_at`
- `updated_at`
- `deleted_at`

### PreReadPage

- `id`
- `pre_read_id`
- `page_number`
- `heading`
- `extracted_text`
- `search_embedding`

### ProcessingJob

- `id`
- `lecture_id`
- `job_type`
- `status`
- `progress`
- `attempt_count`
- `error_code`
- `started_at`
- `completed_at`

### Question

- `id`
- `lecture_id`
- `source_kind` (`lecture`, `slide`, `slo`, or `preread`; planned normalization)
- `source_record_ids` (planned; supports multiple selected SLOs or sources)
- `question_type` (`multiple-choice` for all newly created questions; legacy `short-answer` records remain supported for display)
- `prompt`
- `options`
- `answer`
- `explanation`
- `source_page_numbers`
- `generation_model`
- `generation_prompt_version`
- `approved_at`
- `times_seen`
- `times_correct`
- `times_incorrect`
- `last_answered_at`
- `quality_signal` (`great`, neutral, or soft-deleted; planned)
- `created_at`

## 10. Primary user flows

### Flow A: Import a semester of lectures

1. Select or drop multiple PDFs.
2. Files upload immediately while processing jobs queue.
3. The queue shows current, next, completed, and failed lectures.
4. Each completed lecture appears in the detected year/course folder.
5. The user reviews metadata and SLOs, then corrects any errors.
6. Duplicate warnings prevent accidental re-import.

### Flow B: Study a lecture

1. Open Lectures, year, course, and lecture.
2. Review the brief and SLOs.
3. Open the PDF reader at page 1 or a search result page.
4. Navigate slides, chat with Luna, mark slides, highlight concepts, and write notes.
5. Reopen marked slides later from the reader.
6. Review flagged SLOs for the lecture below the note editor.

### Flow C: Review objectives by course

1. Expand SLOs.
2. Choose an academic year and course.
3. Review every lecture's objectives in that course.
4. Open a source lecture directly.
5. In a future release, open the exact source slide for each objective.

### Flow E: Manage assigned pre-reads

1. Add an assigned PDF, or save a web article with its title, source link, and pasted text.
2. The app indexes PDF pages or saved article text for keyword search.
3. Keep the item Unread until reviewed, mark it Read when complete, or mark it Re-review to preserve a focused return queue.
4. Search Source text to retrieve the pre-read alongside matching lecture slides.
5. Open the original source or locally stored PDF from the result.

### Flow F: Draft and approve study questions

1. Open Question Bank and choose Draft with Luna, or start from the current PDF page.
2. Choose lecture material, SLOs, or pre-reads; select one or more sources, request up to 100 questions, and optionally tell Luna what kind of questions to emphasize.
3. Review Luna's structured drafts; edit wording, answer choices, answer, and explanation as needed.
4. Approve useful questions and reject or remove the rest.
5. Open approved questions through the mirrored curriculum tree and return to any cited source page.

## 11. Non-functional requirements

### Performance

- Navigation interactions should feel immediate.
- Previously opened lecture metadata should render from cache.
- PDF pages should render without reloading the entire document.
- Upload and analysis must not block browsing existing lectures.
- Pre-read status changes should persist immediately and never require reprocessing source text.
- Large libraries require server-side pagination or incremental loading.

### Reliability

- Uploads must be resumable or retryable.
- Background jobs must survive browser closure.
- AI failures must never discard a successfully uploaded PDF.
- Metadata updates must use stable IDs and transactional writes.

### Security and privacy

- PDFs are private by default.
- Every database and storage request must enforce user ownership.
- API keys remain server-side.
- Signed file URLs should expire.
- Logs should avoid storing full lecture content unless required and documented.
- Account deletion must remove metadata, notes, search indexes, and stored files.

### Accessibility

- All controls must be keyboard reachable.
- Collapsible navigation must expose `aria-expanded` state.
- Focus must move predictably when opening and closing the reader.
- Color must not be the only indicator of selection or processing status.
- Reader controls require accessible labels at mobile and desktop sizes.

### Observability

- Capture upload failures, processing failures, AI schema errors, and viewer errors.
- Track job latency by phase: upload, extraction, AI, indexing, and save.
- Track AI usage by job type and model.
- Avoid storing lecture content in analytics events.

## 12. Delivery roadmap

### Phase 0 — Functional MVP

**Status:** Substantially complete

- Local PDF import and storage
- AI lecture brief generation
- Home, Lectures, and SLO navigation
- PDF reader
- In-session Luna slide chat
- Favorites, deletion, notes, and marked slides
- Selectable PDF text
- Flagged lecture SLOs inside the reader
- Persistent SLO flags and SLO PDF export
- Luna-assisted SLO re-parsing with optional correction instructions and approval
- Persistent pre-read library with PDF/text ingestion and Unread, Read, and Re-review filters
- Grouped keyword search with separate Lectures & SLO and Source text modes across lectures, slides, and pre-reads
- Multi-file processing queue
- Luna question drafting from lectures/pages, selected SLOs, or pre-reads, with human approval and explicit persistent provenance

**Exit condition:** The owner can study real lectures and identify workflow gaps.

### Phase 1 — Cloud foundation

**Status:** Private-beta foundation implemented; hardening remains

- Authentication
- Private object storage
- Relational metadata database
- Cross-device sync
- Durable processing jobs
- Duplicate detection
- Complete metadata/SLO editor
- Migration utility for locally stored lectures
- Error monitoring, backups, and account deletion

**Exit condition:** A private account can upload, process, edit, and study lectures reliably from two devices.

### Phase 2 — Grounded curriculum intelligence

- Semantic slide indexing
- Advanced multi-select, marked, flagged, and curriculum-week search filters
- Page-level citations
- Grounded curriculum Q&A
- Clickable concept explanations
- Explanation depth controls
- AI response caching and usage reporting
- Prompt/model evaluation harness

**Exit condition:** AI answers are traceable to specific lecture pages and useful across dozens of decks.

### Phase 3 — Study system

- Marked-slide review mode
- Source-aware Question Bank filters for lecture/page, SLO, and pre-read provenance
- Source-aware Question Bank filters and large-pool quiz sampling
- In-quiz delete and Great question curation controls
- Four-to-six-choice question support with validated distractors
- Question revision history and side-by-side change highlighting for Luna-proposed edits
- SLO coverage mapping
- Saved AI explanations
- Flashcard generation with citations
- Spaced repetition, longitudinal quiz history, and SLO-level performance analytics
- Note export and backup
- Study history and lightweight progress signals

**Exit condition:** The application supports repeat study, not only lecture retrieval.

### Phase 4 — Product hardening

- Performance testing with hundreds of lectures
- Accessibility audit
- Security review
- Cost dashboards and user limits
- Mobile reader refinements
- Support/admin workflows
- Optional institutional deployment analysis

## 13. Next milestone acceptance criteria

The cloud-foundation release is complete when:

- A user can create an account and sign in securely.
- A PDF uploaded on one device is available on another.
- Lecture metadata, SLOs, favorites, notes, and marked slides synchronize.
- Multi-file jobs continue when the browser tab closes.
- Failed jobs can be retried without re-uploading the source file.
- Duplicate PDFs are detected before processing charges occur.
- All AI-generated critical fields can be manually corrected.
- Deleting a lecture removes its search records and schedules its PDF for deletion.
- The application can restore its primary library view in under two seconds under normal conditions.
- AI usage and estimated cost can be attributed to lecture ingestion versus interactive study.

## 14. Risks and mitigations

| Risk | Product impact | Mitigation |
|---|---|---|
| AI extracts incorrect SLOs or metadata | Loss of trust and poor organization | Confidence indicators, source pages, manual editing, eval set |
| Image-heavy or scanned slides lack text | Missing search and explanation context | Detect low-text pages and offer selective OCR/vision |
| Large lectures increase latency/cost | Slow imports and budget surprises | Chunking, one-time analysis, caching, output limits, queue estimates |
| Duplicate uploads waste storage/API usage | Unnecessary cost and clutter | File hashes and similarity warnings before AI processing |
| Browser-only data is lost | Loss of notes and study history | Cloud sync, export, backups, local cache only as secondary copy |
| PDF rendering regressions | Core study flow blocked | Representative PDF test set and viewer error telemetry |
| Grounded answers cite wrong pages | False confidence | Page-addressable retrieval, citation validation, open-source action |
| Vendor coupling | Difficult future migration | Keep canonical metadata and retrieval records in application-owned schema |
| Unauthorized access to lecture materials | Privacy/copyright concern | Per-user access policies, signed URLs, audit logs, deletion controls |

## 15. Product success measures

Initial measures should focus on usefulness and reliability rather than growth:

- Percentage of uploaded lectures processed successfully
- Median time from upload to usable lecture brief
- Percentage of AI-detected course/SLO fields manually corrected
- Search-to-slide-open conversion rate
- Percentage of study sessions using slide explanations, notes, or marks
- Percentage of Luna-drafted questions approved after review and approved questions revisited
- Number of marked slides revisited
- AI cost per imported lecture and per active study session
- Viewer error rate
- Weekly returning usage during an active course block

## 16. Open product decisions

1. Should the first cloud release use Netlify plus Supabase, or consolidate hosting and storage on another platform?
2. Should semantic retrieval be application-managed or use OpenAI file search?
3. Which lecture fields must be editable in the first cloud release beyond course designation and SLOs?
4. Should generated explanations be saved automatically, on demand, or regenerated each time?
5. How long should deleted PDFs remain recoverable?
6. Should selective visual analysis be automatic for low-text slides or explicitly requested by the user?
7. What monthly AI budget should trigger warnings or temporary limits?

## 17. Immediate recommended backlog

1. Finalize the cloud provider decision and target monthly budget.
2. Define the production database and storage policies.
3. Build a thin authenticated upload/read proof of concept with one lecture.
4. Extend the current course/lecturer/week editor with title, academic year, and complete SLO correction.
5. Move import processing to durable background jobs.
6. Add file-hash duplicate detection.
7. Design local-to-cloud migration for the existing IndexedDB library.
8. Create a representative PDF evaluation set and AI accuracy rubric.
9. Implement page-addressable semantic search with citations.
10. Add usage and cost instrumentation before expanding interactive AI features.
