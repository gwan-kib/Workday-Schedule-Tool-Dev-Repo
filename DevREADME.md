# UBC Workday - Schedule Tool (Developer Guide)

This repo contains a Chrome (Manifest V3) extension that extracts course schedules from Workday, renders a weekly view, and exports calendars. The codebase now uses `WXT`, `React`, `TypeScript`, `Zustand`, `Vitest`, and `Playwright`.

Make sure Node.js (https://nodejs.org) is installed on your device.

---

## Contributing

- Read this WHOLE file BEFORE you start touching ANYTHING.
- Keep commits focused and small.
- Avoid adding new permissions unless necessary.
- Follow existing formatting and code style.
- If you run into issues, let me know: gwantanak.3@gmail.com

---

## Quick Start

1. Install dependencies

```powershell
corepack pnpm install
```

2. Start a local WXT build

```powershell
corepack pnpm dev
```

3. Build the extension for production

```powershell
corepack pnpm build
```

3. Load in Chrome

- Open `chrome://extensions`
- Enable "Developer mode"
- Click "Load unpacked"
- Select `.output/chrome-mv3`

After making changes, rebuild or let WXT watch, then click "Reload" on the extension. If Workday was already open, refresh that tab too so the content script reloads cleanly.

Useful checks:

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
```

---

## Project Structure

- `entrypoints/`
  - `background.ts` background service worker
  - `content.tsx` content script entry and shadow-root mount
  - `popup.html` popup HTML entry
- `src/components/`
  - `content/` injected Workday UI
  - `popup/` toolbar popup UI
  - `shared/` reusable React components
- `src/domain/`
  - `courseList/` course rendering and sorting
  - `export/` `.ics` export helpers
  - `extraction/` Workday DOM parsing
  - `grades/` UBC Grades integration
  - `rmp/` Rate My Professors integration
  - `schedule/` schedule rendering and collision detection
  - `settings/` settings and saved schedule helpers
- `src/store/`
  - `useContentStore.ts` Zustand state for the injected UI
- `src/lib/`
  - shared types, schemas, logging, DOM helpers, and font helpers
- `src/css/`
  - shared theme/layout CSS reused by the new UI
- `.output/chrome-mv3/`
  - generated extension output from WXT

---

## Average Grade Feature

The "Class Averages (Past 5 Years)" button in Workday pulls data from the public UBC Grades API (`https://ubcgrades.com/api`). It only shows values for supported UBC courses. If the API does not return data, the UI shows "Average: unavailable".

Relevant files:

- `src/domain/grades/gradesApi.ts`
- `src/domain/grades/registrationAverageButtons.ts`
- `entrypoints/content.tsx`

---

## Professor Rating Feature

The Rate My Professors buttons use the background service worker to fetch rating data and then render it in the course list when a supported instructor match is found.

Relevant files:

- `src/domain/rmp/rmpApi.ts`
- `entrypoints/background.ts`
- `src/domain/courseList/renderCourseObjects.ts`

---

## Manifest Notes

WXT generates the manifest and extension assets into `.output/chrome-mv3/`.

Load that folder as the unpacked extension after running `corepack pnpm build` or `corepack pnpm dev`.

---

## Troubleshooting

- If the extension loads but nothing appears: confirm you are on a `*.myworkday.com` page that lists registered courses, then reload the extension.
- If CSS is missing: rebuild and verify `.output/chrome-mv3/` exists.
- If class averages fail: the API may not have data for the course, or the request may be blocked by network settings.
- If professor ratings fail: the instructor may not have a matching Rate My Professors profile, or the lookup may be blocked.
- If you see `Extension context invalidated`, reload the extension and refresh the open Workday tab.

### Using the Debug Tool (for more detail, see `src/lib/debug.ts`)

Logging is controlled by `src/lib/debug.ts`. By default, `global` logging is `false`, so nothing prints unless you enable it.

Quick ways to enable logs:

1. Temporary global on (fastest): edit `src/lib/debug.ts` and set:

```js
const logConfiguration = {
  global: true,
  local: {},
  log: {},
};
```

2. To see the output of a specific method, ensure this import is has been added to the file:

```js
import { debugLog } from "./lib/debug";
```

Then add this near the top of the file you care about (example for schedule extraction, courseExtraction method):

```js
debugLog({ global: true, local: { courseExtraction: true } });
```

After changes:

- Rebuild (`corepack pnpm build`)
- Reload the extension in `chrome://extensions`
- Refresh the Workday tab if it was already open
- Open DevTools (ctrl+shift+i) on the Workday page and check the console

Tip: each log includes a prefix like `[UBC Workday - Schedule Tool (file: courseExtraction)]` and many logs include an `id` to help you filter.

### Adding a New Debug Log (eg. for file newFeatureFile.js)

1. Create (or reuse) a scoped logger at the top of the file:

```js
import { debugFor } from "../lib/debug";
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
