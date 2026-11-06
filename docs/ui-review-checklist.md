# Manual UI review since 3.0.0

The main checklist compares the last main-branch build labeled **3.0.0** (`7d8b073`, PR #70) with **3.0.21** (`f1f90ee`, PRs #78–#80). The final section covers changes between two snapshots that both used the 3.0.0 version number (`c992d2f` → `7d8b073)).

Use the unpacked build from this checkout. Reload the extension, refresh Workday, and open the toolbar popup separately. Use disposable plans with a lecture, a lab, alternating-week meetings, and a personal block. Try the affected screens at normal and narrow widths and with keyboard navigation. Mark an item after checking both its layout and its behavior. Record the browser, screen, steps and expected behavior next to any item that needs work.

## Workday widget and course cards

- [ ] **Header Help icon.** Hover and Tab to the question-mark icon to see **Help**, then open Help and return to the planner.
- [ ] **Import / Export menu.** Check the three groups, **Schedule files**, **Timetable downloads** and **Calendars**. Confirm each action is legible and its icon aligns. Open with the keyboard, navigate the entries with arrow keys, and close with Escape.
- [ ] **Search page.** On an empty Course List, check the instruction to search the page. On **View My Courses** or a Workday saved schedule, use the pageview icon labeled **Search page** to load courses from the current page.
- [ ] **Add A Course by Section link.** Paste a current HTTPS UBC Workday link copied from the **Section** column. Check that the correct section and delivery format appear. Try a course title link or invalid link to check the correction message.
- [ ] **Open a Workday section.** Click the section link on a supported course card. It opens in a new tab and the widget explains what to do if it is unavailable. Check that a course imported from a newly exported portable JSON file shows a recovery hint where its omitted link would be.
- [ ] **Average button destination.** Click **Average** on a course card and a Workday registration row. It opens the latest available course-wide UBCGrades page for that campus and course, such as `#UBCO-2025W-COSC-310-OVERALL` when that session is the latest available. Check **Average: N/A** for a course without results.

## Schedule view

- [ ] **Schedule overview.** Expand and collapse the overview. It shows whole-number **Scheduled hours/week** and a full weekday under **Busiest day**. Check a mixed lecture/lab plan and a plan containing personal blocks. The metrics summarize courses.
- [ ] **Alternating-week overview.** Switch **Week 1** and **Week 2** on a plan with alternating courses. A metric shows both weeks only when the values differ. An ordinary week is used for the summary even when a break interrupts some dates.
- [ ] **Split meeting ranges.** Find a section with the same day and time in two date ranges. It appears as one displayed block for that pattern. Different sections and times remain distinct, and conflict badges and lanes reflect actual overlapping dates.
- [ ] **Compare saved plans.** In the widget's Schedule view, open comparison with two plans. Select **Left plan** and **Right plan**, use **Swap sides**, switch weeks and scroll each timetable. Check the overview, added/removed/changed counts, marked blocks and **View changed sections**.
- [ ] **Set as Preferred from comparison.** Compare without editing, then select **Set as Preferred** on one side. Check the immediate status and the star in My Schedules. Check the guidance when there are fewer than two plans.

## Saved schedules and editing history

- [ ] **Read a saved note.** Open the note icon in My Schedules and in the browser popup, including when there is only one saved plan. Check the read-only view and **No notes yet**.
- [ ] **Edit a saved note.** Open **Edit note**, save multiline text, and reopen it. Check the character counter and Cancel. Rename, change preference and Quick Save the plan. The saved note should persist, including through a JSON export/import.
- [ ] **Undo and Redo working edits.** Find both icons beside **Clear**. Add or remove a course or block, clear the draft and load a plan. Step backward and forward and check the list, timetable, schedule name and save status.
- [ ] **Undo and Redo saved-plan changes.** Use disposable plans to try Quick Save, Save As New, JSON import and plan deletion. Undo and redo each and check the saved list. A new recorded edit clears Redo. Canceled actions leave the history intact, and history starts fresh after reloading the tab.
- [ ] **Popup refresh.** Save or rename a plan in the widget and check the popup's selected plan, heading and saved list. Switch time format and reopen the popup to check that the preference persists.

## Personal blocks

- [ ] **Add in Course List.** Use **Add personal block** beside **Add A Course** and select **Create new block**. The editor adds it directly to the working schedule, and the block appears above the course cards with Edit and Remove.
- [ ] **Add in Schedule view.** Open **Personal blocks** and create a block. It appears in **In this schedule**, as a dashed item on the timetable and in the Course List for the same draft.
- [ ] **Block fields and repeat options.** Try one date, weekly and alternating-week recurrence. Check title, optional category and color, start/end times, selected days and skipped dates. Check the first occurrence and a skipped date in the timetable.
- [ ] **Validation.** Try reversed times or dates, missing days and an invalid skipped date. Check the inline error, field layout and whether the editor keeps the user's input. Cancel an edit and verify the original block.
- [ ] **Edit, remove, search and resolve conflicts.** Search by title or category, then edit or remove a block that overlaps a course. Check both views, the conflict indicator and timetable lanes before and after the edit. Personal cards show block information in place of course grades and instructor ratings.
- [ ] **Save a draft containing blocks.** On a loaded plan, edit a block and check **Working - not saved**. Try Quick Save → Cancel, then Quick Save → Update. Also try **Save As New** with a block-only draft. Reload the saved copy to check its courses and blocks.
- [ ] **Save for reuse.** On a new schedule block, select **Save for reuse**. The action disappears when a saved copy matches every detail. Change a detail and check that it reappears. Creating or editing a schedule block alone leaves the reusable list as it was.
- [ ] **Reuse on another schedule.** Switch plans, then use **Saved personal blocks → Add to schedule**. Edit the new copy and check that the library entry and the original plan retain their own details.
- [ ] **Edit and remove a saved template.** In **Saved personal blocks**, use **Edit → Save reusable block** and try Cancel. Add the edited template to another plan. **Remove saved copy** removes the library entry while keeping existing plan blocks.
- [ ] **Popup block editing.** Open **Personal blocks** for the saved plan previewed in the popup. Add or edit a block, reopen the popup and load the plan in Workday to check that the change saved directly to that plan.

## Schedule files and downloads

- [ ] **Export WST schedule (.json).** From **Import / Export**, download one selected saved plan, then all saved plans. Check the plan picker and exported filenames. Export a plan with notes, colors and blocks. Confirm the file contains the attached plan data while keeping the local template library, Workday section IDs and links, and account information private.
- [ ] **Import WST schedule (.json).** Import a single-plan file. Check the success message and the added card in My Schedules. Import it again and check automatic names such as **(1)** and **(2)**. The current draft, preferred schedule and settings stay as they were.
- [ ] **JSON import errors.** Try a multi-plan backup, malformed JSON or a file over 5 MB. Check that the error says how to recover and that the saved-plan count is correct. The importer takes one file with one plan and respects the 10-plan limit.
- [ ] **Download PNG.** Use the separate action in the widget's **Import / Export** menu and in the popup. Check the timetable preview, cancel once, then download and compare with the preview. Try Week 1/2, AM/PM and 24-hour time, custom colors and a personal block. The image contains the full timetable at its natural proportions.
- [ ] **Download PDF.** Open its separate preview in the widget and popup. Switch **Portrait** and **Landscape**, inspect both pages, then download and compare. Page 1 is the complete timetable. Page 2 lists course and section details, meeting days/times, instructor and location. Try long titles, weekends and repeated meeting ranges.
- [ ] **Calendar export label and personal-block choice.** Open **Export calander file (.ics)** from **Import / Export** with a personal block in the draft. Try Cancel, **Courses only** and **Courses and personal blocks**. Import the resulting files into a disposable calendar to verify which events were included.
- [ ] **Google Calendar personal-block choice.** In Chrome, preview sync for a draft containing blocks. Check that **Courses only** is selected by default and that opting in changes the preview. Cancel the preview and confirm that the calendar stayed as it was.

## Help, Settings and browser builds

- [ ] **Report a problem.** In **Help**, check the three steps and contact information. Turn on **Record what happens**, reproduce a problem, then use **Download bug report**. Check that the file downloads locally and the download control becomes disabled after turning recording off or refreshing.
- [ ] **Developer credits.** In **Settings**, check **Gwantana Kiboigo** under **Lead Developer** and **Mahmoud Rabie** and **Adam Hassan** under **Contributors**. All three cards should be equally sized, with the names and complete GitHub/LinkedIn buttons inside the boxes at normal and narrow widths.
- [ ] **Appearance.** Check the light widget and popup and the standard timetable row spacing. Settings contains the remaining display controls.
- [ ] **Browser installation and site scope.** Load the Chrome or Firefox build and open signed-in UBC Workday. Verify that the widget and popup load. Firefox should show its calendar availability guidance and let you export ICS. Workday integration is scoped to the UBC tenant.

## Changes delivered while the version still said 3.0.0

Check these too if your reference is the earlier 3.0.0 snapshot, or if your redesign touches these surfaces.

- [ ] **Widget and schedule headings.** Check the logo beside the widget title, then compare the schedule name above its term in Course List, Schedule and the popup. Try a long name, **Working Schedule**, and **Multiple terms detected**.
- [ ] **Quick Save and Save As New.** Check both icons, below-button tooltips and status chips in both views. **Working - not saved** changes to **Saved Schedule** after a successful write. Quick Save confirms an update to the same plan. Save As New creates a distinct named plan. **No courses added yet** is the empty state.
- [ ] **Saved-plan controls and names.** Star, rename and delete disposable plans in the widget and popup. Duplicate names should be rejected even with different casing or extra spaces. Loading a plan or deleting the saved source should update the working schedule's title and save controls.
- [ ] **Filter and sort without losing courses.** Filter to one course, sort ascending and descending and return to the original order. Save or export while filtered, then clear the filter and confirm the full plan survived.
- [ ] **Workday import and navigation.** Check **View My Courses**, a Workday saved schedule, and registration search. Navigate between pages with the widget open, then use **Search page** again. A partial result or a page without course data should preserve already loaded courses and give actionable feedback.
- [ ] **Timetable layout and clashes.** Check weekend, early and late classes, **Week 1 / Week 2**, 24-hour time, scrolling and resize. Touching meetings should fit without a clash. Actual overlaps show separate lanes. Uncertain patterns are shown under **Meeting Times Unknown**.
- [ ] **Grade and instructor details.** Check **Average: …** or **Average: N/A**, the adjacent info control with the five-year average, and matched/missing instructor ratings. Try another color and a temporarily unavailable lookup. Confirm that buttons, tooltips and unavailable or stale states are readable.
- [ ] **ICS recurrence.** In a calendar client, check a disposable export for dates, local times across daylight saving, locations, accented names and verified exceptions. Compare two exports of the same plan for stable event IDs.
- [ ] **Chrome Google Calendar sign-in and preview.** Check Sign in, **Sync to Google Calendar**, preview and sign out. The preview lists Primary, the schedule name, Adding, Updating, Removing, Unchanged and skipped items. Confirm only against disposable data. Check that an unchanged resync previews zero changes.
- [ ] **Google Calendar plan isolation.** With two disposable plans, check the **Keep Both** and **Replace Previous** choices. Unrelated events should remain. Check that an expired preview or one made stale by a plan change asks for a fresh preview.

### Related verification notes

- [3.0.0 phase verification](phases-0-2-testing.md) and [widget and sync changes](ui-changes-testing.md)
- [Phase 3 manual checks](phase-3-testing.md)
- [Phase 4 manual checks](phase-4-testing.md) and [privacy and permissions](phase-4-privacy.md)
