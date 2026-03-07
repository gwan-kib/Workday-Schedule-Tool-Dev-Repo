import { debugFor, debugLog } from "../utilities/debugTool.js";
import { fetchSectionGradesWithFallback } from "../averageGrades/gradesApiCall.js";

const debug = debugFor("renderCourseObjects");
debugLog({ local: { renderCourseObjects: false } });

// Escapes HTML entities in a string. Input: string. Output: escaped string.
const escHTML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeConflictToken = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

// Normalizes whitespace in multi-line strings. Input: string. Output: cleaned string.
function cleanLines(text) {
  return String(text || "")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Splits meeting text into main and sub lines. Input: meeting string. Output: { main, sub }.
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

// Splits a course code into subject/number. Input: code string. Output: object.
function splitCourseCode(code) {
  const match = String(code || "").match(/^([A-Z_]+)\s*(\d+[A-Z]?)$/);
  if (match) {
    return { subject: match[1], number: match[2], raw: `${match[1]} ${match[2]}` };
  }
  return { subject: "", number: "", raw: code || "" };
}

// Formats an instructor name for display. Input: name string. Output: string.
function formatInstructorName(name) {
  const nameParts = String(name || "")
    .trim()
    .split(/\s+/);
  if (nameParts.length > 1) {
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");
    return `${firstName} ${lastName}`;
  }
  return name || "";
}

// Formats multiline content for HTML. Input: string. Output: HTML string.
function formatMultiline(text) {
  return escHTML(text || "").replace(/\n/g, "<br>");
}

// Parses course info needed for average lookup. Input: course object. Output: { subject, course, section, campus } or null.
function buildAverageCourseInfo(courseData) {
  const match = String(courseData?.code || "")
    .trim()
    .toUpperCase()
    .match(/^\s*([A-Z][A-Z0-9_]{1,8})\s*(\d{3}[A-Z]?)\s*$/);
  if (!match) return null;

  const section = String(courseData?.section_number || "")
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const rawSubject = match[1];
  const campus = rawSubject.endsWith("_O") ? "UBCO" : "UBCV";

  return {
    subject: rawSubject.replace(/_[VO]$/i, ""),
    course: match[2],
    section,
    campus,
  };
}

// Extracts an average value from API data. Input: API payload. Output: number|string|null.
function extractAverage(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const avg = extractAverage(item);
      if (avg != null) return avg;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const direct =
    data.average ?? data.avg ?? data.average_grade ?? data.averagePercent ?? data.avgPercent ?? data.mean ?? null;
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const nested = data?.grades?.average ?? data?.grades?.avg ?? data?.summary?.average ?? data?.summary?.avg ?? null;
  if (typeof nested === "number") return nested;
  if (typeof nested === "string" && nested.trim()) return nested.trim();

  return null;
}

// Returns true when API payload has an average. Input: API payload. Output: boolean.
const hasValidAverage = (data) => extractAverage(data) != null;

// Formats average label for button text. Input: average value. Output: string.
function formatAverageText(average) {
  if (average == null) return "Avg: N/A";
  if (typeof average === "number") return `Avg: ${average.toFixed(1)}%`;
  return `Avg: ${average}%`;
}

// Returns current yearsession string. Input: none. Output: YYYYW string.
function getCurrentYearsession() {
  return `${new Date().getFullYear()}W`;
}

// Loads average into a course-card button. Input: button element. Output: none.
async function loadAverageForButton(button) {
  if (!button || button.dataset.loading === "true") return;

  const subject = button.dataset.subject || "";
  const course = button.dataset.course || "";
  const section = button.dataset.section || "";
  const campus = button.dataset.campus || "UBCV";
  const yearsession = getCurrentYearsession();

  button.dataset.loading = "true";
  button.disabled = true;
  button.textContent = "Loading...";

  if (!subject || !course || !yearsession) {
    button.textContent = "Avg: N/A";
    button.disabled = false;
    button.dataset.loading = "false";
    return;
  }

  try {
    const data = await fetchSectionGradesWithFallback(
      {
        campus,
        yearsession,
        subject,
        course,
        section,
      },
      { isValid: hasValidAverage },
    );

    const average = extractAverage(data);
    button.textContent = formatAverageText(average);
  } catch (error) {
    button.textContent = "Avg: N/A";
  } finally {
    button.disabled = false;
    button.dataset.loading = "false";
  }
}

// Renders course rows into the table body. Input: ui object, courses array. Output: none.
export function renderCourseObjects(ui, courses) {
  ui.tableBody.innerHTML = "";
  const frag = document.createDocumentFragment();
  const conflictPartnersByCode = ui?.conflictPartnersByCode instanceof Map ? ui.conflictPartnersByCode : new Map();

  (courses || []).forEach((course, index) => {
    const formatLabel = String(course.instructionalFormat || "").trim();
    const sectionLabel = String(course.section_number || "").trim();

    const { main: meetingMain, sub: meetingSub } = splitMeeting(course.meeting);
    const codeInfo = splitCourseCode(course.code || "");
    const averageInfo = buildAverageCourseInfo(course);
    const instructorName = (course.instructor || "").trim() || "TBA";

    const card = document.createElement("div");
    const colorIndex = course?.colorIndex || (index % 7) + 1;
    const subClass = course.isLab || course.isSeminar || course.isDiscussion ? " course-card--sub" : "";
    card.className = `course-card course-card--color-${colorIndex}${subClass}`;
    const courseConflictKey = normalizeConflictToken(course.code || course.title || "");
    const conflictPartners = conflictPartnersByCode.get(courseConflictKey) || [];
    const conflictMessage = conflictPartners.length ? `Schedule conflict with: ${conflictPartners.join(", ")}` : "";
    const showConflictIcon = conflictPartners.length > 0;

    card.innerHTML = `
      <div class="course-card__top">
        <div class="course-card__code">
          ${
            showConflictIcon
              ? `<span class="course-code-conflict wd-hover-tooltip" aria-label="Schedule conflict warning" data-tooltip="${escHTML(conflictMessage)}">🚩</span>`
              : ""
          }
          ${
            codeInfo.subject
              ? `<span class="course-code-subject">${escHTML(codeInfo.subject)}</span>
                 <span class="course-code-number">${escHTML(codeInfo.number)}</span>`
              : `<span class="course-code-subject">${escHTML(codeInfo.raw)}</span>`
          }
          ${sectionLabel ? `<span class="course-code-section wd-hover-tooltip" data-tooltip="Section number">${escHTML(sectionLabel)}</span>` : ""}
          ${formatLabel ? `<span class="course-pill">${escHTML(formatLabel)}</span>` : ""}
        </div>
        <div class="course-card__instructor">
            ${formatInstructorName(instructorName)}
        </div>
      </div>
      <div class="course-card__title">${escHTML(course.title || "")}</div>
      <div class="course-card__body">
        <div class="course-card__details">
          ${
            meetingMain
              ? `<div class="course-card__detail">
                  <span class="material-symbols-rounded" aria-hidden="true">schedule</span>
                  <span>${formatMultiline(meetingMain)}</span>
                </div>`
              : ""
          }
          ${
            meetingSub
              ? `<div class="course-card__detail">
                  <span class="material-symbols-rounded" aria-hidden="true">location_on</span>
                  <span>${formatMultiline(meetingSub)}</span>
                </div>`
              : ""
          }
        </div>
        <div class="course-card__actions">
          <button
            type="button"
            class="course-card__avg-button${averageInfo ? "" : " is-disabled"}"
            ${averageInfo ? `data-subject="${escHTML(averageInfo.subject)}" data-course="${escHTML(averageInfo.course)}" data-section="${escHTML(averageInfo.section)}" data-campus="${escHTML(averageInfo.campus)}"` : "disabled"}
          >
            5 Year Avg
          </button>
        </div>
      </div>
    `;

    const averageButton = card.querySelector(".course-card__avg-button");
    if (averageButton && !averageButton.disabled) {
      averageButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await loadAverageForButton(averageButton);
      });
    }

    frag.appendChild(card);
  });

  ui.tableBody.appendChild(frag);

  debug.log({ id: "renderCourseObjects.done" }, "Rendered course rows", courses || []);
}
