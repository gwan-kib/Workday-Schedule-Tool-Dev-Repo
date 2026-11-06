import {
  MAX_SHARE_FILE,
  MAX_SHARE_LINK,
  createSharedSchedule,
  decodeSharedLink,
  encodeSharedLink,
  parseSharedSchedule,
  serializeSharedSchedule,
  sharedScheduleForImport,
} from "../../core/scheduleShare.js";
import { clock, sectionLabel } from "../../core/planner.js";
import { downloadBlob } from "../../exportLogic/exportTimetable.js";
import { assignCourseColors } from "../settings/courseColorSettings.js";
import { node } from "./plannerOverview.js";

function button(text, click) {
  const control = node("button", text);
  control.type = "button";
  control.addEventListener("click", click);
  return control;
}

function showPreview(d, host, payload, { calendarFirst = false } = {}) {
  host.append(node("h3", "Schedule preview"));
  const list = node("ul", null, "planner-feature-details");
  for (const course of payload.courses) {
    const item = node("li");
    item.append(node("strong", sectionLabel(course)));
    const description = [course.title, course.instructor, course.isOnline ? "Online" : ""].filter(Boolean);
    if (description.length) item.append(node("p", description.join(" · ")));
    for (const [index, line] of course.meetingLines.entries()) {
      item.append(node("p", line));
      const anchor = course.meetingAnchors?.[index];
      const skips = course.meetingExceptions?.[index] || [];
      if (anchor) item.append(node("p", "First meeting: " + anchor));
      if (skips.length) item.append(node("p", "Skip dates: " + skips.join(", ")));
    }
    if (!course.meetingLines.length) item.append(node("p", "No meeting times listed"));
    list.append(item);
  }
  for (const block of payload.personalBlocks) {
    const item = node("li");
    item.append(
      node("strong", "Personal block · " + block.title),
      node("p", [block.category, block.color, block.recurrence, block.startDate + " to " + block.endDate].filter(Boolean).join(" · ")),
      node("p", block.days.join(", ") + " · " + clock(block.startMinutes) + "–" + clock(block.endMinutes)),
    );
    if (block.exceptions.length) item.append(node("p", "Skip dates: " + block.exceptions.join(", ")));
    list.append(item);
  }
  const calendar = node("div");
  if (calendarFirst) {
    const details = node("details", null, "planner-change-list");
    details.append(node("summary", "Course and block details"), list);
    host.append(calendar, details);
  } else {
    host.append(list, calendar);
  }
  const courses = structuredClone(payload.courses);
  assignCourseColors(courses);
  return d.preview(calendar, courses, "Shared schedule", new Set(), 1, payload.personalBlocks);
}

export function openScheduleShare(d, draft) {
  const include = node("input");
  include.type = "checkbox";
  include.disabled = !draft.personalBlocks.length;
  const label = node("label", null, "planner-check-label");
  label.append(include, document.createTextNode("Include personal blocks"));
  const review = node("section", null, "planner-feature-fields");
  const output = node("div", null, "planner-feature-fields");
  d.content.append(
    node("p", "Share a copy of your current draft, including unsaved changes. It includes course, section, meeting, instructor and room details. Saved names, notes, preferences and Workday links are excluded.", "planner-hint"),
    node("p", "Anyone with the link or file can read the schedule. Copies do not expire and cannot be revoked. Review personal details before sharing.", "planner-hint"),
    label,
    review,
    output,
  );
  let preview, text;
  const create = button("Create share link", d.run(async () => {
    const confirmedText = text;
    if (!confirmedText) return;
    include.disabled = true;
    output.replaceChildren();
    try {
      const link = await encodeSharedLink(confirmedText);
      if (!d.dialog.isConnected) return;
      if (link) {
        const field = node("textarea");
        field.rows = 2;
        field.readOnly = true;
        field.value = link;
        const wrap = node("label", null, "planner-field");
        wrap.append(node("span", "Share link", "planner-field-label"), field);
        const copy = button("Copy link", async () => {
          try {
            await navigator.clipboard.writeText(link);
            d.setStatus("Share link copied.");
          } catch {
            field.focus();
            field.select();
            d.setStatus("Select Copy in your browser or press Ctrl+C to copy the selected link.", "info");
          }
        });
        output.append(wrap, copy);
        d.setStatus("Link ready. It opens Workday Home and shows a save preview for recipients with the extension.");
      } else {
        d.setStatus("This schedule is too large for a share link. Download the JSON file to share it.", "info");
      }
      output.append(button("Download share file", () => {
        downloadBlob(new Blob([confirmedText], { type: "application/json" }), "WST-shared-schedule.json");
        d.setStatus("Share file downloaded.");
      }));
    } finally {
      include.disabled = !draft.personalBlocks.length;
    }
  }));
  create.className = "planner-primary";

  const draw = () => {
    preview?.dispose();
    preview = undefined;
    text = null;
    review.replaceChildren();
    output.replaceChildren();
    d.setStatus("");
    create.disabled = true;
    if (!draft.courses.length && !include.checked) {
      d.setStatus("Add a course or include a personal block before sharing.", "info");
      return;
    }
    try {
      const payload = createSharedSchedule(draft.courses, include.checked ? draft.personalBlocks : []);
      text = serializeSharedSchedule(payload);
      preview = showPreview(d, review, payload);
      create.disabled = false;
    } catch (error) {
      d.setStatus(error.message, "error");
    }
  };
  include.onchange = draw;
  d.actions.append(create);
  draw();
}

export function openIncomingShare(d, { link, importSchedule }) {
  const fromLink = link !== undefined;
  const sources = node("div", null, "planner-feature-fields");
  sources.hidden = fromLink;
  const url = node("textarea");
  url.rows = 2;
  url.maxLength = MAX_SHARE_LINK;
  const urlLabel = node("label", null, "planner-field");
  urlLabel.append(node("span", "WST share link", "planner-field-label"), url);
  const file = node("input");
  file.type = "file";
  file.accept = ".json,application/json";
  const fileLabel = node("label", null, "planner-field planner-import-file");
  fileLabel.append(node("span", "Or choose a WST share file", "planner-field-label"), file);

  const name = node("input");
  name.type = "text";
  name.maxLength = 200;
  name.required = true;
  const nameLabel = node("label", null, "planner-field");
  nameLabel.hidden = true;
  nameLabel.append(node("span", "Schedule name", "planner-field-label"), name);
  const review = node("section", null, "planner-feature-fields");
  let current, preview, generation = 0, saving = false;

  const add = button("Save schedule", d.run(async () => {
    if (!current || saving) return;
    const chosenName = name.value.trim();
    if (!chosenName) {
      name.focus();
      throw new Error("Enter a name for this schedule.");
    }
    saving = true;
    name.disabled = url.disabled = file.disabled = read.disabled = true;
    try {
      const imported = await importSchedule(sharedScheduleForImport(current, chosenName));
      if (fromLink) d.close();
      else {
        reset();
        d.setStatus("Saved “" + imported.name + "” in My Schedules.");
      }
    } finally {
      saving = false;
      name.disabled = url.disabled = file.disabled = read.disabled = false;
    }
  }));
  add.className = "planner-primary";
  add.hidden = true;

  const reset = () => {
    generation++;
    current = null;
    nameLabel.hidden = add.hidden = true;
    preview?.dispose();
    preview = undefined;
    review.replaceChildren();
    d.setStatus("");
  };

  const readPreview = async load => {
    if (saving) return;
    reset();
    const request = generation;
    try {
      const payload = await load();
      if (request !== generation || !d.dialog.isConnected) return;
      preview = showPreview(d, review, payload, { calendarFirst: true });
      current = payload;
      name.value = "Shared schedule";
      nameLabel.hidden = add.hidden = false;
      name.focus({ preventScroll: true });
      name.select();
    } catch (error) {
      if (request !== generation) return;
      sources.hidden = false;
      d.setStatus(error.message, "error");
    }
  };

  const read = button("Preview link", () => void readPreview(() => decodeSharedLink(url.value)));
  url.addEventListener("input", reset);
  name.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    add.click();
  });
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    void readPreview(async () => {
      if (chosen.size > MAX_SHARE_FILE) throw new Error("A shared schedule file must be 512 KB or smaller.");
      return parseSharedSchedule(await chosen.text());
    });
  });
  sources.append(urlLabel, read, fileLabel);
  d.content.append(
    node("p", "Preview the calendar and choose a name to save your own copy.", "planner-hint"),
    sources,
    nameLabel,
    review,
  );
  d.actions.append(button("Cancel", d.close), add);
  if (fromLink) {
    url.value = link;
    void readPreview(() => decodeSharedLink(link));
  }
}
