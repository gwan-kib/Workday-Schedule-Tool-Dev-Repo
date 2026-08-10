# Browser manifests

The extension keeps browser-specific manifest source files instead of treating the repository-root `manifest.json` as the source of truth.

## Source manifests

- `manifest.chrome.json` is the Chrome Manifest V3 source manifest. It keeps the existing Chrome extension key, Google `oauth2` configuration, and `background.service_worker` entry.
- `manifest.firefox.json` is the Firefox Manifest V3 source manifest. Shared metadata, permissions, host permissions, icons, action configuration, content scripts, and web-accessible resources should stay aligned with the Chrome manifest.

When changing a shared field such as the extension name, version, description, icons, content scripts, or host permissions, update both source manifests in the same change.

## Background execution

Both browser manifests use the same built background bundle: `dist/background.js`.

- Chrome runs it through `background.service_worker`.
- Firefox runs it as an MV3 background event page through `background.scripts`.
- The Firefox manifest sets `background.type` to `module` because `vite.background.config.js` emits the background bundle as an ES module.

Do not duplicate `src/background.js` or create a Firefox-specific background implementation unless a later compatibility issue requires it.

## Browser builds

The source code is compiled once through the shared Vite pipeline and then packaged with the manifest for the selected browser.

- `npm run build:chrome` builds shared assets and creates a loadable Chrome package at `build/chrome/`.
- `npm run build:firefox` builds shared assets and creates a loadable Firefox package at `build/firefox/`.
- `npm run build:browsers` compiles the shared assets once and packages both browser targets.
- `npm run build` remains an alias for `npm run build:chrome` to preserve the existing Chrome-first development workflow.

Each packaged directory contains:

- `manifest.json` copied from the matching browser source manifest,
- the four extension icons,
- the shared `dist/` directory produced by Vite.

The packaged `build/` directory is generated output and is ignored by Git.

## Loading a local build

### Chrome

1. Run `npm run build:chrome`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked** and select `build/chrome/`.

### Firefox

1. Run `npm run build:firefox`.
2. Open `about:debugging` and choose **This Firefox**.
3. Choose **Load Temporary Add-on**.
4. Select `build/firefox/manifest.json` (or another file in `build/firefox/`).

Firefox temporary add-ons are development-only and must be loaded again after Firefox restarts.

## Generated root manifest

Chrome builds also run `scripts/sync-default-manifest.js`, which copies `manifest.chrome.json` to the repository-root `manifest.json`.

The root `manifest.json` is generated output and is ignored by Git. This preserves the existing Chrome development workflow where the repository root can still be loaded as an unpacked extension. New browser-specific testing should prefer `build/chrome/` or `build/firefox/` so the package being tested matches the intended browser exactly.

## Firefox migration boundaries

The Firefox source manifest intentionally does not include unfinished Firefox-specific configuration yet:

- A stable Gecko extension ID is handled by issue #23.
- Mozilla Add-ons data-collection declarations are handled by issue #24.

Chrome-only fields such as the extension `key` and Chrome `oauth2` block must remain out of `manifest.firefox.json`.
