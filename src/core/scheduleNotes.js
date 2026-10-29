export const MAX_SCHEDULE_NOTES_LENGTH = 10000;

export function scheduleNotesText(schedule) {
  const notes = schedule?.notes;
  if (notes == null) return "";
  if (typeof notes !== "string" || notes.length > MAX_SCHEDULE_NOTES_LENGTH)
    throw new Error(
      `Schedule notes must be text with at most ${MAX_SCHEDULE_NOTES_LENGTH} characters.`,
    );
  return notes;
}
