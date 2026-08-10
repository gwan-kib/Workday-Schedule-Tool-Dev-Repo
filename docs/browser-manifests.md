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

## Firefox extension identity

The Firefox manifest has a stable Gecko extension ID:

`ubc-workday-schedule-tool@gwan-kib.github.io`

This ID belongs only in `manifest.firefox.json` under `browser_specific_settings.gecko.id`. The Chrome manifest keeps its existing Chrome-specific identity configuration unchanged.

Treat the Gecko ID as permanent once Firefox builds are distributed. Changing it later can cause Firefox to treat the build as a different extension and can break update continuity. It also changes the identity used to derive Firefox OAuth redirect handling.

When configuring the Firefox Google OAuth client and redirect URI in issue #22, build/load the Firefox package with this ID and use the redirect returned by `identity.getRedirectURL()`. Do not configure OAuth against a temporary-install ID or a different Gecko ID.

## Firefox data collection declaration

The Firefox manifest uses Mozilla's built-in data-collection consent system and declares `websiteContent` as required. Workday-derived course/instructor/schedule information can leave the extension through UBCGrades, RateMyProfessors, and Google Calendar features, so declaring `none` would be inaccurate.

The Firefox manifest sets `strict_min_version` to `140.0`, the first Firefox desktop release with the built-in data-collection consent experience, rather than allowing installation on older versions without a separate custom consent flow.

See `docs/firefox-data-collection.md` for the data-flow audit, why no other categories are currently declared, and the maintenance rule for future external integrations.

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

Firefox temporary add-ons are development-only and must be loaded again after Firefox restarts. Because the Gecko ID is declared in the source manifest, rebuilding or temporarily reinstalling the package does not change the configured extension identity.

## Generated root manifest

Chrome builds also run `scripts/sync-default-manifest.js`, which copies `manifest.chrome.json` to the repository-root `manifest.json`.

The root `manifest.json` is generated output and is ignored by Git. This preserves the existing Chrome development workflow where the repository root can still be loaded as an unpacked extension. New browser-specific testing should prefer `build/chrome/` or `build/firefox/` so the package being tested matches the intended browser exactly.

## Firefox migration boundaries

The Firefox source manifest now includes:

- the stable Gecko extension ID from issue #23,
- the AMO data-collection declaration and Firefox 140 minimum from issue #24.

Google OAuth configuration/implementation remains separate work in issues #22 and #21. If the Firefox OAuth implementation introduces credential/token handling that falls under Mozilla's `authenticationInfo` category, update the data-collection declaration before distribution.

Chrome-only fields such as the extension `key` and Chrome `oauth2` block must remain out of `manifest.firefox.json`.
