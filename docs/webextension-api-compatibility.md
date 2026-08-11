# Shared WebExtension API compatibility

This document records the Firefox compatibility audit for the extension's shared, non-authentication browser API usage.

## Compatibility approach

The shared source keeps using the `chrome.*` namespace and callback-style APIs where they already work in both browsers. Firefox implements the documented WebExtension APIs under the `chrome` namespace as a compatibility layer and supports callback-style use, so converting working code to `browser.*` or adding a polyfill would add unnecessary branching.

Browser-specific behavior should stay isolated to code that truly differs between browsers. At the time of this audit, that boundary is Google OAuth; the rest of the audited extension API surface is shared.

## Audited API usage

### Runtime messaging

Used in:

- `src/background.js`
- `src/api/rateMyProfessor/rmpApi.js`
- `src/exportLogic/googleCalendar/calendarIntegration.js`

APIs/patterns:

- `chrome.runtime.onMessage.addListener(...)`
- asynchronous `sendResponse(...)` with `return true`
- `chrome.runtime.sendMessage(..., callback)`
- `chrome.runtime.lastError` inside callbacks

Result: shared. Firefox supports runtime messaging through the `chrome` compatibility namespace, including callback-based message handling and keeping `sendResponse` alive by returning `true`.

### Extension resource URLs

Used in:

- `src/mainPanel/shell/loadMainPanel.js`

API:

- `chrome.runtime.getURL(...)`

Result: shared. Firefox resolves the same call to a `moz-extension://...` URL and Chrome resolves it to a `chrome-extension://...` URL. Feature code must not hard-code either scheme.

### Local extension storage

Used in:

- `src/mainPanel/schedules/scheduleStorage.js`
- `src/mainPanel/settings/courseColorSettings.js`
- `src/mainPanel/settings/hoverTooltipSettings.js`
- `src/exportLogic/googleCalendar/calendarIntegration.js` for the Calendar sign-in flag

APIs:

- `chrome.storage.local.get(..., callback)`
- `chrome.storage.local.set(..., callback)`

Result: shared. The existing callback form works through Firefox's `chrome` compatibility namespace. The existing `localStorage` fallbacks remain as defensive non-extension fallbacks and are not needed for normal Chrome or Firefox extension execution.

### Tabs/windows APIs

No `chrome.tabs.*` or `chrome.windows.*` use was found in the source during this audit. No compatibility adapter is needed for those APIs.

## Intentional browser-specific boundary: Google OAuth

`src/exportLogic/googleCalendar/calendarIntegration.js` still uses Chrome's `identity.getAuthToken()` and `identity.removeCachedAuthToken()` path. Firefox's identity flow is different: it uses `identity.launchWebAuthFlow()` and `identity.getRedirectURL()`.

That OAuth implementation is intentionally not part of this audit. It is tracked by the dedicated Firefox OAuth issues. Until that work lands:

- Chrome continues to use the existing `getAuthToken()` path.
- Firefox reports a Firefox-specific "not available in this build yet" message instead of telling the user to open `chrome://extensions`.
- The stable Gecko extension ID must remain unchanged because it participates in Firefox redirect URL handling.

Do not scatter browser checks into schedule storage, RMP, popup/content messaging, or panel resource loading to compensate for the OAuth difference.

## Maintenance rule

When adding a new browser API call:

1. Check whether Firefox supports that API/method and the way it is being called.
2. Keep the existing `chrome.*` callback style when Firefox supports it.
3. Add a browser-specific adapter only when behavior or API coverage genuinely differs.
4. Keep browser-specific user-facing instructions accurate for the runtime the user is actually running.
5. Update this document if the shared API surface or intentional browser-specific boundaries change.
