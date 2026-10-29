# Phase 3 implementation — build 3.0.1

The current UI follows the requested simplified planning workflow. Section-alternative discovery, swap previews/Apply/Undo and the separate conflicts/transitions disclosure have been removed.

## Overview

`core/planner.js` calculates two representative teaching weeks using the timetable's recurrence selection, after excluding holiday/exception interruptions from this overview calculation. Matching meeting patterns split around a reading break count once. Hours are rounded to the nearest whole number; busiest day uses the full weekday name, with the earliest weekday winning a tie. Each metric appears once when both weeks agree, otherwise with separate Week 1/Week 2 values.

The overview contains only Scheduled hours/week and Busiest day. It has no date, decimal, average/range, conflict count, or explanation paragraph. This full-week overview policy does not change the actual-date meeting model used by conflict detection, calendar sync or ICS.

## Saved plans and backup

`plannerController.js` retains read-only, main-panel saved-plan comparison and explicit Set as Preferred. Back up schedules and Restore schedules are distinct entries under Import / Export, with separate dialogs. Help is icon-only with an accessible label. Backup merge/replace validation, confirmation, secret exclusion and the existing saved-storage schema remain unchanged.

## Timetable and visual downloads

The display combines matching records of one section/day/time across date ranges, while preserving source IDs and exact active dates for clash detection. Real overlaps still occupy separate lanes. Existing clash symbols/footer messages remain; the standalone conflicts/transitions panel is removed.

`exportTimetable.js` uses the same 30-minute rows, weekday columns, lane layout, section labels, time format and color tokens as the extension. Export follows the selected teaching week. PNG contains only this full timetable; it does not include the overview, detail appendix, reference numbers or a branding footer.

PDF contains exactly two pages in the chosen orientation: the timetable and course details. Details include section/type, title, instructor, building/floor/room, full weekday names and meeting times. Equivalent patterns split across teaching date ranges are consolidated. Oversized detail lists use a taller second page to preserve readable content while retaining two pages. Normal nine-course portrait and landscape examples fit A4.

Files are generated locally as SVG/canvas PNG and high-resolution image-PDF, with no upload or external rendering service. Workday URLs and internal account/section IDs are excluded from the printed display fields.

## Validation

See phase-3-testing.md for evidence and manual acceptance. The private saved-course fixture used locally for visual checks is not committed. No actual Workday registration or Google Calendar write was performed. The pull request remains a draft until manual acceptance and merge.
