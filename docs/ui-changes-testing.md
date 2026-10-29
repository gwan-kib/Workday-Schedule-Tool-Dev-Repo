# Manual tests for the simplified UI and alternating weeks

Rebuild/load the updated Chrome or Firefox package, reload the extension, and refresh the Workday tab. Automated checks use fixtures and do not verify your live Workday session or browser layout.

| Test | What changed / what to look for |
| --- | --- |
| Grade display in the extension course list | The grade button shows **one latest available course average**, e.g. `80.0%`. It no longer includes a second five-year average, dates, coverage, sample counts or a details paragraph. Clicking a loaded grade still opens UBCGrades. |
| Grade display on Workday registration cards | The same compact single-number display appears on supported lecture cards. The info control sits **to the right** of the grade button; it should not cover the grade or Add button. |
| Five-year hover/focus | Hover the `ⓘ` beside a loaded grade, then reach it using Tab. Both should reveal **5-year average: …%**. Confirm that it can differ from the main latest-year number. Missing five-year data must show N/A rather than inventing an average. Moving away hides the tooltip. |
| Week controls in the panel and popup | **Meeting dates:** and its dropdown are gone. **Week 1 / Week 2** buttons replace them, with the selected week visibly indicated. Weekly lectures remain visible in both. Reliably anchored alternating labs/sections appear only in the matching cycle; opposite-week labs should swap when toggled. |
| Week selection and data preservation | Switch to Week 2, change AM/PM, then search/rerender or reopen the same view. The selected week should remain Week 2. Saving/exporting must retain the full plan, including both alternating weeks; the toggle changes only the timetable preview. Uncertain alternating patterns remain under Meeting Times Unknown. |
| Unsupported-page warning | Open a Workday page with no supported sections, then refresh the extension panel. The old **No supported course sections found…** message must not appear. Your existing working plan should remain intact. Real sign-in and import-failure messages should still appear when applicable. |
| Google sync confirmation (Chrome) | The confirmation no longer lists **Dates:**. Target, plan, change counts and Confirm/Cancel remain. The old long exception/cancellation paragraph is replaced with **Holidays and reading breaks supplied by Workday are automatically excluded.** Cancel must still cause no calendar changes. |

Week 1 is the first Monday-based week of each connected meeting-date period; separate periods restart the cycle. Compare anchored alternating sections with their actual Workday dates. No week is guessed for a section without a reliable anchor.

Holiday wording remains conditional on verified exception dates supplied in the meeting data. This UI change does not add a complete UBC holiday/reading-break calendar or infer dates missing from Workday.
