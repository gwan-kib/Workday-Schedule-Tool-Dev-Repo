# Manual tests for the latest schedule and sync UI

Reload the updated extension and refresh Workday. These checks cover visible changes; fixture tests do not establish real-browser layout or live Google behavior.

| Test | What to look for |
| --- | --- |
| Schedule heading, panel and popup | Your saved schedule name is first, with its term below, e.g. **Fall Plan** then **Winter Term 1**. Rename/load another saved schedule and check the heading updates. Multiple-term plans list their terms; an unnamed plan says Working schedule. |
| Course-view heading | Above the course-list controls, expect a plain schedule name with the term below. It must match the schedule-view heading, update after saving/loading/renaming, and have no pill background or rounded border. |
| Week controls | Week 1 / Week 2 sit inside the schedule controls, beneath the heading, outside the scrolling timetable. Repeated toggles must not duplicate controls. Weekly classes remain in both; anchored alternating sections switch weeks. |
| Grade buttons | Supported course-list and Workday registration buttons read **Average: 80.0%** (with the actual latest value), or **Average: N/A** when unavailable. The five-year number stays outside the grade button. Clicking a resolved grade still opens UBCGrades. |
| Info control styling | The control to the right uses the Google Material Symbols **info** icon, theme colors and a two-pixel border. Its cursor stays the normal arrow when hovered. Hover/Tab-focus still shows the five-year average, or N/A, without a details paragraph. |
| Sync confirmation labels | Expect **Target Calendar: Primary**, **Schedule Name:**, and **Adding**, **Updating**, **Removing**, **Unchanged** each on its own line. There is no Dates row or older-unscoped-imports warning. |
| Skipped list | A schedule with missing/invalid meeting data lists **Skipped:** followed by the actual course/section and reason for each skipped meeting. A schedule with no skips says **Skipped: None**. Long lists should scroll within the dialog. |
| Confirmation spacing and safety | A blank line separates the holiday sentence from the preceding summary/warnings. Cancel still makes no calendar changes. Old events without schedule IDs remain preserved even though their warning is hidden. |

Term labels prefer explicit term metadata; otherwise they summarize the meeting-date seasons for display only. Week selection does not change the full saved/exported schedule. Holiday exclusions still require verified exception dates supplied in Workday data.
