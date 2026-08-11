# UBC Workday - Schedule Tool (Developer Guide)

This repo contains a Manifest V3 browser extension with Chrome and Firefox package targets. It extracts course schedules from Workday, renders a weekly view, saves schedule snapshots, and exports calendars. This document covers local setup, build steps, and project structure.

Make sure [Node.js](https://nodejs.org) is installed on your device.

---

## Contributing

- Read this WHOLE file BEFORE you start touching ANYTHING.
- Keep commits focused and small.
- Avoid adding new permissions unless necessary.
- Follow existing formatting and code style (plain JS, no TypeScript).
- If you run into issues, let me know: gwantanak.3@gmail.com

---

## Quick Start

1. Install dependencies

```powershell
npm install
```

2. Build the extension

Chrome/default build:

```powershell
npm run build
```

Firefox build:

```powershell
npm run build:firefox
```

Use `npm run build:chrome` when you want to be explicit about the Chrome target, or `npm run build:browsers` to package both targets from the shared source. `npm run dev` is not currently a working full extension dev workflow.

There is no useful automated `npm test` script wired up right now; browser builds are the baseline verification check.

3. Load the packaged build

### Chrome

- Run `npm run build:chrome`.
- Open `chrome://extensions`.
- Enable "Developer mode".
- Click "Load unpacked".
- Select `build/chrome/`.

### Firefox

- Run `npm run build:firefox`.
- Open `about:debugging` and choose **This Firefox**.
- Choose **Load Temporary Add-on**.
- Select `build/firefox/manifest.json`.

After making source changes, rebuild and reload the extension in the browser you are testing. If you already had Workday open, refresh that tab too so the content script reloads cleanly.

See `docs/browser-manifests.md` for the browser-specific manifest and packaging details.

---

## Project Structure

- `src/` extension source
  - `src/background.js` background entry for RMP and Google Calendar messages
  - `src/content.js` content script entry and main orchestration point
  - `src/panel.html` extension panel UI
  - `src/popup.js` extension popup entry
  - `src/popup.html` extension popup UI

  - `src/api/averageGrades/` UBC Grades API integration
  - `src/api/rateMyProfessor/` Rate My Professors lookup logic
  - `src/core/` shared core helpers used across features
  - `src/css/` styles (copied into `dist/css/` at build)
    - `src/css/css-imports.css` browser/dev reference import list
    - If you add a panel CSS file, add it to `const cssFiles` in `src/mainPanel/shell/loadMainPanel.js`
    - If you add popup CSS dependencies, import them from `src/popup.css`
    - `src/css/colors/` color tokens and theme files
      - `src/css/colors/theme-tokens.css` color tokens (where colors are set for the whole extension; need to change a color? use this file)
    - `src/css/formatting/` layout and component styling
  - `src/exportLogic/` calendar export helpers
    - `src/exportLogic/exportIcs.js` `.ics` download export
    - `src/exportLogic/googleCalendar/` Google Calendar sync, auth, and event building
  - `src/extraction/` Workday DOM parsing and schedule extraction
    - `src/extraction/extractCourses.js` full schedule extraction
    - `src/extraction/singleCourseImport.js` manual/single-course imports from Workday links
    - `src/extraction/meetingPatternsInfo.js` meeting pattern parsing helpers
  - `src/mainPanel/` schedule panel UI rendering and interactions
    - `src/mainPanel/courses/` course list rendering, sorting, averages, RMP buttons, color controls
    - `src/mainPanel/schedules/` schedule rendering, saved schedules, collisions, modals
    - `src/mainPanel/settings/` course color and hover-tooltip settings
    - `src/mainPanel/shell/` panel loading, view switching, footer notes
  - `src/utilities/` shared utilities (debug, DOM, shadow mount, etc.)

- `dist/` shared build output used by the browser packages
- `build/chrome/` generated Chrome package
- `build/firefox/` generated Firefox package
- `node_modules/` dependencies installed by npm (local dev only)

---

## Average Grade Feature

The average buttons pull data from the public UBC Grades API (`https://ubcgrades.com/api`). Registration page buttons live directly in Workday rows, and course-card buttons load in the extension panel. Unsupported courses or missing API data show an unavailable/N/A state.

Relevant files:

- `src/api/averageGrades/gradesApiCall.js`
- `src/api/averageGrades/registrationAverageButtons.js`
- `src/mainPanel/courses/renderCourseObjects.js`
- `src/content.js`

---

## Professor Rating Feature

The Rate My Professors buttons use the background process to fetch rating data and then render it in the course list when a supported instructor match is found.

Relevant files:

- `src/api/rateMyProfessor/rmpApi.js`
- `src/background.js`
- `src/mainPanel/courses/renderCourseObjects.js`

---

## Saved Schedules

Saved schedules are stored in extension-local storage and support save, load, star, rename, and delete actions from the main panel.

Relevant files:

- `src/mainPanel/schedules/scheduleStorage.js`
- `src/mainPanel/schedules/scheduleView.js`
- `src/mainPanel/schedules/scheduleModals.js`

---

## Popup

The toolbar popup previews the preferred saved schedule and reuses the main schedule renderer and saved-schedule action patterns.

Relevant files:

- `src/mainPanel/schedules/scheduleStorage.js`
- `src/mainPanel/schedules/scheduleView.js`
- `src/popup.js`
- `src/popup.css`

---

## Google Calendar Sync

Calendar export supports both `.ics` downloads and direct Google Calendar sync. Google sign-in/sign-out controls live in Settings, while export actions are in the panel export menu.

Chrome currently uses `chrome.identity.getAuthToken()` from the background process. Firefox requires a different OAuth path using `identity.launchWebAuthFlow()` / `identity.getRedirectURL()`; that migration is intentionally handled by the dedicated Firefox OAuth issues rather than by the shared WebExtension API audit.

Relevant files:

- `src/exportLogic/exportIcs.js`
- `src/exportLogic/googleCalendar/calendarIntegration.js`
- `src/exportLogic/googleCalendar/eventBuilder.js`
- `src/background.js`
- `src/content.js`

---

## Course Colors

Course colors are grouped by normalized course identity and support manual color overrides from representative course cards.

Relevant files:

- `src/mainPanel/settings/courseColorSettings.js`
- `src/mainPanel/settings/courseColorController.js`

---

## Hover Tips

Hover tips use the custom `wd-hover-tooltip` / `data-tooltip` system instead of browser-native `title` attributes.

Relevant files:

- `src/mainPanel/settings/hoverTooltipSettings.js`
- `src/mainPanel/settings/hoverTooltipController.js`
- `src/css/formatting/hover-tooltip.css`
- `src/css/colors/hover-tooltip-colors.css`

---

## Manifest Notes

Browser-specific source manifests live in:

- `manifest.chrome.json`
- `manifest.firefox.json`

Both reference the same built assets in `dist/`, including:

- `dist/background.js`
- `dist/content.js`
- `dist/popup.js`
- `dist/popup.html`
- `dist/panel.html`
- `dist/css/...`

The manifests declare the shared storage/identity permissions and Workday/RMP/Google host permissions, while browser-specific identity/background metadata stays in the matching source manifest. See `docs/browser-manifests.md` for details.

---

## WebExtension API Compatibility

Shared non-authentication browser API usage is audited in `docs/webextension-api-compatibility.md`.

The shared source intentionally keeps callback-style `chrome.*` calls for runtime messaging, `runtime.getURL()`, `runtime.lastError`, and `storage.local`, because Firefox supports those documented APIs through its Chrome-compatibility namespace. Do not introduce a `browser.*` rewrite or polyfill solely for style.

Keep browser-specific branching limited to APIs whose behavior or coverage actually differs, currently Google OAuth.

---

## Troubleshooting

- If the extension loads but nothing appears: confirm you are on a `*.myworkday.com` page that lists registered courses, then reload the extension.
- If CSS is missing: rebuild and verify `dist/css/` exists in the packaged build.
- If class averages fail: the API may not have data for the course, or the request may be blocked by network settings.
- If professor ratings fail: the instructor may not have a matching Rate My Professors profile, or the lookup may be blocked.
- If Google Calendar sync fails in Chrome: confirm the Chrome build is loaded, the `identity` permission is present, and the Google account was signed in from Settings.
- If Google Calendar sign-in is unavailable in Firefox: the Firefox OAuth migration has not landed yet; use `.ics` export until that work is complete.
- If you see `Extension context invalidated`, reload the extension and refresh the open Workday tab.

### Using the Debug Tool (for more detail, see src/utilities/debugTool.js)

Logging is controlled by `src/utilities/debugTool.js`. The current source has `global` logging enabled. Turn it off or narrow it with local/log switches when a change gets noisy.

Quick ways to control logs:

1. Global switch: edit `src/utilities/debugTool.js` and set:

```js
const logConfiguration = {
  global: true,
  local: {},
  log: {},
};
```

2. To see the output of a specific method/scope, ensure the debug import has been added to the file, adjusting the relative path as needed:

```js
import { debugLog } from "./utilities/debugTool.js";
```

Then add this near the top of the file you care about (example for schedule extraction, courseExtraction method):

```js
debugLog({ global: true, local: { courseExtraction: true } });
```

After changes:

- Rebuild the target browser package.
- Reload the extension from `chrome://extensions` in Chrome or `about:debugging` in Firefox.
- Refresh the Workday tab if it was already open.
- Open DevTools on the Workday page and check the console.

Tip: each log includes a prefix like `[UBC Workday - Schedule Tool (file: courseExtraction)]` and many logs include an `id` to help you filter.

### Adding a New Debug Log (eg. for file newFeatureFile.js)

1. Create (or reuse) a scoped logger at the top of the file:

```js
import { debugFor } from "../utilities/debugTool.js";
const debug = debugFor("newFeatureFile");
```

2. Add a log inside your new method:

```js
function newFeatureMethod(rows) {
  // code...
  debug.log({ id: "newFeatureMethod.done" }, "NewFeatureMethod row count", { rowsCount: rows.length });
}
```

3. Turn logs on for that scope while debugging:

```js
debugLog({ global: true, local: { newFeatureFile: true } });
```

Notes:

- Use a stable `id` (e.g., `feature.action`) so you can filter or disable specific logs later.
- Prefer structured objects for context rather than long strings.
