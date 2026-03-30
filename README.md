_Not affiliated with or endorsed by Workday._

<div align="center">
  <img src="icon128.png" width="128" height="128" alt="UBC Workday - Schedule Tool logo">

# UBC Workday - Schedule Tool

See your Workday schedule as an actual timetable, compare saved options, and export the version you want.

</div>

---

## What It Does

This Chrome extension adds a schedule-planning layer on top of UBC Workday. It is built for students who want a faster way to compare course combinations without manually reading through Workday tables.

Current capabilities include:

- A weekly timetable view generated directly from Workday course data
- Conflict highlighting for overlapping classes
- Local saved schedules with a favorite/default schedule
- A popup preview of your favorite saved schedule outside the Workday page
- Course list filtering and sorting
- Custom course color assignments
- Optional hover tooltip controls
- `.ics` calendar export
- Class average lookups from UBC Grades
- Rate My Professors lookups for supported instructors

---

## How To Use

1. Install or load the extension in Chrome.
2. Open a supported `*.myworkday.com` page that contains your courses or saved schedules.
3. Use the floating button on the page to open the main panel.
4. Switch between the course list, schedule, settings, and help views.
5. Save schedule snapshots locally when you want to compare options.
6. Star one saved schedule to make it your default popup preview.
7. Export the currently loaded schedule to `.ics` when you are ready to add it to a calendar app.

If you only want a quick preview, open the extension popup from the Chrome toolbar. The popup shows your preferred saved schedule and lets you switch between saved schedules.

---

## Feature Overview

### Schedule View

The schedule view turns extracted Workday meeting times into a weekly grid so you can quickly see:

- when classes happen
- where gaps appear in your day
- which courses overlap
- which term a given schedule belongs to

### Saved Schedules

Saved schedules are stored locally in extension storage. You can:

- save multiple schedule snapshots
- load an older snapshot back into the panel
- delete snapshots you no longer need
- mark one schedule as your favorite/default

### Popup Preview

The extension popup mirrors your saved schedules and shows a compact preview of your preferred schedule, including:

- the saved schedule selector
- favorite toggling
- the schedule grid preview
- time-format switching

### Course Details and Planning Aids

Inside the Workday page, the extension can also show:

- class averages sourced from UBC Grades
- Rate My Professors ratings when a supported instructor match is found
- saved course color themes for easier visual scanning

### Calendar Export

The `.ics` export works with common calendar apps such as Google Calendar, Apple Calendar, and Outlook.

---

## Privacy and Data Use

Most schedule data is kept locally in Chrome storage on your device.

The extension currently uses these external services when their related features are triggered:

- `ubcgrades.com` for class average lookups
- `ratemyprofessors.com` for professor rating lookups
- Google Fonts for the Material Symbols icon font used by the UI

The extension does not include analytics or ad tracking code.

---

## Supported Environment

- Chrome / Chromium browsers with Manifest V3 support
- Workday pages on `https://*.myworkday.com/*`

---

## Development

Developer setup and project structure are documented in `DevREADME.md`.

---

## Contact

Questions or feature requests: `gwantanak.3@gmail.com`

---

## License

MIT. See `LICENSE.md`.
