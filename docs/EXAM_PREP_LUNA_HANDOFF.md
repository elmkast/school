# Exam Prep repair — focused handoff to Luna

**Status: completed locally on September 27, 2026.** The validation below has been performed; do not repeat the live paid provider test or deployment.

## Task and scope

Finish the existing, uncommitted Exam Prep repair. The user stopped Astra's broader audit to conserve usage. **Do not restart the investigation, redesign the feature, or expand into unrelated cleanup.** Validate the patch, fix regressions, add the few critical regression tests below, and report readiness for deployment. Do not commit, push, deploy, or modify cloud data unless requested.

Repository: `C:\Users\Elliot\Documents\Codex\2026-08-09\woul\.publish-school`.

Use this repository, not the older application in its parent directory. Current branch is `agent/fcom-lib-netlify`; starting HEAD was `855d7dd` (Speed up exam preparation startup). Local `main` has historically been stale. Preserve all current changes. Read applicable AGENTS.md instructions, if any.

## Confirmed cause — no need to rediscover it

The deployed screen stayed at **0/56 sections analyzed, 0/5 questions** because:

1. Both strict OpenAI response schemas in `netlify/functions/exam.mts` used `uniqueItems: true`. The actual provider rejected the topic-mapping request in about one second: HTTP 400, `invalid_json_schema`, parameter `text.format.schema`, message stating that `uniqueItems` is not permitted in `topics.items.properties.evidenceIds`.
2. `ExamPool` caught the permanent error internally, but its `pump()` returned immediately when `this.error` was set, without emitting a final snapshot. React kept the previous `busy: true, error: ""` state indefinitely. The same bug affected question-generation failures.

This was reproduced, not inferred. Authentication was stubbed for the provider test, but the OpenAI request and rejection were real.

## Already changed (uncommitted)

- `netlify/functions/exam.mts`: removed unsupported `uniqueItems` from both schemas; retained application-side validation; added whitelisted provider error codes to safe diagnostics; diagnostic version `exam-v2`. No model change.
- NEW `lib/exam-transport.ts`: injectable request transport with a 10-second authentication deadline and 55-second request/body deadline. Deadlines settle even when dependencies ignore cancellation. Cancelling during auth prevents dispatch after a late token arrives. Detects an HTML deployment fallback. Correlated diagnostics exclude tokens, source text, and raw provider messages.
- `lib/exam-client.ts`: uses that transport and rejects malformed mapped topics instead of silently dropping them.
- `lib/exam-pool.ts`:
  - Emits terminal error snapshots; `busy` becomes false on terminal error.
  - Overlaps mapping and drafting using the existing maximum of two operations.
  - Reserves distinct startup lectures where available; does not map the entire selection before starting.
  - Fixes another startup deadlock: after the mapping budget is exhausted, available topics can fill the five-question buffer rather than waiting forever for unmapped sections.
  - Uses unique operation IDs even when parking reuses queue positions.
  - Preserves error classification at retry exhaustion. Source-quality failures can skip a section; exhausted infrastructure/configuration failures stop visibly.
  - Adds a 120-second operation deadline and shorter quality-retry delays; retains six-attempt maximum and shared rate-limit cooldown.
  - Checks actual remediation due position when choosing prepared questions; prioritizes new units, not only new lectures.
- `app/components/ExamPrep.tsx`: adds a Diagnostics download button in the error state. `downloadDiagnostics` is a confirmed existing export.
- NEW `tests/exam-transport.test.mts`: auth hang, cancellation, hung fetch/body, HTML fallback, and diagnostic privacy tests.
- `package.json`: `test:exam` now includes the transport tests.
- `tests/exam-prep.test.mts`: existing overlap test changed from `questionCalls === 1` to `>= 1`. Improved concurrency can already have drafted multiple questions by the assertion, so exact equality was wrong.
- NEW `tests/exam-live-smoke.mts`: manual/opt-in paid provider test with nine small synthetic lectures. Not included in regular tests. Uses real OpenAI and stubbed auth, never the user's private lectures.

## Verified results

After schema correction, one real topic map completed successfully in about 2.3 seconds.

After pool changes, the complete synthetic smoke test passed:

- Nine lectures selected.
- Five valid foundation questions, from five distinct lectures.
- First valid question ready at about 7.1 seconds.
- Five-question startup barrier completed at **18.7 seconds**.
- Ten provider calls: five maps plus five questions.
- Maximum concurrency: two.
- No generation retries or provider failures in this run.
- Choice counts and source page references were valid.

This is **not** proof of deployed Supabase authentication, Netlify behavior, or production latency with longer lectures. No authenticated live-site session was available. State that boundary honestly.

At the time this handoff was first written, the original 20-test Exam Prep suite was run after the pool rewrite: 19 passed; the overlap test failed because it waited for exactly one question call. That assertion was corrected. The checks listed below were subsequently run and passed.

## Work completed

1. Added UI callback tests for permanent mapping failure and retry exhaustion, a startup mapping-budget exhaustion test, and assertions that both strict provider schemas omit `uniqueItems`.
2. Added client transport tests for stalled authentication, cancellation during authentication, stalled fetch/body, HTML deployment fallback, and safe correlated diagnostics.
3. Capped shared cooldown waiting by the remaining operation deadline. Cancellation still aborts active attempts.
4. Ran these checks:

   ```powershell
   npm.cmd run test:exam
   npm.cmd run test:quiz
   npm.cmd run test:import
   npx.cmd tsc --noEmit
   npm.cmd run lint
   npm.cmd run build:netlify
   git diff --check
   ```

   Distinguish pre-existing warnings from failures caused by this patch. Use `npm.cmd`/`npx.cmd`, since PowerShell's script policy previously blocked `npm.ps1`.
   - `npm.cmd run test:exam`: 27 passed.
   - `npm.cmd run test:quiz`: 32 passed.
   - `npm.cmd run test:import`: 4 passed.
   - `npx.cmd tsc --noEmit -p tsconfig.netlify.json`: passed.
   - `npm.cmd run lint`: passed.
   - `npm.cmd run build:netlify`: passed; Vite reports the existing large client bundle advisory.
   - `git diff --check`: passed (Git prints routine line-ending normalization warnings).
5. Added the confirmed cause, corrections, test results, live synthetic smoke result, and remaining production account check to the implementation plan.

Changes are local/uncommitted. User will decide deployment timing.

## Guardrails

- Preserve the five-question startup requirement, automatic quality retries, per-topic adaptation, bounded request concurrency, and in-memory/reset-on-exit sessions.
- Do not loosen source-evidence or question-quality validation merely to make tests pass.
- Do not rerun the paid smoke test routinely. It already passed; repeat only if subsequent changes affect provider schema/request behavior. It can be run with `node --env-file=../.env.local --experimental-strip-types tests/exam-live-smoke.mts`. Never print `.env.local`, keys, session tokens, or full private lecture sources. Request network permissions if needed; prior-turn permission is not a guarantee for a new turn.
- Do not add browser automation, a permanent UI review page, a new model, or unrelated visibility/pause functionality during this constrained finish.
- The small scheduler changes around remediation/parking have existing tests, but are broader than the root schema fix. If they introduce difficult regressions, isolate or narrow **our own new changes** rather than expanding the audit. Never revert unrelated user work.
- The prior startup-only repair missed the real provider rejection and tested internal state instead of UI notifications. The new regression tests must cover that boundary.

## Deployment instructions when requested

Use the `.publish-school` folder and push the current branch via `git push origin HEAD:main`, not `git push origin main`. Inspect changes before staging; list the relevant changed/new files rather than blindly staging secrets. If rejected, stop and inspect divergence; do not force-push or give another speculative rebase sequence. Netlify's configured Git deployment normally builds after a successful push; no production deployment has been performed in this repair.
