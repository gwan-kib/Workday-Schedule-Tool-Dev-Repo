export function syncPreviewText(preview) {
  const skipped = preview.skippedItems?.length
    ? `Skipped:\n${preview.skippedItems.map((item) => `• ${item}`).join("\n")}`
    : "Skipped: None";
  const lines = [
    "Target Calendar: Primary",
    `Schedule Name: ${preview.planName}`,
    `Adding: ${preview.additions}`,
    `Updating: ${preview.updates}`,
    `Removing: ${preview.removals}`,
    `Unchanged: ${preview.unchanged}`,
    skipped,
  ];
  if (preview.removals) lines.push("WARNING: Confirming removes the listed managed events.");
  if (preview.deferredRemovals)
    lines.push(`${preview.deferredRemovals} removal(s) deferred because meeting data is incomplete.`);
  if (preview.otherPlans) lines.push("Other preserved plans may overlap this plan.");
  return lines.join("\n") + "\n\nHolidays and reading breaks supplied by Workday are automatically excluded.";
}
