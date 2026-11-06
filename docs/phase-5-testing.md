# Phase 5 manual checks

Reload the existing unpacked extension from `build/chrome` and refresh Workday. Use version **3.0.17**. Firefox packages use `build/firefox`.

| Feature | Try it | Expected result |
| --- | --- | --- |
| Share a draft | Choose **Import / Export → Share schedule**. Review a draft that contains courses, notes and a personal block. Create a share link, then opt in to personal blocks and create another. | Preview shows course, meeting, instructor and room information. Notes, saved names, settings, Workday IDs and authenticated links are excluded. The personal block appears only after opt-in. Copy the link or download its share file. |
| Open and compare | Open the link in a signed-in Workday browser with the extension installed. You can also paste the link or choose a downloaded file under **Open shared schedule**. | Preview appears before any save. **Add to saved schedules** creates a new copy with a unique name, leaving existing plans and the current draft intact. Use **Compare saved plans** to compare it. |
| Link and file limits | Share a schedule with enough distinct meeting data to exceed the link limit. Try an altered or incomplete link. | Above 4,096 characters, **Download share file** replaces the link. Invalid input shows an error. Files and decoded payloads are capped at 512 KB. |

Share links hold compressed schedule data in the URL fragment. They need no schedule upload and have no expiry or revocation. Open links from an already signed-in session. If a sign-in redirect interrupts the link, paste the original link into **Open shared schedule**. Anyone with the link or file can read its preview. Review personal block text before including it.
