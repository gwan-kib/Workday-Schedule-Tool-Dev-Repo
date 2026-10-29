# Phase 3 implementation

Based on merged Phase 0–2 commit `7d8b073` and epic #74.

## Components

- `core/planner.js`: pure, date-aware weekly statistics, exact conflict/transition descriptions, snapshot differences, swap previews and interval lanes.
- `core/scheduleBackup.js`: allowlisted version-1 JSON format, bounded validation, secret exclusion and non-destructive merge planning. Restore writes saved plans, preferred ID, schema and validated preferences in one storage call after preview/confirmation.
- `extraction/trustedWorkday.js`: shared HTTPS `wd10.myworkday.com` `/ubc/` section-link validation. No arbitrary host, tenant, port, credentials or registration endpoint is accepted. UBC's published Workday portal identifies this production host: https://hr.ubc.ca/sites/default/files/documents/EFAP_Outline_Resources_November_2024.pdf
- `mainPanel/schedules/plannerController.js`: main-panel comparison, explicit preferred-plan action, alternative discovery/pasted links, swap preview/Apply/Undo, backups and visual exports. Comparison uses cloned snapshots; draft replacement goes through the existing store.
- `mainPanel/schedules/plannerOverview.js`: shared transparent metrics and accessible conflict/transition disclosures used in the main panel, comparisons, previews and popup.
- `exportLogic/exportTimetable.js`: offline SVG/canvas PNG and paginated image-PDF generation. Numbered grid references link visually to complete detail pages. Exported display fields exclude internal URLs and Workday IDs. Both orientations and weekends are supported.

## Deliberate boundaries

Automatic alternatives come from matching section entries already exposed on the user's authorized Workday page. Discovery checks up to 30 candidates with three workers, using the existing section reader. It does not guess private Workday APIs, navigate registration flows or submit any Workday form. The pasted-link reader supports alternatives when page data is unavailable, including cross-listed sections.

Pairing constraints are not supplied by the existing course model. Every preview explains that linked lecture/lab/tutorial compatibility must be checked, retains other components, and permits explicit application. Unknown meeting times/recurrence and changed term coverage are separately warned about.

Undo requires the working draft to still match the post-swap snapshot, preventing later edits from being overwritten. Backup Merge preserves existing preferences and preferred status, skips identical snapshots, and renames/re-identifies conflicting incoming plans. Replace requires explicit checked confirmation. Both modes preserve the working draft and account/sync data.

The backup schema deliberately has no pass-through fields. New preference or commitment models must receive explicit validators before a later format migration. Unsupported versions are rejected without writes. Existing saved storage remains schema version 1.

PDFs use high-resolution image pages and contain no scripts, uploads or external rendering dependencies. Oversized PNGs exceeding browser canvas limits request a paginated PDF instead. Timetables use actual dates for clashes; visually adjacent lanes can represent separate terms or teaching weeks and are explained accordingly.

## Validation

See `phase-3-testing.md` for the test evidence and remaining real-account/Firefox/manual acceptance checks. No Workday registration or Google Calendar write was performed during validation. The epic's completion requirement includes merge and manual acceptance; implementation alone does not satisfy that final tracker state.
