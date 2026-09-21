# Study desk — a from-scratch lectures.lib concept

September 7, 2026 · Proposal only · `/ui-review` → Study desk

## Design thesis

Build around a study loop, not a collection of feature pages:

**Choose a week → inspect its material → select objectives → study → consult the source → return.**

The lecture gallery is the index. SLOs are the working checklist. The reader is the source. These are three presentations of the same curriculum context, with the same navigation, typography, and spacing.

## Visual system

- Georgia; 14 / 17 / 30 px interface sizes; normal weight for most elements.
- Near-white paper, charcoal document surrounds, one restrained blue accent.
- Typography and alignment establish hierarchy; borders separate sections, not every object.
- No sidebar, dashboard metrics, decorative UI illustrations, or instructional banners.
- Course/week context does the work of a page heading. Titles remain visible on lecture thumbnails for touch and keyboard users.
- Repeated SLO cards become ruled rows: objective first, source second, priority and confidence at the right.
- A thin confidence distribution shows the balance without a score or a wall of counts.
- Selected objectives get one shared study action, not a repeated button on each row.

The lecture previews use synthetic SVG sample slides. Their diagrams belong to the document fixtures, not the application chrome. Real PDFs would retain their own formatting.

## Interactive prototype

- Switch Lectures / SLOs without losing the week, selection, or confidence edits.
- Filter weeks and search the current destination's fixture material.
- Resume the last sample slide opened during this visit.
- Select objectives, change confidence, prioritize, filter priority, and study a set one at a time.
- Open a source while studying, keep the objective visible above it, and return to the same study item.
- Open/close contents, choose slides, zoom 100–400%, fit, and mark pages in the sample reader.
- Review a sample import in a focus-contained dialog. Missing week prevents finalization. Finalization adds a sample thumbnail only.

## Boundaries

This is not a production replacement or a complete implementation spec. MCF, the week choices, source page links, and slide contents are fixed fixtures. There are no genuine source-page mappings or PDF parsing. Import does not upload a file. Search is local substring matching, not library retrieval.

All state is memory-only and resets with the review's Reset button or a reload. Marks are local to the mounted reader. Saved study sets, exports, account utilities, actual PDF loading, and ink/gesture behavior remain production capabilities to preserve if the concept is adopted; they are not rebuilt here.

## Verification

Build and lint passed. Browser inspection covered the gallery, SLO list, source reader, and import dialog at the current narrow desktop viewport. Interaction checks covered selection, confidence, studying, source-and-back continuity, contents navigation, zoom, and import validation/finalization. No physical iPad or pencil validation is claimed.

The earlier September proposals remain accessible as separate review tabs. The production library, SLO implementation, and PDF viewer were not changed.
