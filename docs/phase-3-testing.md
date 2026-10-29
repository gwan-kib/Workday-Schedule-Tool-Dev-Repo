# Phase 3 — manual checks for build 3.0.8

Update the files in the folder used by your unpacked extension, reload **UBC Workday - Schedule Tool**, and refresh Workday. Chrome's Extensions page should show **3.0.8**. Keep the existing extension identity so saved plans remain available.

UI polish is confined to Phase 3 additions and altered elements. The requested Undo and Redo buttons now sit beside Clear. The existing header, toolbar, filter field, saved-schedule cards/actions, popup picker and week-control text use the accepted pre-polish baseline.

| Where | What to check | Expected result |
| --- | --- | --- |
| Schedule → Schedule overview | Load a representative nine-course plan. | Only **Scheduled hours/week** and **Busiest day** appear: **24** and **Friday**. No decimal places, dates, ranges, conflict counts or calculation paragraph. |
| Schedule overview | Load a plan with alternating-week classes that change the total hours or busiest day. | Only a differing metric shows **Week 1** and **Week 2** values. Equal values appear once. Hours round to whole numbers. Holidays, exceptions, reading breaks and partial first/last weeks do not reduce the representative weekly hours. |
| Main panel and popup | Inspect the timetable, courses and toolbar. | The separate conflicts/transitions disclosure, Section alternatives and Undo section swap controls are absent. Matching split-date records appear once per section/day/time; different sections and times remain distinct. The existing clash indicators/footer still work. |
| Header | Inspect Help and Import / Export. | Help is an icon with an accessible label. **Import / Export** replaces Export. The menu contains separate **Back up schedules (.json)** and **Import WST schedule** actions, alongside ICS and Google Calendar sync. The header uses **swap_vert**, download actions use **download**, and import uses **upload**. No backup toolbar/settings shortcut remains. |
| Import / Export → Back up schedules | Export all plans or a selected plan. | The backup dialog contains export controls only. JSON preserves supported saved plans/preferences and excludes account credentials/sync data. Unsaved working edits require saving first. |
| Import / Export → Import WST schedule | Export one named schedule, then select that single file to import. Repeat the same import twice. | The schedule is added automatically. Its name is kept if unused; collisions use the first available **(1)**, **(2)**, etc. Existing plans, preferred status, working courses and preferences stay unchanged. No Merge/Replace controls. Multi-schedule files and multiple selected files are rejected. |
| My Schedules → note icon | Open notes for a saved schedule, then select **Edit note**. Save, reopen, cancel another edit, and export/import the schedule. | Opening first shows read-only notes (or No notes yet). Editing is explicit. Save persists multiline text; Cancel preserves the previous note. Notes survive course updates, rename/preference changes and schedule export/import. Check both main panel and browser popup, including a single saved plan. |
| Page search button | Hover the former refresh button and inspect the empty course list. | Icon is **pageview**, tooltip is **Search page**, and the empty-state message says **Click the search button to find courses on this page.** It still reads courses from the current page. |
| Schedule → Compare saved plans | Compare two saved plans and select a preferred plan. | Both timetables and the simplified overviews appear. Viewing comparison does not alter snapshots; Set as Preferred remains explicit. |
| Download PNG / PDF → PNG | Export from the main panel and popup after choosing Week 1/2 and AM/PM/24H. | PNG is the complete timetable only, independent of scrolling/search. It uses the extension's purple header/grid, current course/lab colors, section names and times. No bracketed reference numbers, detail appendix, branding footer or explanation is added. |
| Download PNG / PDF → PDF | Export portrait and landscape, with long titles, multiple meeting patterns and weekends. | Exactly two pages: timetable first, course details second. Details include code, section, class type, title, instructor, building/floor/room, full weekday names and meeting times. Repeated patterns split around breaks do not duplicate the details. No numbered references. A very large plan keeps readable details on a taller second page rather than adding pages or losing courses. |
| Existing controls | Load/save/edit/clear a draft, cancel Quick Save, use Save As New, download ICS and open a valid Workday section link. | Existing save status and confirmation behavior remains correct. Section links open separately. No Workday registration change occurs. |
| Browser coverage | Repeat the main checks in Chrome and Firefox; use a narrow popup and keyboard navigation. | Controls remain usable, the timetable scrolls horizontally, dialogs close with Escape, and the popup has no comparison feature. Firefox's existing Google-sync-unavailable message remains. |

## Verification completed

- **103 automated tests passed**, including save/storage/calendar regressions, full-week statistics, alternate-week values, removed controls, single-schedule import, note editing, trusted links, split-date display and two-page export structure.
- Chrome and Firefox builds succeeded.
- Isolated Chromium browser checks passed for the new overview, removed controls, comparison/preference, Import/Export backup and single-schedule import, main/popup notes, malformed/multi-plan file rejection, automatic name suffixes, PNG/PDF downloads and a 420px popup. No browser script errors occurred.
- A private nine-course fixture was used locally to verify **24 hours / Friday**, non-duplicated timetable blocks and full course details. Private fixture data is not included in the repository.
- Portrait/landscape PDFs were parsed as **two-page** files and rendered for visual inspection. PNG and PDF timetable styling was visually checked. PDFs contain high-resolution image pages rather than selectable text.

Real-account Workday navigation/session handling, Firefox runtime behavior and single-schedule import across separate real installations remain manual checks. No registration or Google Calendar writes were performed during validation.


## Scoped UI checks

- Open the overview: metric cards and Week 1/2 chips remain polished; identical values appear once. Switching weeks preserves whether the overview is expanded.
- Open Notes from a saved card: only the added notes action and notes dialog receive new styling. Existing star/rename/delete actions keep their previous size, color, placement and behavior. Check read-only notes, Edit note, scrolling, character count, Cancel and Save note.
- Open Compare saved plans: check difference chips, expandable changes, preferred status, Swap sides and the retained teaching week. New comparison dialogs adapt to narrow windows; the existing main panel keeps its fixed-width layout.
- Open Import / Export: check grouped entries, upload/download/sync icons, keyboard navigation, single-file import, duplicate-name feedback and the saved-plan limit.
- Check PNG/PDF downloads: the schedule remains the same; the new PDF course-details page retains its improved typography and spacing.
- Existing baseline verification: 28 rendered main-panel/popup elements matched the accepted build after hover animations settled. Saved-schedule styling and its renderer match the original source exactly. All 103 automated tests and isolated Chromium feature checks passed.


## Undo (3.0.8)

Undo is a multi-step history of up to 50 completed course/schedule actions in the current Workday tab. It starts disabled, is disabled during loading/saving, and its tooltip names the next action. Reloading/closing the tab clears this history; popup and other-tab actions do not join this tab's history. This is separate from the removed section-swap feature.

| Action | Check after Undo |
| --- | --- |
| Add a course, including from a Workday registration card | Only that addition is removed; previous courses remain. A rejected duplicate does not consume an Undo step. |
| Delete a course | The course returns with its details and place in the schedule. |
| Clear | The entire previous course group returns, with its saved-source link and correct save status. Clearing an already empty draft adds no step. |
| Load another saved schedule or Search page for a different group | The previous working course group/source is restored as one action. Initial automatic page loading is not an Undo action. |
| Save As New or import one WST schedule | The newly added saved schedule is removed; the previous working schedule/source is retained. |
| Delete a saved schedule in this Workday tab | Its original ID, notes, courses and position return. A newer preferred selection is kept. Name collisions get the first available (1), (2), etc. |
| Remove a course, then Quick Save | The first Undo restores the previous saved courses; the working draft remains edited. The second Undo restores the removed course, making the draft saved again. |
| Click Undo repeatedly | Each completed action is reversed once, in reverse order, until the button is disabled. |

Undo never performs Workday registration or Google Calendar actions. It preserves unrelated saved plans and later notes/renames on a saved-course update. If newer course data exists in another window, it refuses to overwrite that data. If a saved restore fails, both the current state and the pending Undo step remain available for retry. The 10-saved-schedule limit still applies.

Verification: eight new history tests and an isolated packaged-browser flow covered single/bulk edits, saved additions/deletions/updates, duplicate/no-op handling, source state, limits/collisions, newer data, unrelated colors/metadata, failed persistence and retry, storage change notifications, and the adjacent Undo/Clear targets. All 103 tests passed; the browser reported no script errors.


## Redo (3.0.8)

Redo sits between Undo and Clear and reapplies the most recently undone course/saved-schedule action. It supports the same 50-step tab-local history, disabled/busy states, tooltip, saved-data validation, capacity rules and failed-write retry as Undo. A new successful course or saved-schedule action clears the Redo branch; no-op, duplicate, canceled and metadata-only actions do not. Reloading the tab clears both histories.

Manual checks:

1. Add or delete a course, click Undo, then Redo. The course list should return to the edited state. Both buttons should enable/disable according to the remaining steps.
2. Clear a full schedule, Undo, then Redo. Undo restores the entire group and source; Redo clears the group again.
3. Save As New, Undo, then Redo. The same saved schedule ID and name should return once, with the correct active-source status.
4. Delete a saved schedule, Undo, Redo, then Undo again. The same plan should disappear and return with its notes/details intact.
5. Remove a course and Quick Save, then Undo/Redo both steps. Working-course edits and saved-course updates remain separate actions.
6. Undo an imported WST schedule, then Redo. It should return once. If it cannot be saved, the current state and Redo step stay available for retry.
7. Undo a change, then make a different successful course edit. Redo should become disabled. Trying to add an existing course should leave Redo available.

Verification: all 103 tests passed, including six new Redo cases. The packaged Chromium interface passed repeated Undo/Redo, course/group edits, saved create/delete/update, import, same-ID restoration, branch clearing, duplicate handling, failed persistence/retry and Undo/Redo/Clear adjacency, with storage-change events and no script errors.
