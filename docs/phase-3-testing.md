# Phase 3 — manual checks for build 3.0.1

Update the files in the folder used by your unpacked extension, reload **UBC Workday - Schedule Tool**, and refresh Workday. Chrome's Extensions page should show **3.0.1**. Keep the existing extension identity so saved plans remain available.

| Where | What to check | Expected result |
| --- | --- | --- |
| Schedule → Schedule overview | Load a representative nine-course plan. | Only **Scheduled hours/week** and **Busiest day** appear: **24** and **Friday**. No decimal places, dates, ranges, conflict counts or calculation paragraph. |
| Schedule overview | Load a plan with alternating-week classes that change the total hours or busiest day. | Only a differing metric shows **Week 1** and **Week 2** values. Equal values appear once. Hours round to whole numbers. Holidays, exceptions, reading breaks and partial first/last weeks do not reduce the representative weekly hours. |
| Main panel and popup | Inspect the timetable, courses and toolbar. | The separate conflicts/transitions disclosure, Section alternatives and Undo section swap controls are absent. Matching split-date records appear once per section/day/time; different sections and times remain distinct. The existing clash indicators/footer still work. |
| Header | Inspect Help and Import / Export. | Help is an icon with an accessible label. **Import / Export** replaces Export. The menu contains separate **Back up schedules (.json)** and **Restore schedules (.json)** actions, alongside ICS and Google Calendar sync. No backup toolbar/settings shortcut remains. |
| Import / Export → Back up schedules | Export all plans or a selected plan. | The backup dialog contains export controls only. JSON preserves supported saved plans/preferences and excludes account credentials/sync data. Unsaved working edits require saving first. |
| Import / Export → Restore schedules | Load a backup, inspect Merge/Replace, cancel, then confirm with disposable plans. | Restore has its own file selector and preview. Cancelling/rejecting invalid JSON leaves data intact. Merge skips identical copies and resolves incoming name/ID collisions; Replace needs checked confirmation. Test replacement with disposable data or another browser profile. |
| Schedule → Compare saved plans | Compare two saved plans and select a preferred plan. | Both timetables and the simplified overviews appear. Viewing comparison does not alter snapshots; Set as Preferred remains explicit. |
| Download PNG / PDF → PNG | Export from the main panel and popup after choosing Week 1/2 and AM/PM/24H. | PNG is the complete timetable only, independent of scrolling/search. It uses the extension's purple header/grid, current course/lab colors, section names and times. No bracketed reference numbers, detail appendix, branding footer or explanation is added. |
| Download PNG / PDF → PDF | Export portrait and landscape, with long titles, multiple meeting patterns and weekends. | Exactly two pages: timetable first, course details second. Details include code, section, class type, title, instructor, building/floor/room, full weekday names and meeting times. Repeated patterns split around breaks do not duplicate the details. No numbered references. A very large plan keeps readable details on a taller second page rather than adding pages or losing courses. |
| Existing controls | Load/save/edit/clear a draft, cancel Quick Save, use Save As New, download ICS and open a valid Workday section link. | Existing save status and confirmation behavior remains correct. Section links open separately. No Workday registration change occurs. |
| Browser coverage | Repeat the main checks in Chrome and Firefox; use a narrow popup and keyboard navigation. | Controls remain usable, the timetable scrolls horizontally, dialogs close with Escape, and the popup has no comparison feature. Firefox's existing Google-sync-unavailable message remains. |

## Verification completed

- **82 automated tests passed**, including save/storage/calendar regressions, full-week statistics, alternate-week values, removed controls, separate backup/restore dialogs, trusted links, split-date display and two-page export structure.
- Chrome and Firefox builds succeeded.
- Isolated Chromium browser checks passed for the new overview, removed controls, comparison/preference, Import/Export backup and restore, malformed-file rejection, replacement confirmation, PNG/PDF downloads and a 420px popup. No browser script errors occurred.
- A private nine-course fixture was used locally to verify **24 hours / Friday**, non-duplicated timetable blocks and full course details. Private fixture data is not included in the repository.
- Actual portrait/landscape PDFs were parsed as **two-page A4** files and rendered for visual inspection. PNG and PDF timetable styling was visually checked. PDFs contain high-resolution image pages rather than selectable text.

Real-account Workday navigation/session handling, Firefox runtime behavior and restore across separate real installations remain manual checks. No registration or Google Calendar writes were performed during validation.
