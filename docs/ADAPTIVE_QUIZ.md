# Adaptive lecture quiz

Implemented September 10, 2026. This is session-only practice, not a restored question bank.

## User flow

- Choose **Quiz** in the application navigation, select one lecture, then **Start quiz**. **Start quiz** in an open lecture preselects that lecture.
- Answer one multiple-choice question at a time. Each has four or five choices with randomized answer positions.
- Submit reveals the answer, explanation, reasoning steps, distractor rationales, and supporting lecture excerpts.
- Startup prepares five validated questions before revealing question 1. A compact counter shows startup progress.
- Each submitted answer triggers one replacement at the end of the queue (answer 1 → question 6, answer 2 → question 7). **Next question** immediately opens the next prepared question while feedback stays available until clicked.
- Replacements use actual submitted answers available when generation starts. Already-prepared questions remain unchanged, so adaptation arrives approximately four questions later. Queued questions are never counted as correct/incorrect performance.
- Up to two generation requests run concurrently, with fixed queue order regardless of completion order. If answering outpaces generation, the next button waits for the missing question rather than skipping or reshuffling it.
- **Exit quiz** (or Escape) cancels pending browser requests and discards questions, scores, and adaptive state. Starting again is a fresh session. No question bank, saved quiz, or database migration is added.

## Adaptation and question quality

The first request identifies substantive lecture topics and their source pages. A deterministic scheduler chooses subsequent topics and difficulty; Luna writes the actual questions.

- Wrong answers prompt a new case on the missed topic, with periodic switches to prevent an endless single-topic loop.
- Correct answers broaden coverage. Repeated correct answers on a topic raise difficulty; missed topics receive greater priority.
- The model receives topic performance and the last 16 attempts, including selected answers, to address misconceptions and avoid repetition.
- At least 70% of scheduled questions, including every completed prefix, require a clinical vignette and second-order reasoning. The rest are knowledge/application checks.
- Validation enforces four/five unique choices, one valid answer index, clinical vignette length, linked reasoning steps, real source pages, and a quotation found in those pages. Exact duplicate cases are rejected against recent and queued questions.
- Quality failures retry automatically: up to three browser requests per queue slot, with short backoff, each allowing the existing two server-side generation attempts. The normal rejected-question path needs no user action. After the finite budget, generation pauses for that slot and offers manual retry without discarding prepared questions or progress. Authentication, configuration, rate-limit, and connection failures do not enter the quality retry loop.
- These structural checks cannot prove clinical accuracy, genuine second-order reasoning, or NBME-level quality. Review real generated questions before relying on them for exam preparation. Questions are original AI practice, not official NBME items.

## Data and deployment

The authenticated Netlify function is `/.netlify/functions/quiz`. It verifies the current Supabase bearer token server-side and uses the existing server-only `OPENAI_API_KEY`. The existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` must also be available to Netlify Functions, not just builds. No secret Supabase key is needed.

The default model is the application's existing `gpt-5.6-luna`; an optional server-side `LUNA_QUIZ_MODEL` override is supported. Output uses the OpenAI Responses API's [strict structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Refusals, incomplete responses, invalid output, expired sign-in, and generation failures are surfaced with retry/exit actions.

Only extracted slide text is used, not images, handwriting, or notes. Very long lectures use head/tail excerpts from every text-bearing slide, with a visible notice. Image-only lectures require text extraction before they can be used. Question generation receives the selected topic's slides rather than repeatedly sending the entire lecture to the model.

Requests use `store: false`; this does not override the provider's applicable data-retention policies. No quiz content or performance is saved to Supabase or browser storage. Diagnostics record request failure status, not questions or answers. A best-effort per-instance rate limit complements authentication; it is not a distributed account quota. Generation already accepted by the provider may still incur usage after the user exits.

Startup normally needs six model calls (topics + five questions), then one per submitted answer. Validation failures can add bounded repair/replacement calls. Five ungraded slots (ready or being generated) cap the queue; there is no unattended generation loop. Exiting discards unused prepared questions, so this latency improvement can spend more credits on questions that are never answered.

## Verification and UI review

- `pnpm test:quiz`: scheduler, reset, shuffle mappings, source validation, request validation, authentication, structured-output settings, bounded repair, and model failure handling. Tests mock external services and do not spend API credits.
- `pnpm lint` and `pnpm build:netlify`.
- `/ui-review` → **Quiz preview** uses the actual quiz component with deterministic fixtures, including an optional quality rejection that retries automatically. It exercises five-question startup, submission, feedback, instant next-question transitions, replenishment, and exit without API calls. Fixture question content is not a demonstration of production adaptive question quality.
- Buffer regression tests cover out-of-order request completion, rapid answers, duplicate submission protection, the clinical mix with queued reservations, finite automatic retries, and cancellation.
- Live Luna content quality and latency still require a signed-in deployment check using real lecture material.
