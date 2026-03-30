# UBC Workday - Schedule Tool (Developer Guide)

This repository contains a Manifest V3 Chrome extension for UBC Workday. It extracts course data from Workday pages, renders schedule and list views in a shadow-DOM panel, stores schedule snapshots locally, and provides a popup preview for saved schedules.

---

## Current Project State

The extension currently includes:

- a content script that mounts the main Workday panel
- a background service worker used for Rate My Professors requests
- a browser action popup that previews saved schedules
- local Chrome storage for saved schedules, course color settings, and tooltip settings
- external lookups for UBC Grades and Rate My Professors

Main user-facing features today:

- course list rendering with filtering and sorting
- weekly schedule rendering with conflict highlighting
- saved schedules with favorite/default selection
- popup schedule preview
- custom course color assignments
- hover tooltip settings
- `.ics` export
- registration-page average grade buttons
- Rate My Professors buttons on course cards

---

## Requirements

- Node.js
- npm
- Chrome or another Chromium browser that supports Manifest V3

---

## Local Setup

1. Install dependencies:

```powershell
npm install
```

2. Build the extension:

```powershell
npm run build
```

3. Load it in Chrome:

- Open `chrome://extensions`
- Enable Developer mode
- Click Load unpacked
- Select the repository root that contains `manifest.json`

4. After source changes:

- Run `npm run build` again
- Reload the extension in `chrome://extensions`
- Refresh any already-open Workday tabs so old content-script contexts do not linger

---

## Build Notes

The supported build command is:

```powershell
npm run build
```

That command builds three separate Vite entries:

- `vite.background.config.js` -> `dist/background.js`
- `vite.content.config.js` -> `dist/content.js` plus copied panel/CSS/icon assets
- `vite.popup.config.js` -> `dist/popup.js` plus copied popup assets

The repository also contains `npm run dev`, but it currently points at the default Vite build watch flow and does not provide a working full-extension development workflow.

---

## Project Layout

- `manifest.json`
  Declares the MV3 extension, content script, popup, permissions, and web-accessible resources.

- `src/background.js`
  Background service worker entry. Handles async message requests for professor-rating lookups.

- `src/content.js`
  Main content-script entry. Boots the shadow-root panel, loads Workday data, wires events, and coordinates rendering.

- `src/popup.js`
  Toolbar popup entry. Renders a saved-schedule preview and favorite controls outside the Workday page.

- `src/panel.html`
  Markup for the in-page panel that is injected into Workday.

- `src/popup.html`
  Markup for the browser action popup.

- `src/averageGrades/`
  UBC Grades integration and the registration-page average button logic.

- `src/core/`
  Shared state used across the content-script UI.

- `src/css/`
  Static styling copied into `dist/css/`.

- `src/exportLogic/`
  `.ics` export logic.

- `src/extraction/`
  Workday DOM extraction, grid detection, and course parsing.

- `src/mainPanel/`
  Main panel controllers and renderers, including saved schedules, schedule view, tooltips, settings, and course colors.

- `src/rateMyProfessor/`
  Professor-name normalization and Rate My Professors request flow.

- `src/utilities/`
  Shared utilities such as DOM helpers, debug helpers, and shadow-root mounting.

- `dist/`
  Built extension output consumed by `manifest.json`.

---

## Permissions and External Services

Current extension permissions are intentionally small:

- `storage`

Current host permissions:

- `https://*.myworkday.com/*`
- `https://www.ratemyprofessors.com/*`

External services currently used by the codebase:

- `ubcgrades.com` for class averages
- `ratemyprofessors.com` for professor ratings
- Google Fonts for Material Symbols in the UI

If you update documentation or privacy copy, keep those external dependencies in mind.

---

## Storage

The extension currently stores this data locally with Chrome storage:

- saved schedules
- preferred/favorite schedule id
- course color assignments
- hover tooltip enabled/disabled setting

The popup and the content script both read from the same saved-schedule storage.

---

## Troubleshooting

- If the extension loads but no UI appears, make sure you are on a supported `*.myworkday.com` page and rebuild/reload the extension.
- If styles are missing, confirm `dist/css/` exists and that `npm run build` completed successfully.
- If you reload the extension while a Workday tab is already open, refresh the tab too. Old content-script contexts can throw `Extension context invalidated`.
- If class averages fail, the course may not have supported data from UBC Grades.
- If Rate My Professors returns no result, the instructor name may not normalize cleanly or there may be no matching profile.

---

## Debug Logging

Logging is controlled by `src/utilities/debugTool.js`.

By default, most scopes are disabled. A common local debugging flow is:

1. Turn on global logging in `src/utilities/debugTool.js`.
2. Optionally enable only the scope you care about with `debugLog({ global: true, local: { someScope: true } })`.
3. Rebuild the extension.
4. Reload the extension and refresh the Workday tab.
5. Inspect the page console or extension views in DevTools.

When adding new logs:

- use `debugFor("scopeName")`
- prefer stable `id` values such as `feature.action`
- log structured objects instead of long string dumps

---

## Contributing

- Keep changes focused.
- Avoid adding permissions unless a feature truly requires them.
- Preserve the existing plain-JavaScript code style unless the project direction changes.
- If you touch CSS assets, make sure copied files and any loader references still match the build output.

Questions: `gwantanak.3@gmail.com`
