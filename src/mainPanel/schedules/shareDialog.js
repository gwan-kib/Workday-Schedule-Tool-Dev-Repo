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

function showPreview(d, host, payload) {
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
  host.append(list);
  const courses = structuredClone(payload.courses);
  assignCourseColors(courses);
  return d.preview(host, courses, "Shared schedule", new Set(), 1, payload.personalBlocks);
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
        d.setStatus("Link ready. Recipients can open it or paste it into Open shared schedule.");
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
  const review = node("section", null, "planner-feature-fields");
  let current, preview, generation = 0, saving = false;
  const add = button("Add to saved schedules", d.run(async () => {
    if (!current || saving) return;
    saving = true;
    url.disabled = file.disabled = read.disabled = true;
    try {
      const imported = await importSchedule(sharedScheduleForImport(current));
      reset();
      d.setStatus("Added “" + imported.name + "” to saved schedules.");
    } finally {
      saving = false;
      url.disabled = file.disabled = read.disabled = false;
    }
  }));
  add.className = "planner-primary";
  add.hidden = true;
  const reset = () => {
    generation++;
    current = null;
    add.hidden = true;
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
      preview = showPreview(d, review, payload);
      current = payload;
      add.hidden = false;
      d.setStatus("Review the schedule before adding a new saved copy.", "info");
    } catch (error) {
      if (request === generation) d.setStatus(error.message, "error");
    }
  };

  const read = button("Preview link", () => void readPreview(() => decodeSharedLink(url.value)));
  url.addEventListener("input", reset);
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    void readPreview(async () => {
      if (chosen.size > MAX_SHARE_FILE) throw new Error("A shared schedule file must be 512 KB or smaller.");
      return parseSharedSchedule(await chosen.text());
    });
  });
  d.content.append(
    node("p", "Preview a shared timetable and add it as a new saved schedule for comparison.", "planner-hint"),
    urlLabel,
    read,
    fileLabel,
    review,
  );
  d.actions.append(add);
  if (link !== undefined) {
    url.value = link;
    void readPreview(() => decodeSharedLink(link));
  }
}
