# Phase 5 manual checks

Reload the existing unpacked extension from `build/chrome` and refresh Workday. Use version **3.0.19**. Firefox packages use `build/firefox`.

| Feature | Try it | Expected result |
| --- | --- | --- |
| Share a draft | Choose **Import / Export → Share schedule**. Review a draft that contains courses, notes and a personal block. Create a share link, then opt in to personal blocks and create another. | Preview shows course, meeting, instructor and room information. Notes, saved names, settings, Workday IDs and authenticated links are excluded. The personal block appears only after opt-in. Copy the link or download its share file. |
| Open and compare | Open the link in a browser with the extension installed. Alternatively, paste the link or choose a shared JSON file under **Open shared schedule**. | The link lands on Workday Home and opens the widget with a calendar preview and **Schedule name**. Enter a new name and choose **Save schedule**. Empty and duplicate names keep the preview open. Cancel saves nothing. A saved copy appears under My Schedules and can be compared with **Compare saved plans**. |
| Link and file limits | Share a schedule with enough distinct meeting data to exceed the link limit. Try an altered or incomplete link. | Above 4,096 characters, **Download share file** replaces the link. Invalid input shows an error. Files and decoded payloads are capped at 512 KB. |

Share links point to UBC Workday Home. The schedule is carried in the URL fragment and has no expiry or revocation. With the extension installed, the fragment is cleared before Workday reads it. The extension holds a pending preview in memory for the same tab during sign-in and Workday page changes, until you save or cancel. A pending preview can reopen for up to ten minutes. If sign-in opens a different tab, paste the original link into **Open shared schedule**. Without the extension, the link follows normal Workday navigation, and Workday’s sign-in redirect may forward the fragment. Anyone with the link or file can read the schedule, so review personal block text before including it.
