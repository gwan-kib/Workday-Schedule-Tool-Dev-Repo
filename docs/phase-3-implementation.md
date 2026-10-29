# Phase 3 implementation â€” build 3.0.2

The current UI follows the requested simplified planning workflow. Section-alternative discovery, swap previews/Apply/Undo and the separate conflicts/transitions disclosure have been removed.

## Overview

`core/planner.js` calculates two representative teaching weeks using the timetable's recurrence selection, after excluding holiday/exception interruptions from this overview calculation. Matching meeting patterns split around a reading break count once. Hours are rounded to the nearest whole number; busiest day uses the full weekday name, with the earliest weekday winning a tie. Each metric appears once when both weeks agree, otherwise with separate Week 1/Week 2 values.

The overview contains only Scheduled hours/week and Busiest day. It has no date, decimal, average/range, conflict count, or explanation paragraph. This full-week overview policy does not change the actual-date meeting model used by conflict detection, calendar sync or ICS.

## Saved plans, notes and import

`plannerController.js` retains read-only, main-panel saved-plan comparison and explicit Set as Preferred. Back up schedules and Import WST schedule are distinct entries under Import / Export. The header uses swap_vert; export entries have download icons and import has upload, matching Google Calendar's sync icon style. The page-course reader uses the pageview icon and Search page tooltip.

Import accepts one version-1 WST JSON file containing exactly one saved schedule. It adds a new record with a fresh ID, retaining the original name or appending the first free (1), (2), etc. Existing snapshots, the working draft, preferred schedule and display/account settings are not replaced. Re-importing the same file adds another named copy. The existing 10-plan limit and file validation remain. Export a single selected plan to produce a compatible .wst.json file; an all-plan backup remains a separate export and is not accepted by this single-plan import.

Each main-panel and popup saved-schedule card has a notes action. It opens a read-only view, with a separate Edit note screen offering Save note and Cancel. Notes are plain text, limited to 10,000 characters, and included in saved storage and schedule files. Existing schedules default to empty notes without rewriting storage on read. Quick Save, preference changes and renaming preserve notes. Note saves reject deleted schedules and stale edits rather than recreating or overwriting them; persistence errors keep the draft editor open.

Help remains icon-only with an accessible label. Saved storage and backup schema versions remain at 1, with the optional notes field added compatibly. Imports exclude credential/account data and do not apply settings from the file.

## Timetable and visual downloads

The display combines matching records of one section/day/time across date ranges, while preserving source IDs and exact active dates for clash detection. Real overlaps still occupy separate lanes. Existing clash symbols/footer messages remain; the standalone conflicts/transitions panel is removed.

`exportTimetable.js` uses the same 30-minute rows, weekday columns, lane layout, section labels, time format and color tokens as the extension. Export follows the selected teaching week. PNG contains only this full timetable; it does not include the overview, detail appendix, reference numbers or a branding footer.

PDF contains exactly two pages in the chosen orientation: the timetable and course details. Details include section/type, title, instructor, building/floor/room, full weekday names and meeting times. Equivalent patterns split across teaching date ranges are consolidated. Oversized detail lists use a taller second page to preserve readable content while retaining two pages. The timetable page remains A4; the details page grows when necessary.

Files are generated locally as SVG/canvas PNG and high-resolution image-PDF, with no upload or external rendering service. Workday URLs and internal account/section IDs are excluded from the printed display fields.

## Validation

See phase-3-testing.md for evidence and manual acceptance. The private saved-course fixture used locally for visual checks is not committed. No actual Workday registration or Google Calendar write was performed. The pull request remains a draft until manual acceptance and merge.


## Scoped UI polish (3.0.8)

A shared planner stylesheet uses the existing indigo theme tokens, pale surfaces, rounded controls and typography in both the shadow-root main panel and popup. Dialogs use a compact default width and a wide comparison variant, a consistent header, reading area, action footer and status messages. Only new planner controls have the added focus, disabled and busy states. Existing saved-schedule cards, title/loading behavior, action sizes and colors, labels and picker layout retain the accepted baseline.

Overview metrics sit above the scrolling timetable, with separate Week 1/2 chips only when values differ. Comparison uses responsive columns, independent timetable scrolling, count chips, expandable differences and immediate preferred-state feedback. Import/Export has grouped menu entries with arrow/Home/End/Tab/Escape navigation. Notes separate reading from editing, preserve Cancel behavior, expose a character count and return focus after saves or dialog closure. Import feedback includes capacity, validation guidance and collision renaming. PDF detail cards use clearer code/title hierarchy, more spacing and course-color accents; the PNG remains timetable-only.


The UI correction restores existing shell dimensions, header/toolbar/filter styles, saved-card actions, popup picker layout and week-control wording from commit 3675ffb. Shared planner styles no longer target the widget shell or all existing controls. Retained refinements are limited to Phase 3 overview, notes, comparison, Import/Export, downloads and the altered Help control. An isolated browser comparison verified matching computed styles for 28 existing elements in the main panel and popup.


## Course/schedule Undo (3.0.8)

The Undo icon beside Clear uses a 50-entry tab-local history in core/scheduleUndo.js. The coordinator checkpoints successful single course edits, Clear, explicit group loads, Save As New, Quick Save course updates, single-plan import and saved-plan deletion. No-op, canceled, failed and metadata-only actions do not add entries. Saved inverses patch only affected records, validate newer course data, preserve unrelated saved records/metadata, respect capacity and resolve restore name collisions. Saved writes complete before working state and the history cursor change, allowing retry after failure. Undo restores the working group's saved source when available, retains later manual color choices, rerenders both views and exposes the next action in its tooltip. History is not persisted or shared with popup/other tabs; initialization does not create an entry.


## Redo

The history controller maintains an inverse stack for Redo. Planning either direction captures the actual pre/post state, including restore-name collisions and current metadata; only a successful commit moves the entry to the opposite stack. New recorded course/schedule changes clear the Redo stack, while no-op and metadata-only actions preserve it. The same targeted saved-record validation and persistence-before-working-state behavior protect both directions. The main-panel coordinator shares one restore path and blocks both controls while loading/saving. Redo uses the adjacent matching icon button; existing unrelated UI remains at its baseline.
