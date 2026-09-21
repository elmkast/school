# lectures.lib — September UI review

Date: September 5, 2026  
Status: interactive proposals, not adopted production designs  
Review route: `/ui-review`

## Direction

Keep the visual archive and the confidence-board model. Reduce competing controls rather than removing useful capabilities. Use Georgia, three UI sizes (13 / 16 / 24 px), two weights (normal / bold), square edges, neutral surfaces, and one slate-blue interface accent. Annotation ink colors and invalid-field red remain semantic exceptions.

The main opportunity is consistency: a single navigation strip, a predictable filter row, and controls placed beside the thing they affect. Less text should not mean smaller objective text, unlabeled mystery controls, or hidden touch navigation.

## Audit

This is a source review of the current application flows plus browser inspection of the local archive, SLO workspace, existing review page, and new proposals. It is not a live-account, screen-reader, or physical-iPad usability test.

| Surface | Finding | Recommended direction |
| --- | --- | --- |
| Application header | Navigation, search, import, sync, diagnostics, and account actions compete in one strip. | Keep Lectures / SLOs and the current page's main action prominent. Consolidate account utilities into a secondary menu in a later production pass. |
| Lecture archive | The contact-sheet metaphor is strong. Hover-only identification is less dependable on touch; filter placement can be clearer. | Preserve the dark archive. Give each week a consistent heading. Keep titles visible on touch/narrow layouts, available on focus, and optionally always visible on desktop. |
| SLO confidence board | Objective text competes with repeated source, confidence, selection, priority, and secondary actions. | Lead with the objective. Put source/selection/priority in a compact header and instructor/confidence in a quiet footer. Keep export and study actions at page level. |
| Study workflow | A board supports planning but displays too much when concentrating on one objective. | Add an optional one-objective focus presentation for a selected set. Rate confidence without returning to the board. This is a proposed workflow, not a change to saved study sets. |
| PDF reader | Multiple control groups float over the document and make the tool hierarchy harder to scan. | Reserve top and bottom edges for controls; keep the slide area clear. Contents at top; page/zoom/mark at bottom; annotation tools in one collapsible strip. Preserve the existing gesture engine if adopted. |
| Import review | Repeated labels on every lecture card add height and make batch comparisons harder. | One row per lecture with shared column headings. Batch week assignment; only missing fields receive error emphasis. Keep explicit finalization. |
| Search | Search is a useful global entry point; results need clear source context without duplicating navigation. | Retain grouped results and concise lecture/page identifiers. Do not add another permanent search destination. No new search prototype in this pass. |
| Exports and secondary dialogs | These should remain subordinate tasks rather than new workspaces. | Use short format/action labels and a clear cancel path. Keep actual export behavior unchanged. |
| Authentication and diagnostics | These are operationally important but not everyday study content. | Preserve recovery and diagnostics; keep them discoverable in account utilities. Avoid a visual redesign of failure/recovery flows without testing real failure states. |
| Responsive interaction | Removing borders and labels can unintentionally reduce discoverability or touch accuracy. | Keep visible focus outlines, accessible control names, non-hover access, and usable tap surfaces. Validate physical Apple Pencil behavior separately from visual prototypes. |
| Documentation | The older UX specification still describes retired card layouts, notes, and Luna panes. | Treat this review as the current audit, not an adopted replacement spec. Reconcile the production specification when a proposal is chosen. |

## Four interactive proposals

### 01 Archive

- Current dark contact-sheet direction with simplified shared navigation.
- Search and week filters, empty-result recovery, touch-readable captions.
- Lecture thumbnails open the sample reader; Add lectures opens sample import review.
- The MCF course label and slide previews are fixtures, not the user's actual PDFs.

### 02 Confidence

- Three columns, concise cards, priority filtering, week/instructor filtering, and selection.
- Changing confidence moves an objective to its new column.
- Study opens a selected set one objective at a time, with confidence rating and completion.
- Export choices are visual previews only; no files are generated.

### 03 Reader

- Open/close contents, search titles, navigate slides, mark/unmark, zoom 100–400%, and fit.
- Expand/collapse annotation tools; sample pen/highlighter, colors, widths, undo/redo.
- Mock slide contents and in-memory ink only. The sample eraser removes strokes near the clicked point; it is not the production eraser.
- No PDF loading, persistence, pinch, palm rejection, or Apple Pencil engine changes. This prototype cannot validate those behaviors.

### 04 Import

- Edit title/course/week/instructor, use existing-name suggestions, assign batch week, remove/add sample rows.
- Finalize remains disabled until required fields are complete.
- Completion explicitly identifies the batch as a sample. Upload adds a fixture; it does not choose or upload a real file.

## Isolation and verification

- All proposals live under `app/components/review/`; their CSS is scoped to the review surface.
- The existing review entry point now presents these four proposals. Older prototype components remain available in source.
- No application stores, Supabase calls, Luna calls, production styles, or live reader gesture handlers were changed.
- Switching proposals or pressing Reset discards prototype-local edits. None persist to the user's library.
- Browser checks: confidence move, study rating/next/completion, disabled/enabled import finalization, sample completion, contents toggle, slide link, zoom/fit, mark, pen stroke, undo/redo, and annotation-strip collapse.
- Visual inspection used the current narrow desktop browser viewport; responsive container rules are present. Physical iPad and full wide-screen acceptance checks remain before production adoption.
- Netlify production build and lint pass. The separate TypeScript check reports existing ink-tool typing errors in `PdfCanvasViewer.tsx` and `lib/lecture-store.ts`, neither modified in this review.

## Suggested adoption order

1. Import table: contained change with a clear batch-review benefit.
2. Confidence cards: keep current data and confidence semantics, adopt the visual hierarchy first.
3. Archive refinements: preserve the existing PDF thumbnail pipeline.
4. Reader shell: integrate around, not through, the current annotation/gesture implementation; verify on iPad before shipping.

Decide independently per proposal. No all-or-nothing redesign is required.
