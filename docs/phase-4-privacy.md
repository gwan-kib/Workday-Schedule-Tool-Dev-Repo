# Phase 4 privacy and permissions audit

Audited source: version 3.0.10. This describes application behavior and provides store-disclosure wording; it does not claim that a store listing has been published or approved.

| Destination | When | Fields sent | Retention in the extension |
| --- | --- | --- | --- |
| UBC Workday (`wd10.myworkday.com/ubc/`) | Read current page or explicitly import a section | Supported UBC section path/ID; requests use the existing signed-in Workday session (`credentials: include`). No registration requests are generated. | Saved course snapshots remain locally until deleted/uninstalled. |
| UBCGrades (`ubcgrades.com/api/v3/`) | Automatically when applicable cards render; data is reused for registration buttons | Campus, academic session, subject and course number in URL paths. No student name, account ID, notes, personal block or Google token is added. | Coalesced one-hour in-memory caches, bounded to 500 entries per cache. Expired data may be returned with a stale marker after a failed refresh. Reload/background restart clears that context's memory. |
| Rate My Professors (`www.ratemyprofessors.com/graphql`) | Automatically for supported instructor cards | Normalized instructor name and UBC campus/school identifier, fixed GraphQL query and public client authorization header. No student identity or schedule is added. Existing matching is not verified instructor identity. | One-hour bounded memory cache; stale fallback after refresh failure. |
| Google Fonts / Gstatic | Load existing Material Symbols icons in panel/popup | Font family/style request, ordinary request headers and network metadata. No schedule payload is added. Browser referrer policy controls referring information. | Browser-managed HTTP/font cache. |
| Google Identity and Calendar (Chrome only) | Explicit sign-in; then explicit preview and confirmed sync | Identity authorization through Chrome. Calendar requests carry a bearer token and event summary (course code/title/section), instructor/format description, location, meeting dates/times/time zone, recurrence and WST event identifiers. Personal block title/category/time data is included only after explicit opt-in. | Chrome manages cached OAuth tokens. Extension storage retains a signed-in flag, managed sync metadata and a pending preview (10-minute validity); an expired preview is rejected but may remain stored until replaced, disconnect, or clearing data. |
| External destination pages | Explicit grade/profile/section link clicks | The selected public course/profile URL or authorized Workday section URL; ordinary browser navigation headers. | Browser-managed navigation history/cache. |

Automatic grade/RMP lookups remain enabled without an API opt-out, as requested. Requests use bounded concurrency, timeouts, bounded retry, rate-limit handling and shared expiring caches. No analytics, tracking pixels, advertising or automatic diagnostic uploads are implemented. Third parties still receive normal network metadata such as IP address and headers.

## Local data and exports

Saved schedules, notes, per-plan personal blocks, the reusable personal-block library, preferred state and color/tooltip/time preferences stay in extension-local storage. The appearance and spacing feature has been removed; any old appearance preference is ignored and is no longer exported. Working blocks are draft edits alongside courses and require Quick Save or Save As New to update a saved plan. Creating/editing a block separately stores a reusable local template immediately. Templates are never automatic conflicts in other plans: adding one creates an independent per-plan copy. Individual plan deletion removes that plan; removing a template does not change plan instances. Uninstall or clearing extension data removes the extension's saved data. Deleting a plan does not delete files already downloaded or events previously sent to Google. Local storage does not have an automatic retention timer.

The library (up to 500 validated templates) is local in `wdPersonalBlockLibrary`; only blocks attached to selected saved plans are included in schedule files. The library itself is not added to portable shared files. The first updated main-panel startup seeds the library from existing saved-plan blocks, without rewriting those plans. Library entries persist until explicitly removed or extension data is cleared.

Version-1 WST JSON is a deliberate user-initiated export. It includes selected/all saved plans, course/instructor/meeting fields, notes, personal blocks and allowlisted display settings. The new optional fields remain compatible with old records. Export code strips Workday section IDs/links and ignores unknown properties, account metadata and credentials. Import validates the schema, block occurrences, dates, limits and names before saving. Older files that contain validated section links remain readable. Newly exported portable plans cannot use those omitted section links to reopen Workday; course meetings, colors and notes remain available. Treat the exported personal/course content as private and review it before sharing.

ICS/Google exports default to courses only. If a loaded saved plan has personal blocks, a fresh inclusion choice appears each time, before file creation/Google preview; Cancel aborts. PNG/PDF are visual copies of the displayed plan and include its personal blocks. No sharing-link feature is introduced.

Signing out clears local signed-in state and pending preview and attempts to clear Chrome's cached token. It does **not** revoke the Google OAuth grant, sign the user out of Google, or remove events. Revoke access through Google Account → Third-party connections. Firefox is ICS-only and has no identity or Google API host permission.

## Permissions

Both manifests inject only on `https://wd10.myworkday.com/ubc/*` and restrict accessible resources to that tenant. Workday host access is narrowed from all `*.myworkday.com` hosts to `wd10.myworkday.com`. Browser host permissions are origin-wide: a path in `host_permissions` is not a security boundary; content-script matching and section URL validation enforce the UBC path. RMP host access supports the background GraphQL request; Chrome Google API access supports confirmed Calendar sync. UBCGrades requests use its CORS-enabled API from the content context; no new broad host grant is added. `storage` supports saved plans/preferences; Chrome alone retains `identity` for its OAuth flow. No cookies, browsing-history, tabs, clipboard or telemetry permission is added.

Firefox retains required `websiteContent` because automatic lookups transmit course/instructor content derived from Workday. It retains its existing Gecko ID and Firefox 140 minimum. This phase removes obsolete Firefox Google/identity grants; it does not add an OAuth flow or claim a full accessibility audit.

## Diagnostics

Production logging defaults off. Settings → Privacy & diagnostics permits session-only opt-in and a local redacted JSON download. The logger discards free-form messages, Error objects, API/DOM payloads, URLs and arbitrary fields, even in diagnostic mode. The bounded ring contains only code-defined scope/event IDs and severity (up to 100 events), plus format/extension version and enabled state. It contains no times, course names, instructor names, block text, URLs, tokens or account fields. Turning the option off clears the ring; reload resets the option. Developer `debugLog({ global: true })` follows the same sanitization, and a per-call `on: true` cannot bypass a disabled master switch. No report is automatically transmitted.

## Ready-to-use store disclosure

This extension reads UBC Workday course information and saves your plans locally. It automatically sends course/campus/session identifiers to UBCGrades and instructor names/campus identifiers to Rate My Professors to display additional information; these lookups have no separate opt-out. Existing icons use Google Fonts. Chrome optionally sends course event data, and personal commitments only if you opt in, to your primary Google Calendar after sign-in, preview and confirmation. Firefox supports ICS downloads only. Exported files can include notes and personal commitments; review them before sharing. There is no analytics or advertising tracking, and diagnostics are optional, local and redacted. Signing out clears local access state but does not revoke Google's authorization or delete calendar events.

## References and remaining release checks

- [Chrome match patterns and ignored host-permission paths](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns).
- [Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).
- [Mozilla built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

Real-account Chrome/Firefox network inspection, actual browser-store consent/display, store submission review, and Google sign-in/revoke behavior need manual release checks. No registration or real Google Calendar writes were made during development.
