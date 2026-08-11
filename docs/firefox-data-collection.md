# Firefox data collection declaration

The Firefox build declares Mozilla's built-in data collection permission in `manifest.firefox.json`:

```json
"data_collection_permissions": {
  "required": ["websiteContent"]
}
```

Firefox 140+ uses this manifest declaration to disclose extension data collection/transmission during installation. The Firefox manifest therefore sets `browser_specific_settings.gecko.strict_min_version` to `140.0` rather than supporting older Firefox versions that do not provide the built-in consent flow.

## Why `websiteContent` is required

Mozilla defines `websiteContent` broadly as information visible on or embedded in a website. The extension reads course information from Workday and may transmit parts of that website-derived information to external services used by extension features:

- **UBCGrades:** course/campus/year-session identifiers derived from Workday course data are included in grade API requests.
- **RateMyProfessors:** instructor names and the inferred UBC campus are sent to the RateMyProfessors lookup endpoint.
- **Google Calendar:** when Calendar sync is available and the user chooses to sync, course names, meeting dates/times, locations, and related schedule information are sent to Google Calendar to create events.

Because the extension has features that transmit website-derived data outside the extension/local browser, it must not declare `none`.

## Data that does not require an additional declaration today

- Saved schedules, preferred-schedule state, course-colour settings, hover-tooltip settings, and Google sign-in state are stored locally with extension storage. Local-only storage is not transmission outside the extension/browser.
- The extension does not send telemetry, crash reports, usage analytics, device/browser properties, or interaction metrics, so `technicalAndInteraction` is not declared.
- It does not transmit browsing history, search terms, bookmarks, health, financial, location, or personal communications data.
- The current Firefox build does not yet implement the Firefox Google OAuth flow. Before that flow is distributed, its token/credential handling must be re-audited to determine whether `authenticationInfo` also needs to be declared.

## Maintenance rule

Treat this declaration as part of the extension's data contract. Before adding a new external API, analytics service, telemetry, account system, or new type of Workday-derived transmission, review Mozilla's current data-collection taxonomy and update `manifest.firefox.json` if the new behavior falls into another category.

The source-of-truth Mozilla references are:

- MDN's `browser_specific_settings.gecko.data_collection_permissions` documentation.
- Mozilla Extension Workshop's **Firefox built-in consent for data collection and transmission** guide.
