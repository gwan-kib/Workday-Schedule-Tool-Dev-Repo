import {
  MAX_SCHEDULE_NOTES_LENGTH,
  scheduleNotesText,
} from "../../core/scheduleNotes.js";
import { plannerDialog } from "./plannerController.js";
import { node } from "./plannerOverview.js";

export function createScheduleNotesButton(schedule) {
  const button = node(
    "button",
    null,
    `schedule-saved-action notes wd-hover-tooltip${scheduleNotesText(schedule) ? " has-notes" : ""}`,
  );
  button.type = "button";
  button.dataset.action = "notes";
  button.dataset.tooltip = scheduleNotesText(schedule)
    ? "View schedule notes"
    : "Add schedule notes";
  button.setAttribute("aria-label", `Notes for ${schedule.name}`);
  button.setAttribute("aria-haspopup", "dialog");
  const icon = node("span", "note_alt", "material-symbols-rounded");
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  return button;
}

export function openScheduleNotes(
  ui,
  { scheduleId, getSchedules, saveSchedules },
) {
  const original = getSchedules().find(
    (schedule) => schedule.id === scheduleId,
  );
  if (!original) throw new Error("This saved schedule is no longer available.");
  const dialog = plannerDialog(ui, `Notes — ${original.name}`);
  const show = () => {
    const latest = getSchedules().find(
      (schedule) => schedule.id === scheduleId,
    );
    dialog.content.replaceChildren();
    if (!latest) {
      dialog.status.textContent = "This schedule was deleted. Close this note.";
      return;
    }
    const value = scheduleNotesText(latest);
    dialog.content.append(
      node("p", value || "No notes yet.", "schedule-notes-text"),
    );
    const edit = node("button", "Edit note");
    edit.type = "button";
    edit.addEventListener("click", () => startEdit(value));
    dialog.content.append(edit);
  };
  const startEdit = (previous) => {
    dialog.status.textContent = "";
    dialog.content.replaceChildren();
    const label = node("label", "Schedule notes"),
      input = node("textarea");
    input.value = previous;
    input.rows = 8;
    input.maxLength = MAX_SCHEDULE_NOTES_LENGTH;
    input.className = "schedule-notes-input";
    input.setAttribute("aria-label", "Schedule notes");
    label.append(input);
    const save = node("button", "Save note"),
      cancel = node("button", "Cancel");
    save.type = cancel.type = "button";
    cancel.addEventListener("click", () => {
      dialog.status.textContent = "";
      show();
    });
    save.addEventListener(
      "click",
      dialog.run(async () => {
        if (save.disabled) return;
        const schedules = getSchedules(),
          latest = schedules.find((schedule) => schedule.id === scheduleId);
        if (!latest)
          throw new Error("This schedule was deleted. Its note was not saved.");
        if (scheduleNotesText(latest) !== previous)
          throw new Error(
            "This note changed in another window. Cancel editing and reopen it before saving.",
          );
        const notes = scheduleNotesText({ notes: input.value });
        save.disabled = cancel.disabled = input.disabled = true;
        try {
          await saveSchedules(
            schedules.map((schedule) =>
              schedule.id === scheduleId ? { ...schedule, notes } : schedule,
            ),
          );
          show();
          dialog.status.textContent = "Note saved.";
        } finally {
          save.disabled = cancel.disabled = input.disabled = false;
        }
      }),
    );
    dialog.content.append(label, save, cancel);
    input.focus();
  };
  show();
  return dialog;
}
