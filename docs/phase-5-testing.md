# Phase 5 manual checks

Reload the existing unpacked extension from `build/chrome` and refresh Workday. Use version **3.0.16**. Firefox packages use `build/firefox`.

| Feature | Try it | Expected result |
| --- | --- | --- |
| Ranked suggestions | Load a draft with a course that has multiple open sections, then open **Schedule → Find schedule suggestions**. Rank Later starts above the other preferences and choose **Find suggestions**. | The extension looks up the loaded courses without pasted links. **Section search results** shows the offering and number of sections found. Up to five conflict-free schedules are ranked by the enabled preferences. |
| Hard constraints | Load a lecture and lab for the same course alongside a course with a single activity type. Add a personal block that overlaps an alternate section. | The public catalog is searched for both courses. A linked group stays fixed when compatibility cannot be verified. Personal blocks remain fixed and an overlapping alternate is excluded. Missing, closed, variable-time and ambiguous alternatives are skipped. |
| Apply and undo | Select a suggestion and choose **Apply to draft**. Try **Undo** and **Redo** before saving. | The draft changes with one history step. Saved copies update only through the regular save controls. |
| Share a draft | Choose **Import / Export → Share schedule**. Review a draft that contains courses, notes and a personal block. Create a share link, then opt in to personal blocks and create another. | Preview shows course, meeting, instructor and room information. Notes, saved names, settings, Workday IDs and authenticated links are excluded. The personal block appears only after opt-in. Copy the link or download its share file. |
| Open and compare | Open the link in a signed-in Workday browser with the extension installed. You can also paste the link or choose a downloaded file under **Open shared schedule**. | Preview appears before any save. **Add to saved schedules** creates a new copy with a unique name, leaving existing plans and the current draft intact. Use **Compare saved plans** to compare it. |
| Link and file limits | Share a schedule with enough distinct meeting data to exceed the link limit. Try an altered or incomplete link. | Above 4,096 characters, **Download share file** replaces the link. Invalid input shows an error. Files and decoded payloads are capped at 512 KB. |

The optimizer reads course codes, sections and dates from the draft and matches each offering in the [public UBC Course Schedule](https://courses.students.ubc.ca/course-search). The extension sends only each course code to the catalog, without Workday credentials. It follows up to six pages per course, checks up to 24 distinct courses and stops ranking at 30,000 option checks. If ranking reaches that limit, it shows the best plans found so far.

The catalog shows published status and regular meeting times. It does not establish live seat eligibility, detailed meeting exceptions, or lecture/lab compatibility. Verify those details in Workday. An alternate sourced from the catalog has a UBC catalog link and may not have a Workday section link or room information. The optimizer preserves loaded section details for sections that stay in place.

For a repeatable example, UBC's 2026–27 Winter Term 1 listing returned DATA_O 311 lecture 101 plus labs L01–L05. The optimizer reported all six and kept the draft's lecture/lab pair fixed. The same run found ECON_O 101 sections 001 and 002, ranked 002 for its later start, and verified Apply and Undo in the unpacked Chrome package with a test draft.

Share links hold compressed schedule data in the URL fragment. They need no schedule upload and have no expiry or revocation. Open links from an already signed-in session. If a sign-in redirect interrupts the link, paste the original link into **Open shared schedule**. Anyone with the link or file can read its preview. Review personal block text before including it.
