_Not affiliated with or endorsed by Workday._

<div align="center">
  <img src="icon128.png" width="128px" height="128px" alt="Workday Calendar Tool logo">

# UBC Workday - Schedule Tool

<h3 style="margin:0;">Simplify your semester.<br>Visualize your schedule.<br>Export it when you're ready.</h3>

Chrome Extension: [UBC Workday - Schedule Tool](https://chromewebstore.google.com/detail/ldknikpffjjfjnfimhjjdilfbnlnalcj)

</div>

---

## Built for Students by Students

If you use Workday for registration, this helps you:

- See your full week at a glance
- Spot class overlaps and gaps instantly
- Compare different schedule options before you register
- Export your final schedule to your calendar in seconds

---

## How To Use

1. Install the extension
2. Open Workday
3. Go to the View My Courses page (or any of your saved schedules)
4. Open the extension using the button on the rightside of your screen
5. View your course and schedule layout
6. Save schedules in the extension
7. Export to `.ics` or sign into Google from Settings to sync directly to Google Calendar where supported

Optional: open the extension from the browser toolbar popup to preview your starred/default saved schedule outside the Workday page.

- still stuck? [Check out the Tutorial Doc](https://docs.google.com/document/d/1D0YqHct_d3rR8WtlkHF9Dybqb3mFB7Wka0ZWsFZOda8/edit?tab=t.0)

---

## Features

### Weekly Schedule View

Turns your Workday courses into a calendar-style grid so you can see:

- Class times
- Overlaps
- Gaps between classes
- The shape of your week

---

### Saved Schedules

Save multiple versions locally so you can:

- Compare registration scenarios
- Plan alternate course combinations
- Keep backups of past schedules

All snapshots stay on your device.

---

### Class Averages

- See the latest available course-year average and a sample-weighted five-year window in Workday
- The grade button shows one latest average; hover or focus the info control beside it for the five-year average
- Click the grade button to open the newest available course-wide UBCGrades OVERALL page; missing averages display N/A
- View averages in the course list and on supported Workday registration cards
- Open supported results on UBCGrades

---

### Professor Ratings

- See Rate My Professors ratings directly in the course list when a supported instructor match is found
- Open supported ratings directly in RateMyProf

---

### Calendar Export and Google Calendar Sync

Export to a standard `.ics` file that works with:

- Google Calendar
- Apple Calendar
- Outlook
- Most calendar apps

Chrome supports Google sign-in and direct synchronization to the primary calendar. Every synchronization previews additions, updates, removals and skipped meetings, and requires confirmation. Switching plans offers Keep Both or Replace Previous for separately tracked plan event sets. Firefox supports `.ics` export only.

Both export paths use the same validated meeting dates and exact times as the timetable. Unknown or uncertain meetings remain visible under Meeting Times Unknown and are skipped during export. Holidays/reading breaks are excluded only when verified dates are supplied by Workday; they are never guessed.

---

### Manual Course Add

- Add a course from a Workday course link when it is not already in your loaded schedule

---

Want to request a feature? Let me know at gwantanak.3@gmail.com

---

## Privacy and Security

Saved plans, notes, personal blocks and display preferences stay in local extension storage. Course cards automatically send course/campus/session identifiers to UBCGrades and instructor names/campus identifiers to Rate My Professors; these lookups have no separate opt-out and use one-hour memory caches. Existing icons load from Google Fonts. No analytics or advertising tracking is included.

Chrome sends event details to Google Calendar only after sign-in, preview and confirmation. Personal blocks require explicit inclusion each time. Signing out clears local access state, but does not revoke Google's authorization or delete events. Firefox supports ICS downloads only and has no identity/Google API grants.

The panel runs only on `https://wd10.myworkday.com/ubc/*`. JSON downloads include notes and personal blocks, exclude tokens/account data and omit Workday section IDs/links; review files before sharing. Settings explains these data flows and offers optional session-only redacted diagnostics. Read the [privacy audit and store disclosures](docs/phase-4-privacy.md) for fields, retention, permissions and revoke instructions.

---

## Development / Contributing

- See `DevREADME.md`
- Browser build/loading details are in `docs/browser-manifests.md`
- Shared WebExtension API compatibility notes are in `docs/webextension-api-compatibility.md`

---

## Browser Compatibility

- Chrome: supported
- Firefox: ICS-only package; actual Firefox runtime/consent smoke tests remain a release check. Direct Google sync is not planned.

---

## License

MIT (see `LICENSE.md`)

## Phase 4 display and personal planning

Settings → Display offers System (default), Light and Dark appearance plus Comfortable/Compact timetable spacing. The popup offers the same preferences under Display settings. Saved plans can contain personal blocks for work, commuting and commitments, with one-date, weekly or alternate-week recurrence and skipped dates. Personal blocks are distinct from Workday classes and participate in conflicts; they do not change registration. Save a plan first, then use Schedule → Personal blocks (also available in the popup). These edits save directly to that plan; they are separate from the course Undo/Redo history.

See [the Phase 4 feature and manual testing guide](docs/phase-4-testing.md).
