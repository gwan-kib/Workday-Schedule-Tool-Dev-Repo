import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("renderCourseRows");

const escHTML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function cleanLines(text) {
  return String(text || "")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function getBadge(course) {
  if (course.isLab) return "[LAB]";
  if (course.isSeminar) return "[SEM]";
  if (course.isDiscussion) return "[DISC]";
  return "";
}

function splitMeeting(meeting) {
  const parts = cleanLines(meeting).split("\n");
  const main = (parts[0] || "").trim();
  const sub = parts
    .slice(1)
    .map((s) => s.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, "").trim())
    .filter(Boolean)
    .join("\n");

  return { main, sub };
}

function formatCourseCode(code) {
  const match = String(code || "").match(/^([A-Z_]+)\s*(\d+)$/);
  if (match) {
    return `${match[1]}<br>${match[2]}`;
  }
  return code || "";
}

function formatInstructorName(name) {
  const nameParts = String(name || "")
    .trim()
    .split(/\s+/);
  if (nameParts.length > 1) {
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");
    return `${firstName}<br>${lastName}`;
  }
  return name || "";
}

export function renderCourseRows(ui, courses) {
  ui.tableBody.innerHTML = "";
  const frag = document.createDocumentFragment();

  (courses || []).forEach((course) => {
    const tr = document.createElement("tr");
    const badge = getBadge(course);

    const { main: meetingMain, sub: meetingSub } = splitMeeting(course.meeting);

    tr.innerHTML = `
      <td class="title">
        <div class="title-main">${escHTML(course.title || "")}</div>
        ${badge ? `<div class="muted">${escHTML(badge)}</div>` : ""}
      </td>
      <td class="code">${formatCourseCode(course.code || "")}</td>
      <td class="sect">${escHTML((course.section_number || "").trim())}</td>
      <td class="instructor">
        <div class="instructor-wrapper">
          ${formatInstructorName(course.instructor || "")}
          <div class="instructor-popup">
            <div class="instructor-popup-content">
              ${escHTML(course.instructor || "")}
            </div>
          </div>
        </div>
      </td>
      <td class="meeting">
        ${meetingMain ? `<span class="meeting-pill">${escHTML(meetingMain)}</span>` : ""}
        ${meetingSub ? `<div class="meeting-sub">${escHTML(meetingSub)}</div>` : ""}
      </td>
      <td class="instructionalFormat">${escHTML(course.instructionalFormat || "")}</td>
    `;

    frag.appendChild(tr);
  });

  ui.tableBody.appendChild(frag);

  debug.log({ id: "renderCourseRows.done" }, "Rendered course rows", {
    count: (courses || []).length,
  });
}
