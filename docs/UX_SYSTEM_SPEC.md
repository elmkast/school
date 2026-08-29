# FCOM.lib UX system

Last updated: August 29, 2026

## Design language

FCOM.lib is a restrained scientific workspace: neutral surfaces, compact controls, strong typography, square geometry, and minimal decorative iconography. The lecture archive is deliberately darker and more visual than the study workspaces, while controls remain consistent and functional.

## Application frame

- No sidebar.
- Sticky top bar with FCOM.lib, Lectures, SLOs, search, import, and compact account utilities.
- Exactly one active primary destination.
- Search becomes active when text is entered; clearing search does not create another permanent navigation item.

## Lecture archive

- The archive is the default Lectures experience and replaces the former card list and Home placeholder.
- First-page PDF previews are the primary navigation objects.
- Course and week headings provide hierarchy without nested folders.
- Weeks appear newest first.
- Hover/focus captions must remain readable and keyboard-accessible.
- Course filtering belongs in the archive header.

## SLO workspace

- SLO cards use the shared `CurriculumCard` geometry.
- Objective text is hidden by default to preserve scanability.
- The primary card action toggles View SLOs / Hide SLOs.
- Expanded cards place Luna re-parse and Open lecture at the bottom.
- Week is read-only in this workspace.

## Lecture viewer

- PDF is the primary object; notes live directly below it.
- Luna occupies a distinct conversation pane.
- Either pane can be hidden without closing the lecture.
- Notes autosave and never require a Save button.
- Functional icons are allowed for bookmark, pen-related controls, close, and delete.

## Interaction principles

- A click should have one destination or one expansion effect, never both.
- Destructive actions require confirmation.
- AI-proposed replacements require review and explicit approval.
- Empty, loading, and unavailable-preview states must preserve a clear next action.
- Avoid counts, headings, and helper copy that repeat information already visible.
