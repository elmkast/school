# lectures.lib UX system

Last updated: September 23, 2026

## Design direction

lectures.lib is a restrained academic workspace: neutral application surfaces, a dark visual archive, compact controls, square geometry, strong hierarchy, and minimal decorative iconography. The interface favors direct labels and source material over explanatory copy.

## Shared rules

- Use one active production treatment rather than parallel visual variants.
- Use one typeface family within a surface, three principal text sizes, and no more than two ordinary weights.
- Left-align almost everything.
- Prefer dense, legible information hierarchy over excessive whitespace.
- Use neutral backgrounds and one functional accent color.
- Avoid gradients as decoration, glass effects, blobs, floating ornaments, and decorative illustrations.
- Use icons only when the symbol is a familiar functional control, such as search, upload, delete, close, or annotation tools.
- Do not repeat information through redundant headings, badges, or counts.
- A click performs one action: navigation, expansion, selection, or mutation—not several at once.
- Destructive actions require confirmation.
- AI-proposed replacements require review and explicit approval.

## Application frame

- No sidebar and no separate Home destination.
- A sticky top bar contains the `lectures.lib` wordmark, Lectures, SLOs, Quiz, curriculum search, Add lectures, and compact account utilities.
- Exactly one primary destination appears active.
- Typing in global search opens search results; clearing the query returns the user to a durable primary destination.
- Account and diagnostic controls remain visually secondary to study actions.

## Lecture archive

- The archive is the default application view.
- First-page PDF previews are the primary navigation objects.
- Academic year, course, and week headings provide hierarchy without nested folders.
- Weeks appear newest first.
- The course filter belongs in the archive header.
- Titles and instructors appear on hover and keyboard focus; touch layouts keep them visible.
- Loading and unavailable-preview states preserve the same lecture opening target.
- The archive may be visually dark, but text and focus outlines must remain high contrast.

## Import review

- The review is a focused modal with one row per staged lecture.
- Every row exposes the fields required for finalization: title, course, week, and instructor.
- Missing required fields are indicated on the field itself rather than through redundant status prose.
- Processing state is brief and functional.
- Finalize remains unavailable until every staged lecture is ready and complete.
- Removing a staged file uses the familiar delete control and affects only that staged import.

## PDF reader

- The PDF occupies the largest possible area and remains the visual center.
- Title, page position, navigation, zoom, Contents, Pen, Mark, Start quiz, Delete, and Close form a compact edge control system.
- Zoom and page navigation remain reachable without covering slide content.
- The table of contents opens as a distinct side panel and preserves its scroll position.
- Marked slides live in the contents panel because both are navigation mechanisms.
- Annotation controls appear only when Pen is active.
- Touch gestures pan and zoom the PDF; Apple Pencil writes without turning ordinary finger touches into ink.
- Current zoom, page position, active annotation tool, and save state must be unambiguous.
- The reader contains no chat or note-taking pane.

## SLO workspace

- The objective itself is the primary object.
- Weak, O.K., and Strong columns expose confidence spatially rather than through repeated summary widgets.
- Course, week, and instructor filters sit together above the board.
- Priority is a filter and a per-objective state, not a separate destination.
- Selection checkboxes assemble a study set without changing confidence.
- Objective cards show only the information required to identify and act on the objective: source lecture/week, objective text, priority, confidence, selection, Open lecture, and Re-parse.
- The focused study session shows one objective at a time and keeps Previous, Next, confidence, priority, and Open lecture consistently positioned.
- Re-parsing and export are modal tasks; they do not replace the board.

## Adaptive quiz

- Quiz setup asks for one lecture and one primary action.
- Startup progress reports how many of the five initial questions are ready.
- One question appears at a time.
- The vignette and its single lead-in remain visually distinct without duplicating the question.
- Answer options share identical geometry and reveal correctness only after submission.
- Feedback prioritizes the explanation and takeaway; reasoning steps, distractor rationales, and source text remain available without overwhelming the next action.
- Exit quiz is always available.
- Temporary generation recovery is automatic and quiet unless it materially delays progression.
- The interface never presents a manual generation-retry decision.

## Search

- Catalog and source-text search are explicit modes.
- Filters use consistent native selects and remain secondary to the query.
- Results are grouped as Lectures, SLOs, or Slides.
- Every result identifies its originating lecture and opens the exact available destination.
- Empty results suggest changing the query or source mode without adding decorative empty-state content.

## Responsive and accessibility behavior

- All mouse-only hover information has a keyboard and touch equivalent.
- Focus states remain visible against both the dark archive and light workspaces.
- Modal tasks trap the conceptual workflow and always provide an explicit exit.
- Controls retain readable labels at iPad width; do not collapse essential actions into unexplained icons.
- PDF interaction prevents browser selection and browser-level gestures from interfering with annotation.
- Loading, unavailable, empty, and error states preserve a clear next action.

## Maintenance rule

The repository does not keep a permanent gallery of discarded UI concepts. When a proposal is adopted, its production component becomes canonical and the superseded prototype and scoped styling are removed. New visual exploration should be temporary and deleted or promoted promptly.
