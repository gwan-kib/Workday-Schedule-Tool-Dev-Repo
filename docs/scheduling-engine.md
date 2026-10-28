# Scheduling state, meetings and integrations

## Ownership

- `core/state.js` holds the current canonical courses, saved-plan identity and presentation settings.
- `core/scheduleStore.js` owns load/add/remove, search/sort selections, snapshot creation, comparison and normalized export selectors. Search/sort derive new arrays; they never reduce canonical save/export data.
- `mainPanel/courses/courseViewSorting.js` handles explicit three-click sort input. Applying a sort cannot toggle it.
- `mainPanel/courses/renderCourseObjects.js` renders escaped labels and binds controls without mutating courses or starting automatic requests. `courseLookupController.js` owns lookup states and hydration after rendering.
- `core/meetings.js` is the shared validated meeting model for the grid, conflicts, ICS and Google. `core/scheduleLayout.js` derives visible days, hours and exact-minute positions.
- `content.js` coordinates imports, confirmations and browser storage; saved-state UI changes occur only after successful writes. `popup.js` uses the same renderer and saved-data format.

## Dates and uncertainty

ISO calendar dates remain date-only strings. Date arithmetic does not reinterpret them through the viewer's local UTC offset. Actual meeting ranges, including every line of a multi-window course, determine selectable date windows; the UI does not guess academic term boundaries or merge different years into the same term name.

The grid defaults to weekdays, 08:00–21:00. Real weekend meetings add the corresponding columns; real earlier/later meetings extend the hours. Positions and conflicts use exact minutes and intersecting active dates, including recurrence parity and verified exception dates.

Invalid, unsupported, asynchronous or uncertain meeting patterns remain visible under **Meeting Times Unknown**, with a warning. They are excluded from both export methods. Alternating weeks need an explicit reliable first-meeting date, either in the Workday line (`First meeting: YYYY-MM-DD`) or normalized `meetingAnchors[lineIndex]` metadata. `meetingExceptions[lineIndex]` contains only verified date strings. The extractor does not invent either metadata field when Workday does not supply it. Ambiguous/nonexistent DST times are diagnosed as uncertainty.

No holiday or reading-break dates are guessed. Without verified term-specific exceptions, exports preserve Workday's meeting range and warn about that limitation. UBC meetings use `America/Vancouver`, independently of the computer's zone. UTC occurrence lists preserve local class time through DST without relying on a client's timezone-database interpretation of an ICS `VTIMEZONE` block.

## Persistence and imports

Legacy `wdSavedSchedules` arrays remain readable. The next confirmed successful write adds `wdScheduleSchemaVersion: 1`; a read never rewrites data. Malformed or future-version data blocks saved-plan edits and shows recovery guidance. Callback errors, quota failures and invalidated runtimes reject instead of reporting success.

Partial extraction returns requested/success counts, courses and failed IDs/classifications. Retry targets only failures. The current working plan remains intact until a complete result, or explicit acceptance of an incomplete result. Unsupported and logged-out pages are distinguished from an explicit empty-page result; replacing a nonempty plan with an empty result also requires confirmation.

Centralized semantic selectors support selected-section IDs and section links. A mutation observer handles new registration cards. Navigation preserves the working plan and asks the user to Refresh; reinjection/mount recovery does not add another extension shell.

## Calendar ownership and preview

Chrome targets the primary calendar only. Firefox remains ICS-only. Each Google event carries `wstSource`, `wstPlan` and `wstEvent` private markers plus a deterministic API ID. Sync compares managed content, restores manual edits to managed events, and never removes unrelated events. Loaded plans retain their sync identity during working edits; a new saved snapshot has a new identity. Unsaved imports derive an identity from their source section set.

Every sync, including no-op plans, fetches a read-only preview. Switching plans offers **Keep Both** / **Replace Previous**; replacement is limited to the previously selected managed plan. Counts, date windows, skipped meetings, preserved legacy imports and deletion warnings precede explicit confirmation. A one-use, ten-minute preview token stores the validated operations in extension-local storage without auth tokens, so background suspension cannot silently recompute a different plan. A changed working schedule, expired preview or changed remote managed-event snapshot requires a fresh preview.

Upserts have bounded concurrency and precede removals. Any failed upsert suppresses all removals; incomplete meeting data also defers removals. ETags prevent overwriting/removing an event changed after validation. A retry rebuilds a preview against current remote state. Old `wstSource`-only imports are retained and counted in the preview: review them in Google Calendar and manually remove only obsolete imports after confirming the new plan is correct. There is no silent legacy bulk-deletion step.

## External lookups

Grade/RMP lookups hydrate automatically. Requests have a ten-second header/body deadline, up to two retries for transient errors, Retry-After handling, and a four-request limit per execution context. Grade-session requests are bounded to ten per five-year lookup. One-hour caches coalesce duplicate in-flight requests; after failed refresh, any recovered stale values are explicitly labeled. Missing matches, unavailable statistics and network errors have distinct states and retry paths.

Course statistics use UBCGrades course-level rows, preferring an `OVERALL` row to avoid double-counting its sections. `reported` (or legacy `enrolled`) provides sample weights. The latest available year and five-year window are both displayed, with years, missing coverage, sample counts and a source link. Missing weights prevent fabricated pooled averages; a partial window is labeled with its actual coverage. No section/instructor-specific grade feature is introduced.

Reference sources checked during implementation: [UBCGrades v3](https://ubcgrades.com/api-reference/v3), [UBCGrades response/model definitions](https://github.com/DonneyF/ubcgrades/blob/master/app/models.py), [Calendar event resource](https://developers.google.com/workspace/calendar/api/v3/reference/events), [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545).
