# FCOM.lib UX System Specification

Status: Active  
Scope: Netlify application  
Reference implementation: `app/components/CurriculumCard.tsx` and `app/components/CurriculumPageToolbar.tsx`

## Purpose

This document defines the shared visual and interaction rules for the Lectures, SLOs, and Question Bank sections. It is the UX contract for future implementation work: common behavior belongs in shared components, and section-specific differences must be intentional and documented here.

## Design principles

1. **Functional neutrality.** The interface should feel like a precise study workspace rather than a consumer mobile application.
2. **One hierarchy per screen.** Avoid redundant headings, counts, icons, or descriptions.
3. **Progressive disclosure.** Dense SLO and question content remains collapsed until requested.
4. **Shared patterns are truly shared.** Visually identical cards and toolbars must use the same React component rather than parallel markup.
5. **User correction beats inference.** AI-extracted metadata can be corrected, but editing controls appear only where they logically belong.

## CurriculumCard contract

All Lecture, SLO, and Question Bank collection cards use `CurriculumCard`.

### Invariants

- Collapsed height: `--curriculum-card-height`
- Title typography: `--curriculum-card-title-size`
- Horizontal padding: `--curriculum-card-padding-x`
- Rail width: `--curriculum-card-rail-width`
- Course, title, lecturer, and curriculum week follow the same order and typography.
- The count occupies the upper card rail.
- The primary action occupies the lower card rail.
- Expanded content appears beneath the unchanged card header.

### Intentional variants

| Section | Week control | Count | Primary action | Expanded content | Utility actions |
| --- | --- | --- | --- | --- | --- |
| Lectures | Editable | SLO count with hover preview | Open lecture | None | Favorite and remove |
| SLOs | Read-only | SLO count | View/Hide SLOs | Objectives, flags, Luna re-parse, Open lecture | None |
| Question Bank | Read-only | Approved question count | View/Hide questions | Approved questions and answers | None |

Week assignment is editable only from Lecture cards and Lecture details. SLO and Question Bank cards display the assigned value without offering a second editing surface.

## CurriculumPageToolbar contract

Lectures, SLOs, and Question Bank use `CurriculumPageToolbar`.

The toolbar contains, in order:

1. Current collection or filesystem location
2. Filters
3. Sorting
4. Section-level actions

Controls may wrap as a group on narrower layouts, but their internal order must not change.

### Section actions

- Lectures: upload is presented separately as the drop zone.
- SLOs: Export SLOs.
- Question Bank: Take quiz and Draft with Luna.

## Design tokens

Shared curriculum measurements are defined in `app/globals.css` under the `--curriculum-*` namespace. Components must consume these tokens instead of introducing duplicate literal measurements.

Current tokens cover:

- Sidebar and lecture-detail column widths
- Page padding
- Collapsed card height and gap
- Card title size and horizontal padding
- Card rail width
- Week-control size

New repeated visual decisions should become tokens only when they are shared by multiple components or define a system-level constraint.

## Component review page

The internal reference page is available at `/ui-review` and uses fixture data only. It is not linked from the product navigation.

The page includes:

- Shared page toolbar
- Editable Lecture card
- Expandable SLO card
- Expandable Question Bank card
- Favorite state
- Long-title and unassigned-week edge cases

Use this page to review system-wide component changes before modifying page-specific styling.

## Change checklist

Before merging a curriculum UX change:

- Confirm the change belongs in a shared component or is an intentional variant.
- Check collapsed and expanded card states.
- Check long titles and unassigned weeks.
- Check that editing controls appear only in authorized sections.
- Check desktop and narrow responsive layouts.
- Verify the Netlify production build.
- Update this document if the UX contract changes.
