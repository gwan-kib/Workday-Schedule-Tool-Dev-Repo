# Phases 0–2 verification

Branch: `gwan/phases-0-2`, based on `c992d2f` (the current remote main when work began).

## Automated checks

After `npm ci`, run `npm test` (Node.js 22+) and `npm run build:browsers`.

`npm test` rebuilds shared assets and runs offline tests against synthetic Workday data, mocked browser/Calendar/network APIs, and packaged content-script interactions in jsdom. ICS files are independently parsed/expanded with ICAL.js, alongside byte-folding, escaping, UID, date and occurrence assertions. These checks do not establish real-browser rendering, live Workday markup compatibility, OAuth operation, or actual calendar-client import behavior.

Scope implemented on the branch:

| Phase | Issues | Verification focus |
| --- | --- | --- |
| 0 | #31, #32, #35, #34, #39 | Browser gating; five-course filtered save/export; literal labels; sort transitions; offline fixtures |
| 1 | #38, #46, #36, #37, #65, #44, #45, #64 | Shared meetings; date windows; exact conflicts; weekends/hours; state ownership; partial import; storage errors; semantic selectors/navigation |
| 2 | #43, #33, #60, #47, #63 | Stable ICS; safe plan-scoped sync; mandatory previews; weighted course statistics; bounded/cached APIs |

## Manual checks still required

Use the same browser profile if verifying that existing saved schedules survive an update. Reload the extension and refresh the Workday tab after rebuilding. No registration actions are needed.

1. **Install and live Workday navigation — Chrome and Firefox.** Load `build/chrome/` using Chrome's **Load unpacked**. In Firefox, load `build/firefox/manifest.json` through **This Firefox → Load Temporary Add-on**. Open View My Courses, a saved Workday schedule, and registration search. Refresh/import, follow a supported section link, add/remove a course in the extension, navigate away/back, and reopen the panel. Expect current course details, one widget/action stack per location, and a useful message on unsupported/logged-out pages.
2. **Saved plans, search, sorting and popup.** Load several courses, search for just one, save and export. Clear the search, reload the extension, and confirm the complete plan survived. Check ascending/descending/original sort across search and edits. Star, rename and delete a disposable saved plan from both the panel and popup; reopen to confirm persistence. Existing plans/colors should remain intact.
3. **Actual timetable layout.** In panel and narrow popup, check weekday-only schedules and any available Saturday/Sunday, early (07:00) or late (22:00) classes. Switch real date windows, toggle AM/PM, resize/reopen, and inspect scroll access and block placement. Touching classes must not conflict; real overlaps must. Check multi-term courses and alternating/unknown patterns against Workday. Uncertain patterns must remain in Meeting Times Unknown.
4. **ICS import in real clients.** Export and import a disposable plan into Google Calendar and another available client (Outlook or Apple Calendar). Verify first/last dates, all recurring occurrences, exact times before/after DST, locations, international text, weekend classes and verified exceptions. Re-export/import unchanged data and check the client's duplicate/update behavior. Stable UIDs alone cannot control every client's import policy. Unknown holidays/breaks are deliberately not guessed.
5. **Chrome Google sign-in and preview.** Sign in, initiate sync, inspect primary target/plan/dates/counts/skips, then Cancel and verify no calendar changes. Confirm once, then repeat unchanged: another preview is required and should show no additions/updates/removals. Sign out/reconnect and check the auth controls. Firefox must offer ICS while keeping direct Google controls unavailable.
6. **Multiple Google plans and resilience.** With disposable plans A/B, exercise Keep Both and Replace Previous. Verify only the selected prior managed set is replaced and a personal/unrelated calendar entry is untouched. Edit one managed event manually, then preview/resync its plan: the extension content should be restored. During a disposable sync, interrupt the connection; old events must remain if an upsert fails, and retry must not create duplicates. Legacy marker-only events remain preserved with a warning; review/remove obsolete ones manually after verifying the new set.
7. **Preview lifetime and real background suspension.** Leave a preview open while Chrome suspends/restarts the extension worker, then confirm within ten minutes. Also change the working plan or an existing managed Google event before confirmation: require a fresh preview. An expired preview must not write. Confirming a preview for one plan must never apply a newer preview from another tab.
8. **Live grades/RMP and offline recovery.** Compare latest-year and five-year course values, covered/missing years, sample counts and source links with UBCGrades for UBCO/UBCV examples. Check matched/unmatched instructors, repeated renders, and unavailable grades. Temporarily block the API or go offline: expect a bounded error/retry or explicitly stale cached state, with no false new averages. Inspect the coverage/source text for readable layout in Workday rows and extension cards.

Record browser/version, tested commit, course/term context and result for each check. Real-account tests above were not performed by the implementation agent. The roadmap's reviewed/merged completion policy still applies; its GitHub issue checkboxes have not been marked complete merely because code and local tests exist.
