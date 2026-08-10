# Browser manifests

The extension now keeps browser-specific manifest source files instead of treating the repository-root `manifest.json` as the source of truth.

## Source manifests

- `manifest.chrome.json` is the Chrome Manifest V3 source manifest. It keeps the existing Chrome extension key, Google `oauth2` configuration, and `background.service_worker` entry.
- `manifest.firefox.json` is the Firefox source manifest. Shared metadata, permissions, host permissions, icons, action configuration, content scripts, and web-accessible resources should stay aligned with the Chrome manifest.

When changing a shared field such as the extension name, version, description, icons, content scripts, or host permissions, update both source manifests in the same change.

## Generated root manifest

For now, `npm run build` finishes by running `scripts/sync-default-manifest.js`, which copies `manifest.chrome.json` to the repository-root `manifest.json`.

The root `manifest.json` is generated output and is ignored by Git. This preserves the existing Chrome development workflow where the repository root is loaded as an unpacked extension without making the generated file a third manifest source.

Browser-specific build/package commands are intentionally deferred to issue #27.

## Firefox migration boundaries

The Firefox source manifest intentionally does not include unfinished Firefox-specific configuration yet:

- Firefox background execution is handled by issue #20.
- A stable Gecko extension ID is handled by issue #23.
- Mozilla Add-ons data-collection declarations are handled by issue #24.
- Browser-specific build/package commands are handled by issue #27.

Chrome-only fields such as the extension `key` and Chrome `oauth2` block must remain out of `manifest.firefox.json`.
