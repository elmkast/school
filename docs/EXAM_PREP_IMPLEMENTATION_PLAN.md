# Exam Prep implementation plan

Prepared September 27, 2026. Status: **implemented; pending authenticated live-content and device QA**.

This is the implementation handoff for the next development model. It is based on the current Netlify implementation at commit `c435c2a`, including the existing adaptive quiz and import checks. Read this document and the referenced source before editing. The product specification continues to describe shipped behavior until each new capability is implemented and verified.

## 1. Product contract

Exam Prep assembles any number of selected lectures into one ongoing generative multiple-choice study session. It begins with content checks and first-order reasoning, then introduces harder application and NBME-style clinical integration as the learner demonstrates understanding. Incorrect answers influence both what comes next and the difficulty of subsequent questions.

### User requirements

- Select multiple lectures with no application-imposed lecture-count limit.
- Generate original questions during the session.
- Adapt to actual correct and incorrect answers.
- Start primarily with foundational knowledge and first-order questions.
- Progress toward difficult clinical vignettes requiring linked inferences.
- Do not impose the existing quiz's 70% clinical / 30% knowledge policy on Exam Prep.
- Retain the quiet, compact interface and automatic recovery established in the current quiz.

### Defaults to implement unless the user changes them

1. Add **Exam prep** alongside **Quiz** in the top navigation. The current single-lecture Quiz and its reader shortcut keep their existing behavior.
2. Use four or five choices and one best answer. Reuse answer shuffling and per-choice explanations.
3. Prepare five valid questions before presenting the first one; replenish as answers are submitted.
4. Run indefinitely until Exit. No arbitrary question limit, timer, fixed-length exam, or persistent question bank.
5. Session answers, generated questions, and adaptive state remain in memory and reset on exit or reload, matching the current quiz. Pause/resume and named saved exam sets are deferred.
6. Every initial-release question has one primary lecture and topic. The session interleaves all selected lectures; questions integrating evidence across different lectures are a later enhancement.
7. All difficulty starts fresh. Existing self-rated SLO confidence is not treated as demonstrated quiz performance.
8. Source text is the existing extracted slide text. SLOs may help label material but are not independent authorization to test facts absent from the slides.

These defaults resolve the nonblocking product decisions. No additional user answers are required before implementation. Keep them explicit in the handoff rather than asking the user to redesign the feature during coding.

## 2. What the existing implementation provides

| Current file | Reusable behavior | Constraint to address |
| --- | --- | --- |
| `app/components/AdaptiveQuiz.tsx` | Modal lifecycle, radio choices, submit/feedback, exit | Single lecture selector and source, tightly coupled to current buffer |
| `lib/adaptive-quiz.ts` | Answer shuffling, question validation primitives, error types | Single-source topic IDs, fixed clinical ratio, maximum 600 usable slides per source |
| `lib/quiz-buffer.ts` | Five-question startup, two concurrent requests, cancellation, bounded retries | Fixed queue order; adaptation reaches the learner about four questions later |
| `lib/quiz-client.ts` | Authenticated requests, safe diagnostics, request timeout | One endpoint and one source per request |
| `lib/quiz-evidence.ts` | Exact source excerpts attached by code from an evidence ID | Page-only IDs collide when several lectures are involved |
| `lib/quiz-errors.ts` | Retryability classification and safe messages | New Exam Prep codes must be explicitly supported if introduced |
| `netlify/functions/quiz.mts` | Auth, strict output schema, model invocation, source validation, one model call per HTTP request | Recomputes the old quiz plan and expects the entire single-lecture progress/source structure |
| `lib/lecture-store.ts` | Library records with IDs, courses, weeks, instructors, SLOs, TOC, text | `loadCloudLibrary()` currently makes an unpaginated lecture query; large libraries need complete retrieval |
| `tests/adaptive-quiz.test.mts` | 32 regression tests, fake services, controlled async behavior | Tests intentionally encode single-lecture 70/30 behavior and must remain valid |

Important finding: import processing can replace some extracted `slide.text` values with AI-proposed text in `mergeAiLectureBrief`. Existing evidence validation proves a quotation is in stored source text; it does not necessarily prove it is verbatim PDF text or that the explanation is medically correct. Describe evidence honestly. Do not fold a raw-text storage migration into this feature without separate scope.

## 3. User experience

### Setup

- Open a modal labeled **Exam prep**.
- Show compact search plus Course, Week, and Instructor filters, with values derived from the library.
- List lectures in a dense checkbox list grouped by course and week, newest week first. Each row shows title and instructor; avoid thumbnail loading here.
- Include **Select shown**, **Clear selection**, selected count, and **Start**.
- Group checkboxes select the eligible lectures in that group and support checked/unchecked/indeterminate states.
- Selection persists when filters change. Filtering does not silently deselect hidden rows. The selected count counts all selected IDs, not only visible rows.
- Use stable lecture IDs for selection, never array positions or titles.
- Start requires at least one usable selected lecture. One lecture is a valid Exam Prep session.
- A lecture with no usable text is disabled with a short reason such as **No readable text**. It remains visible and is excluded from bulk-selection counts. Other usable lectures can still be selected.
- Large lists should use an inexpensive windowed or incrementally rendered list while maintaining the complete selection set. A rendering window is not a selection limit.

### Startup and study

- Startup shows **Preparing · 0/5**, through **5/5**. Exit stays available.
- Present one question at a time, using the existing quiz's visual language.
- Keep Submit, Next, and Exit in stable positions. Do not add a dashboard of gauges or a permanent sidebar.
- Show question number and correct/answered. Optional source metadata must not reveal the topic or title before answering if that would cue the answer; reveal the full source after submission.
- Submit records one attempt and displays feedback. Selection and correctness freeze for that question.
- Next takes the most suitable prepared question. Feedback stays visible until Next is pressed.
- Feedback includes explanation, takeaway, choice rationales, and lecture title plus exact source page/excerpt. Source attribution must remain correct when different lectures share page numbers.
- A compact expandable **Progress** section may show lectures sampled / selected and topics practiced at each level. Call these practice levels, not exam readiness or validated mastery scores. Count a lecture as sampled only after an answer, not after generation.
- Use the existing modal focus, Escape/Exit behavior, and iPad-friendly touch controls. Restore focus to the launch button on exit.
- Close cancels pending browser work and drops adaptive state. Generation already accepted upstream may still incur usage.

Do not resurrect the deleted UI-review gallery for this work. Reuse production components and test with temporary local fixture services; remove temporary fixtures before handoff.

## 4. Scaling lecture selection without oversized prompts

**No lecture-count limit does not mean send the complete library with every question.** Selection metadata can scale with the library; request bodies and active work must stay bounded.

### 4.1 Complete library loading

Before advertising unrestricted selection, paginate the lecture query in `loadCloudLibrary()` with stable ordering, including an ID tiebreaker. Use explicit page ranges and continue until the query is exhausted. Retain existing normalization, caching, and migration behavior. Do not raise a backend row-limit setting as the fix.

On a failed page, do not silently label a partial library as fully loaded. Keep a usable prior snapshot or report the load failure using the existing status mechanism. Paging may still need a later metadata-only loading refactor for exceptionally large libraries; avoid claiming unlimited device memory.

### 4.2 Session source manifest

At Start, snapshot selected lecture IDs and references to their source text. Do not clone all PDFs or spread full lecture objects into every request. Include only the fields required for source scheduling: ID, title, course, week, instructor, page/heading/text, and useful TOC boundaries.

Deduplicate selections by ID. Identically titled lectures remain distinct. Different lecture IDs with overlapping material can remain in scope, but repeated-question detection must reduce repeated stems.

Retain original PDF page numbers. Never concatenate decks and renumber them into one artificial lecture.

### 4.3 Deterministic source units

Create ordered source units locally without a model call:

- Prefer verified contiguous TOC/heading boundaries where they produce useful sections.
- Bound each unit initially to **12,000 source characters and at most 12 pages**. These are per-request engineering budgets, not deck or lecture-count caps.
- A page longer than the budget is split into exact character spans, retaining its page number and start/end offsets. No source span is silently dropped.
- Preserve the end of long lectures. Do not reuse `makeQuizSource()`'s whole-deck 600-slide rejection or a single globally truncated prompt.
- Associate each unit with `{lectureId, unitId, spans}`; derive unit IDs deterministically from lecture ID, source content version, and span positions.
- Empty/image-only slides can be omitted from text generation with explicit coverage accounting. Very short nonempty fragments should be joined to neighboring material when possible; source too short to support any question is unavailable, not invented into a topic.
- Administrative-only units may be classified as untestable later. Do not make brittle title keyword filters the sole reason to discard substantive content.

Build units incrementally and yield to the browser between batches. The manifest indexes all selected lectures; only a small number of units are expanded for generation at a time.

### 4.4 Lazy topic mapping

When a source unit first becomes a scheduling candidate, send only that unit to the topic-mapping action. Identify up to four substantive topics with references to supplied spans; a unit with no teaching content can return an explicit empty/untestable classification.

The application assigns canonical topic IDs after validating model output. IDs are scoped by lecture and unit; `t1` in two lectures must never refer to the same progress record.

Cache mappings in memory for the session. Do not pre-map every selected lecture before question 1. No cross-session cache or database migration is required in this release.

The topic queue must be fair to lectures not yet sampled. Mapping can be shared among questions using the same unit, and concurrent requests for a unit must reuse one in-flight mapping promise.

At startup, try to spread the five foundation questions across selected lectures, with one per lecture before repeating when practical. Do not wait for every selected lecture to be mapped. Very small selections may reuse a topic with different tested angles.

### 4.5 Bounded work and explicit limits

Initial implementation constants, kept centrally and adjustable after measured testing:

| Item | Starting bound |
| --- | --- |
| Selected lecture count | No fixed cap |
| Total questions in an active session | No fixed cap |
| Source unit | 12,000 characters / 12 pages; split oversized pages |
| Topic candidates per mapped unit | Up to 4 |
| Live question slots | 5, including waiting/in-flight/ready |
| Concurrent model requests | 2 total, shared by mapping and questions |
| Parked usable questions | Up to 5, in memory |
| Recent detailed answers sent to a question request | Up to 8 relevant/recent attempts |
| Serialized question request | Validate a conservative byte budget, initially 180 KB |
| Automatic attempts per operation | Existing maximum of 6, including the first attempt |

Track UTF-8 serialized bytes, not JavaScript string length alone. If a unit/request exceeds its budget, split source or trim optional history before the call; never slice the selected lecture list to make it fit.

Mapping also needs a spending bound when many units turn out to contain only administrative content: authorize at most ten distinct mapping operations during startup, then at most two additional mappings per submitted answer. These are operation budgets, not lecture-selection caps. Once sufficient topics are available, use them to finish the initial five questions and leave the other units eligible for later coverage. If startup exhausts its mapping budget without finding any testable topic, stop with an initial-source-processing status; do not claim all selected lectures were examined. The user can exit and adjust sources. A failed operation uses its own existing retry budget and cannot silently mint a new mapping operation.

The browser retains sparse performance records for topics actually practiced. Requests send only the relevant topic's progress and a bounded recent window, not all history for hundreds of lectures. The per-topic performance map can grow with encountered topics; question/history caches must be bounded.

## 5. Adaptive learning policy

Use deterministic, testable application logic to select source, topic, and target level. Luna writes the question and explanation for that plan. Do not ask Luna to invent or maintain the learner's score or decide its own scheduling rules.

### 5.1 Three levels

| Level | Goal | Expected question form |
| --- | --- | --- |
| 1 — Foundation | Recall and direct first-order reasoning | Content checks, definitions, mechanisms, simple interpretation; usually no vignette |
| 2 — Application | Apply a known idea in one inferential step | Short clinical or experimental scenario with clearer clues |
| 3 — Integration | Link at least two inferences | NBME-style clinical vignette: infer the process/diagnosis, then its mechanism, consequence, or next relevant inference supported by the lecture |

The first five questions target level 1. Every newly encountered topic starts at level 1 even when other topics have advanced. There is no global phase switch that promotes unfamiliar material because the learner answered unrelated topics correctly.

Question kind and target difficulty are related but distinct. An experimental application can be level 2 without a patient vignette; an elaborate patient story is not automatically level 3. There is no fixed clinical percentage.

### 5.2 Per-topic progress and promotion

Maintain:

- Total correct/incorrect, last answered index, and last tested source span.
- Current target level, initially 1.
- Rolling outcomes for the current level, up to four attempts, and per-level attempt counts.
- Consecutive errors at the current target level.
- An optional pending foundation/application reinforcement after an error.
- A remediation-due answer index and the last sampled lecture/unit/topic.

Starting promotion rule: after **at least three correct answers in the latest four attempts at the current level**, with the latest attempt correct, raise that topic one level. Three consecutive correct answers qualify. Reset the promotion window on level change. Level 3 is the ceiling.

Starting recovery rule:

- A wrong answer schedules a new question on the same concept after roughly **two to four intervening answered questions**, with a clearer or one-level-easier target, minimum level 1.
- Two consecutive errors at the current target level reduce the durable topic target by one level, minimum level 1, and reset its promotion window.
- A correct easier reinforcement clears that immediate remediation task but does not count as a success at a harder level.
- Wrong answers at level 1 remain level 1 with a different example and focused feedback.
- Do not use the identical stem or immediately repeat the explanation as a question whose answer is exposed verbatim.

Only an actual submitted answer updates performance. Ready/in-flight questions, Next, regenerated drafts, canceled calls, and opening feedback do not count.

Prepared questions retain the level at which they were generated. An answer to an older/easier question still updates total accuracy and its actual-level counters, but cannot promote the current harder level. Never relabel it after the fact.

These are initial product heuristics, not a validated psychometric model. Keep constants and functions easy to tune. Do not claim a pass probability or exam readiness from these scores.

### 5.3 Coverage and topic selection

The scheduler balances three needs: unused material, weak/due topics, and progressively harder work on established topics.

Selection order for each new plan:

1. While unsampled eligible lectures/units remain, reserve at least one out of each three presented study opportunities for coverage. Enforce this again when selecting from the ready pool, not just when planning generation, so reordering cannot starve coverage. Prioritize lectures with no submitted answers, then the least-covered lecture; rotate units within it. Pending/ready reservations prevent repeatedly selecting the same untouched lecture in one buffer fill.
2. For the remaining opportunities, take eligible due remediation, oldest due first. A foundation miss should not trap the session on one topic indefinitely.
3. Otherwise prioritize weak or not-yet-retested topics, then newly promoted topics awaiting a harder question, then older strong topics for maintenance.
4. Prefer a different topic from the immediately preceding question, and normally avoid three consecutive presented questions from the same lecture when alternative material is available. Small or single-topic selections may relax this; never deadlock.

Use recent outcomes rather than lifetime raw incorrect counts to rank weakness so a topic can recover. A simple bounded smoothed recent-error fraction plus time-since-seen is sufficient. Break ties with a session-seeded shuffle, not alphabetical order.

The coverage cadence and remediation interval are scheduling targets. If many topics become overdue simultaneously, service them by age while preserving coverage; no impossible promise that every error will be retested at the same exact interval.

For a large selection, it is mathematically impossible to assess all lectures in the first five questions. Show honest coverage and keep unsampled lectures eligible throughout the session. No material should be permanently excluded because it occurred late in the input array.

### 5.4 Example behavior

Select glycolysis, genetics, and pharmacology. Initial questions check core mechanisms from each. After repeated correct answers about glycolysis, that topic moves to short application scenarios, then clinical integration. Missing a genetics mechanism schedules a simpler genetics follow-up after other questions. Strong performance in glycolysis does not make the first pharmacology question an advanced vignette.

## 6. Five-question preparation without stale adaptation

Do not reuse the old buffer's fixed FIFO policy unchanged. Retain its recovery/cancellation guarantees, but build a small **prepared-question pool** for Exam Prep.

### State and invariants

- A displayed question is immutable until submitted/exited. Never swap its answer choices or source during a background update.
- Initial launch requires five validated level-1 questions. Until then the displayed question is null.
- Five live slots include waiting, in-flight, ready, and the displayed unanswered question. Answer submission releases one slot and normally authorizes one replacement question operation; a tightly bounded stale-question allowance is defined below.
- At most two total model calls run at once, including topic mapping, question generation, and their retries. Foreground question needs have priority over speculative mappings.
- A generated question owns an immutable `planId`, `sessionId`, topic/source references, target level, source version, and progress version captured when requested.
- A late response is validated against that immutable plan, not a freshly recomputed scheduler result. Ignore responses belonging to an exited/replaced session.
- Retrying one operation retains its plan and consumes the same finite attempt budget. Reordering must not reset retries or secretly authorize fresh replacement operations.

### Reprioritization on Submit

1. Record the attempt once using question ID and the final displayed choice mapping.
2. Update topic performance and due-remediation state.
3. Re-score prepared questions for coverage, current difficulty, and remediation. Prefer an eligible prepared question over waiting.
4. Start the newly authorized replacement using the latest progress, prioritizing the largest unmet need.
5. Reorder only questions that have not been displayed. Keep the current feedback attached to the answered question.

If a prepared question is now clearly unsuitable, such as an advanced item after a topic has been demoted, park it for possible later use. Parking is limited to five items and eviction must not independently trigger model spending. Reinsert parked questions only when suitable; expired source versions are discarded. Easier but valid questions are useful review and should normally remain available rather than being parked simply because a topic advanced.

Mapping completion and model completion may select the next suitable ready item, but may not create an unbounded fill/discard loop. Use explicit generation authorization credits: five for startup and one additional per submitted answer; retries operate within one credit. Account separately for stale-question replacements: allow at most one extra operation per five submitted answers, only when a genuine level change made prepared questions unsuitable and fewer than two usable live questions remain. Total distinct question operations must not exceed `5 + answered + floor(answered / 5)`. A render, eviction, Next click, or failed retry does not mint a credit.

Do not park the last playable fallback unless a suitable replacement is already ready or covered by an authorized operation. If no stale-replacement credit is available, retain a valid review fallback or wait for existing authorized generation. Test this explicitly so parking cannot deadlock the quiz or drain the pool into one-question-at-a-time generation indefinitely. Reusing a parked question consumes a vacant live slot; it does not trigger a second refill for the same answer.

Difficulty changes cannot be instantaneous if no suitable generated question exists. At Next, use a relevant ready coverage/review question while a targeted one is generated. After two such filler questions for an unmet promotion/remediation target, allow a brief **Preparing next question…** wait instead of repeatedly presenting stale difficulty. Do not promise zero latency or synthesize answers locally.

Avoid a queue barrier: a slow failed slot must not hide other valid ready questions after startup. If generation stops permanently, available prepared questions and the real score remain usable. Startup with fewer than five valid questions cannot silently begin; explain the terminal status and retain Exit.

When all selected units have been confirmed untestable, terminate preparation with a specific no-usable-material message. A transient mapping failure must not mark the lecture permanently untestable. Authentication/configuration/billing failures stop generation globally; they must not silently shrink the source scope.

## 7. Question generation and source verification

Use the existing configured Luna model and provider call settings initially. This task does not require a model migration, embeddings, vector database, background job service, or OCR.

### Per-question request

Supply only:

- Session/plan identifiers and the selected lecture's compact metadata.
- Primary topic and target level.
- Exact source spans/excerpts for that topic/unit, with stable evidence IDs.
- Relevant per-topic performance and bounded recent/queued question signatures or stems.
- A small repair context with whitelisted failure codes when retrying.

Do not send the whole selected lecture collection, full performance map, PDFs, annotations, old notes, or unrelated SLO confidence state.

### Level-aware prompts and validation

- Level 1: test a meaningful foundational fact or one direct application. Vignette optional; one reasoning step is sufficient.
- Level 2: require one substantive application step, without forcing a long clinical vignette or the current 45-word clinical minimum.
- Level 3: require a substantial clinical vignette and at least two linked reasoning steps; retain the current single-question lead-in rules and 45-word clinical minimum as an initial structural floor.
- All levels: four/five distinct plausible choices, one valid correct index, complete explanation and rationales, no answer-position cues, exactly one question in the stem, no duplicate question in the vignette.
- The server supplies the permitted evidence IDs. Luna chooses one to three references from the primary lecture; code attaches the exact original excerpts and source coordinates. Require enough supplied evidence for the tested reasoning, but do not treat the count of quotations as proof of clinical validity. Never accept invented lecture/page references.
- Topic/unit/lecture IDs must resolve within the selected source manifest on the client and within the supplied validated source slice on the server. The server authenticates the user and treats client content as untrusted study data, not instructions.
- Server plan parsing validates level, references, and bounds. It must not call the single-lecture `nextQuestionPlan()` and override the requested Exam Prep plan with the old 70/30 policy.
- No independent model judge call on every question in v1. Structural validation catches format/reference errors, not clinical correctness; perform a small human review of real samples at every level before shipping.

Use lecture-qualified evidence IDs, for example an opaque code resolved in a map to `{lectureId, unitId, page, start, end, text}`. Do not concatenate bare `p9-e1` references from multiple decks. Citation text is exact stored slide text; fabricated clinical details may apply the concept but must not introduce new tested medical knowledge absent from the source.

Retain automatic retries and the existing one-model-call-per-HTTP-request design. Retry whitelisted quality, transient, timeout, and rate-limit failures with existing finite backoff. Honor cooldown across both request lanes; do not start unrelated requests during a shared rate-limit cooldown. Permanent auth/billing/configuration/refusal errors stop further generation with usable questions preserved. No manual Retry button.

Reject exact duplicate normalized vignette/stem signatures against ready/parked questions and a bounded session signature cache, initially the most recent 1,000 presented questions. Keep only eight detailed recent attempts for prompts. Do not promise semantic duplicate elimination; overlapping lectures may test the same concept through a new application, which is useful reinforcement.

## 8. Proposed code organization

Prefer a small dedicated exam scheduler/pool with shared primitives. Avoid turning `QuizBuffer` into a large mode-dependent state machine. Extract only behavior actually shared by the two live modes.

### New files

| File | Responsibility |
| --- | --- |
| `lib/exam-prep.ts` | Types, explicit policy constants, pure answer updates, level transitions, next-plan selection |
| `lib/exam-sources.ts` | Source manifest, deterministic bounded units, namespaced references, coverage index |
| `lib/exam-pool.ts` | In-memory lifecycle, lazy mapping, generation credits, reprioritization, cancellation |
| `lib/exam-client.ts` | Exam action request/response adapter using shared authenticated transport |
| `netlify/functions/exam.mts` | Authenticated `topics` and `question` actions with bounded source/plan contracts |
| `app/components/ExamPrep.tsx` | Setup selection and session orchestration |
| `app/components/exam-prep.css` | Minimal setup/progress-specific styles using current quiz styling |
| `tests/exam-prep.test.mts` | Policy/source/buffer/integration regressions with mocked services |

### Small shared extractions

- `app/components/QuizQuestionView.tsx`: extract answer/feedback rendering from `AdaptiveQuiz.tsx` with explicit props, including source labels. Scheduling stays out of this component.
- `lib/quiz-transport.ts`: factor session-token retrieval, timeout handling, safe responses, and diagnostics from `quiz-client.ts` if it prevents duplicate transport behavior.
- `lib/quiz-recovery.ts`: factor the finite attempt/cancellation/backoff utility if both pool implementations use it without changing existing behavior.
- `netlify/functions/_shared/quiz-runtime.ts`: share authentication, safe errors, model-call infrastructure, and request-body limits. Keep this helper outside routable entrypoints.
- Extract question content validation into a function accepting an explicit question plan, then preserve the existing `validateQuizQuestion` wrapper/API for the old quiz. Keep topic scheduling out of shared validation.

These are target responsibilities, not permission to refactor unrelated features. If an extraction makes existing single-lecture tests harder to preserve, keep the extraction smaller.

### Existing integration points

- `app/page.tsx`: add the Exam prep launch action and render the new modal. Prefer one `quizMode: null | "lecture" | "exam"` state over independent booleans that permit simultaneous quiz dialogs. Keep the PDF-reader Q/E guard active for either quiz mode.
- `lib/lecture-store.ts`: paginate lecture loading as above; no schema migration or progress persistence.
- `tsconfig.netlify.json`: include the new server entrypoint so type checking covers it.
- `package.json`: add `test:exam`; keep existing checks.
- Product/UX/quiz docs and README: update only after implementation; describe the different study policies clearly.

### Minimum internal contracts

```ts
type ExamLevel = 1 | 2 | 3;
type ExamSourceRef = {
  lectureId: string; unitId: string; page: number;
  start: number; end: number; sourceVersion: string;
};
type ExamTopic = {
  id: string; lectureId: string; unitId: string;
  title: string; sourceRefs: ExamSourceRef[];
};
type ExamPlan = {
  id: string; sessionId: string; progressVersion: number;
  topicId: string; lectureId: string; unitId: string;
  level: ExamLevel; purpose: "coverage" | "remediation" | "advance" | "review";
};
```

Final types must also include per-level statistics, source excerpts, pending operation identity, and UI snapshot state. Do not overload the old `QuizTopic.id`, `clinical` counter, or `sourcePages` field with multi-lecture meaning. A question's canonical identity and source plan survive choice shuffling unchanged.

## 9. Operational behavior and diagnostics

- Make no new database tables and no persistent question records for v1.
- Use the user's existing Supabase session token and server-only model key.
- Shared auth/model helpers must retain the old endpoint's method rejection, body-size checks, token verification, safe error responses, and bounded model timeout.
- A shared request limiter should account for both modes where they run in the same instance; document that the existing in-memory limiter is best effort, not a distributed account quota.
- Stop scheduling when disposed. Late responses cannot reopen a session, change a different session's progress, or consume fresh generation credits.
- If the document becomes hidden, allow outstanding work to finish into the bounded pool but suspend new speculative requests/retries until visible; resuming must not replenish attempt budgets. Do not rely on iPad tabs staying alive; persistent resume is outside v1.
- Record safe codes/timing/counters: mapping vs question, level, generation/validation failure code, retry attempt, source-unit size, ready/parked counts, and request correlation ID. Never log source text, question content, answer text, credentials, instructor names, or lecture titles.
- Report source-unavailable conditions separately from model validation failures. Do not turn every failed map into “try again” indefinitely.

Cost model: startup requires five question calls plus mappings for only the units needed to prepare them, usually one to five mapping calls for ordinary material. Afterwards expect one question generation operation per submitted answer and occasional mapping of new units. The stale-question allowance can add at most one operation per five answers; retries add bounded calls. Unit mapping is lazy, not a fee charged for every selected lecture at launch. These are call-count expectations, not latency or dollar guarantees.

## 10. Implementation sequence and completion gates

### Step 1 — Source contracts and complete selection

Implement source units, namespaced references, library pagination, and selection helpers. Use synthetic fixtures for 1, 50, 250, and 1,000 lectures, a lecture exceeding 600 slides, and a single oversized slide. No API calls are needed.

Gate: no silent selected-lecture truncation, no dropped text spans, stable identity, complete pagination, bounded request serialization, and responsive bulk selection.

### Step 2 — Pure adaptive policy

Implement level transitions and coverage/remediation scheduling. Simulate all-correct, all-incorrect, mixed, and recovering performance. Include pending reservations and stale-level answers.

Gate: the first five are foundation; promotion requires actual success in that topic/level; errors influence future plans; unused lectures stay eligible; selection does not collapse onto one weak topic.

### Step 3 — Authenticated generation and shared primitives

Extract minimal transport/server helpers, add the exam endpoint, implement lazy topic mapping and level-aware question output/validation. Use mocked provider responses in tests.

Gate: correct source identity even when many lectures cite page 1, invalid references rejected, strict choice/feedback shape, current quiz's 32 regressions preserved, no secret/raw provider output exposed.

### Step 4 — Prepared pool and end-to-end session logic

Implement generation credits, startup barrier, reprioritization, parking, shared concurrency/cooldown, and cancellation with deterministic fake services and fake timers.

Gate: five valid startup questions; rapid submissions count once and authorize exactly one ordinary refill each; extra stale replacements obey their separate cap; failure in one slot does not block unrelated prepared items; late results cannot mutate a new session; bounded retries never reset themselves.

### Step 5 — Production UI

Add Exam prep entry, multi-select setup, shared question rendering, compact progress/source feedback, and modal focus behavior. Test setup with enough lectures to require scrolling; review desktop and iPad-sized layouts. No permanent prototype page.

Gate: selecting/filtering/clearing works predictably; old Quiz/reader behavior is intact; all essential controls remain reachable by touch and keyboard.

### Step 6 — Validation, documentation, handoff

Run the commands below, review real question samples using a small explicit selection in the authenticated app, and update shipped documentation. If live access is unavailable, state exactly which content-quality/latency checks remain unverified; do not present mocks as a live model test.

```powershell
npm.cmd run test:quiz
npm.cmd run test:import
npm.cmd run test:exam
npx.cmd tsc --noEmit -p tsconfig.netlify.json
npm.cmd run lint
npm.cmd run build:netlify
git diff --check
```

Record existing unrelated failures separately if the baseline exposes any. The plan itself has not executed these checks or certified the baseline beyond source inspection.

## 11. Required acceptance scenarios

1. Select 1,000 lightweight fixture lectures, change filters, and verify all selected IDs remain selected; startup does not send all lecture text to the server.
2. Load more lectures than one cloud query page; confirm the final page and stable ordering, and show a load error rather than silently ignoring a failed page.
3. Select a 700-slide lecture; reach material near its end without hitting the old 600-slide quiz error.
4. Split and reassemble an oversized slide's source spans; verify no lost content or invented page numbers.
5. Start with five level-1 questions, four/five answer choices each, zero recorded attempts, and varied lecture coverage when available.
6. Answer one topic correctly three times at level 1; eligible new plans advance to level 2. An untouched topic remains level 1.
7. Repeat success at level 2; receive level-3 clinical integration. No assertion enforces 70% clinical for Exam Prep.
8. Miss a level-3 question; get an easier delayed follow-up. Two consecutive target-level errors reduce that topic's target; other topics retain their state.
9. Answer an older buffered level-1 question after promotion; it does not count as a level-2 success or promote again.
10. With many weak topics and unused lectures, verify continuing source coverage and due-remediation ordering. Use a long deterministic simulation to detect starvation, including a pool that reorders questions.
11. Complete requests out of order; question/source/answer mappings stay correct. A stalled slot cannot conceal a different ready question after startup.
12. Submit twice rapidly; one score change and one generation authorization. Next/re-render/focus changes create no additional billable operations.
13. Return an invalid source ID or double lead-in, then valid output; recovery happens automatically within the operation's original retry budget.
14. Trigger shared throttling; both lanes respect cooldown. Trigger authentication/quota failure; no further model calls, but prepared items/score remain usable.
15. Exit during mapping, question generation, and backoff; no state update or new request after disposal. Reopen and receive fresh progress.
16. Use two different lectures with the same topic title and page number; performance and evidence never cross-contaminate.
17. Select empty/scanned sources with usable sources; only the unusable rows are disabled. An administrative-only mapped unit does not get fabricated into a medical topic or exclude the entire lecture.
18. Confirm filtering/bulk selection, indeterminate group checkboxes, keyboard operation, focus restoration, and answer submission at desktop and iPad sizes.
19. Inspect real samples at each level for one clear best answer, source-supported reasoning, sensible distractors, and rising cognitive difficulty. Structural validator tests alone do not satisfy this content review.
20. Run all old quiz tests and manually confirm the single-lecture Quiz still follows its original policy and reader shortcut.
21. Demote a topic with advanced questions already prepared; verify the pool retains a usable path, prefers the new easier question, and respects the stale-operation allowance under repeated level changes. No endless park/refill loop or deadlock.

## 12. Deferred scope

- Saving/resuming quizzes, exam dates, named reusable lecture sets, and longitudinal performance.
- Cross-lecture synthesis inside one question and automatic concept merging across decks.
- Question bank, question editing/chat, question exports, timers, scored mock exams, and pass predictions.
- SLO-only generation, OCR/image interpretation, retrieval across the unselected library, and vector search.
- Pre-indexing the entire library with a model, background worker infrastructure, distributed quotas, or a new caching database.

These can be reconsidered after the core workflow is used. Do not add them opportunistically during this implementation.

## 13. Handoff instructions for the implementing model

Read this plan and `docs/ADAPTIVE_QUIZ.md`; inspect the named files and current Git status before editing. Implement the sequence above, retaining unrelated local changes. Prefer pure policy functions and mocked async services to expensive live-call debugging. Keep the UI compact and reuse production answer/feedback rendering.

Do not interpret “unlimited lectures” as an unlimited HTTP body, startup call burst, or all-library prompt. Do not carry the old 70/30 policy into Exam Prep. Do not update difficulty from generated or queued questions. Do not ask the user to approve automatic retries. Do not promise instant adaptation when model generation has not finished.

The implementation described by this plan is now present. Do not deploy as part of this task; this document records the implementation and remaining verification rather than directing another model to begin from scratch.

## 14. Implementation record — September 27, 2026

### Delivered

- Added the separate **Exam prep** workflow alongside the existing lecture Quiz. The lecture Quiz and its reader shortcut retain their separate flow and policy.
- Added filterable, incrementally rendered multi-lecture selection; selected lecture IDs survive filter changes. Exam sources are split into bounded, namespaced source units, loaded lazily, and cloud library loading is paginated with stable ordering and explicit page failures.
- Added the separate three-level, per-topic adaptive scheduler and a five-question prepared pool. The pool uses bounded retries, request concurrency, generation credits, cancellation, cooldown, coverage opportunities, due remediation, and stale-question parking.
- Added the authenticated Netlify `exam` function for bounded topic mapping and question generation. It validates requested plans, source references, response structure, and request size; diagnostics avoid source/question content and provider secrets.
- Reused a shared question-and-feedback view without moving Exam Prep into the older Quiz scheduler. Added compact progress/feedback UI and the setup/session modal.
- Added automated Exam Prep tests and documented the feature as session-only; questions and adaptive performance are not persisted.

### Automated verification

The following checks passed locally:

| Check | Result |
| --- | --- |
| `npm.cmd run test:exam` | Passed: 20 tests |
| `npm.cmd run test:quiz` | Passed: 32 regression tests |
| `npm.cmd run test:import` | Passed: 4 tests |
| `npx.cmd tsc --noEmit -p tsconfig.netlify.json` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd run build:netlify` | Passed |
| `git diff --check` | Passed after package-script line-ending cleanup |

The production build reports a large client chunk (about 1 MB) over Vite's 500 KB advisory threshold. This is a performance warning, not a build failure; the existing PDF/application bundle composition remains a candidate for a separately measured code-splitting pass.

### Remaining acceptance checks

- No authenticated live Luna samples were generated or reviewed in this implementation turn. Structural/reference validation cannot establish medical correctness, sensible distractors, or real-world level progression. Review a small sample at each of the three levels before treating question quality as accepted.
- Desktop and iPad-sized interaction checks, including touch/keyboard access and focus restoration, were not manually performed here.
- Pagination, source splitting/identity, scheduling, retry, and cancellation are covered by automated fixtures, but the manual live-library scenarios and a prolonged real session should still be exercised with the user's account.

These are explicit QA follow-ups, not unimplemented feature wiring. Do not imply that a live model review or iPad test has already passed.

### Startup latency follow-up

The first live-use report showed the session waiting at **Preparing · 0/5** while all lecture sections still appeared unmapped. Startup previously spent its full initial coverage phase on topic-mapping calls before it began drafting any questions. It now overlaps the first question draft with coverage mapping while retaining the five-valid-question presentation barrier and the attempt to sample distinct lectures. A section that exhausts its automatic mapping retries is now marked failed and skipped, instead of becoming eligible for another full retry cycle. The startup status also distinguishes source-analysis progress from question-generation retries. Added two regression tests for overlap and no repeated failed-section operation.

This reduces avoidable waiting, but the first session still depends on authenticated Netlify function and Luna response latency. If the live build remains stuck after this patch is deployed, capture the app Diagnostics immediately; that will distinguish a slow upstream request from auth, quota, or validation retries.
