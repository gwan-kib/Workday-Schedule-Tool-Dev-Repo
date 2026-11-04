# Firefox data collection declaration

Version 3.0.9 retains `browser_specific_settings.gecko.data_collection_permissions.required: ["websiteContent"]`, Firefox 140 minimum and the existing Gecko ID.

Firefox is ICS-only: the manifest no longer requests `identity` or a Google API host grant. Automatic UBCGrades requests send course/campus/session identifiers, and Rate My Professors requests send instructor names and UBC campus identifiers. The extension cannot truthfully declare `none`. Personal blocks, notes, preferences and saved plans are local; explicit downloads may include those fields. There is no automatic telemetry upload.

See [the complete data-flow/permission audit and store disclosure](phase-4-privacy.md). This replaces older descriptions of a planned Firefox Google OAuth path; no such path is shipped. Review the manifest declaration before introducing any new external destination or data category.

Mozilla references: [built-in consent and data types](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) and [MDN browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).
