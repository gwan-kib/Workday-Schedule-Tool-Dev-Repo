import { courseWorkdayLink } from "../../extraction/trustedWorkday.js";
import { courseIdentity } from "../../core/meetings.js";
import {
  getCourseAverageState,
  getCourseRmpState,
  buildAverageCourseInfo,
  buildRmpLookupInfo,
  applyAverageButtonState,
  applyRmpButtonState,
  loadAverageForButton,
  loadRmpForButton,
} from "./courseLookupController.js";
import { debugFor, debugLog } from "../../utilities/debugTool.js";
import {
  COURSE_COLOR_COUNT,
  DEFAULT_COURSE_COLOR_ASSIGNMENTS,
  getCourseGroupRepresentatives,
  isValidCourseColorIndex,
} from "../settings/courseColorSettings.js";

const debug = debugFor("renderCourseObjects");
debugLog({ local: { renderCourseObjects: false } });

const renderKeyByCourse = new WeakMap();
let renderKeyCounter = 0;

// Returns a stable render key per course object instance. Input: course object. Output: key string.
function getCourseRenderKey(course) {
  if (!course || typeof course !== "object") {
    renderKeyCounter += 1;
    return `course-render-${renderKeyCounter}`;
  }

  const existing = renderKeyByCourse.get(course);
  if (existing) return existing;

  renderKeyCounter += 1;
  const key = `course-render-${renderKeyCounter}`;
  renderKeyByCourse.set(course, key);
  return key;
}

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
const isExperientialCourse = (course) =>
  Boolean(course?.isExperiential) || /\bexperiential\b/i.test(String(course?.instructionalFormat || ""));
const colorSwatchStyle = (colorIndex) =>
  `background: var(--course-color-${colorIndex}-bg); border-color: var(--course-color-${colorIndex}-border);`;

function getCourseWorkdayLink(course) {
  if (!course || typeof course !== "object") return "";

  const link = courseWorkdayLink(course, window.location.href);
  return link;
}

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
  const raw = String(name || "").trim();
  if (!raw) return "";

  if (raw.includes(",")) {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  }

  return raw;
}

// Formats multiline content for HTML. Input: string. Output: HTML string.
function formatMultiline(text) {
  return escHTML(text || "").replace(/\n/g, "<br>");
}

// Renders course rows into the table body. Input: ui object, courses array/options. Output: none.
export function renderCourseObjects(
  ui,
  courses,
  {
    hasLoadedSchedule = Boolean(courses?.length),
    onRemoveCourse = null,
    onChangeCourseColor = null,
    courseColorPalettes = [],
    allCourses = courses,
  } = {},
) {
  if (typeof onRemoveCourse === "function") ui.onRemoveCourse = onRemoveCourse;
  if (typeof onChangeCourseColor === "function") ui.onChangeCourseColor = onChangeCourseColor;

  if (!ui.courseColorPickerCloseBound && ui.root) {
    ui.root.addEventListener("click", (event) => {
      if (event.target.closest?.(".course-card__color-picker")) return;
      ui.tableBody?.querySelectorAll(".course-card__color-picker.is-open").forEach((picker) => {
        picker.classList.remove("is-open");
        picker.querySelector(".course-card__color-button")?.setAttribute("aria-expanded", "false");
      });
    });
    ui.courseColorPickerCloseBound = true;
  }

  ui.tableBody.innerHTML = "";
  const frag = document.createDocumentFragment();
  const conflictPartnersByCode = ui?.conflictPartnersByCode instanceof Map ? ui.conflictPartnersByCode : new Map();
  const removeCourseHandler = typeof onRemoveCourse === "function" ? onRemoveCourse : ui.onRemoveCourse;
  const changeCourseColorHandler =
    typeof onChangeCourseColor === "function" ? onChangeCourseColor : ui.onChangeCourseColor;
  const groupRepresentatives = getCourseGroupRepresentatives(allCourses || courses);
  const colorOptions =
    Array.isArray(courseColorPalettes) && courseColorPalettes.length
      ? courseColorPalettes
      : DEFAULT_COURSE_COLOR_ASSIGNMENTS.map((id) => ({ id }));

  if (!hasLoadedSchedule) {
    const emptyState = document.createElement("div");
    emptyState.className = "course-list-empty";
    emptyState.innerHTML = `
      <span class="course-list-empty__copy">
        <span class="material-symbols-rounded course-list-empty__icon" aria-hidden="true">search</span>
        <span class="course-list-empty__text">Click the search button to find courses on this page.</span>
        <span class="course-list-empty__hint">You need to be on a page with a schedule table</span>
        <span class="course-list-empty__hint">(e.g. the 'View My Courses' page or a 'Saved Schedule')</span>
      </span>
    `;
    frag.appendChild(emptyState);
    ui.tableBody.appendChild(frag);
    debug.log({ id: "renderCourseObjects.empty" }, "Rendered empty schedule prompt");
    return;
  }

  (courses || []).forEach((course, index) => {
    const formatLabel = String(course.instructionalFormat || "").trim();
    const sectionLabel = String(course.section_number || "").trim();
    const isLectureCourse = !(
      course?.isLab ||
      course?.isSeminar ||
      course?.isDiscussion ||
      isExperientialCourse(course)
    );

    const { main: meetingMain, sub: meetingSub } = splitMeeting(course.meeting);
    const codeInfo = splitCourseCode(course.code || "");
    const averageInfo = buildAverageCourseInfo(course);
    const showAverageButton = Boolean(averageInfo && isLectureCourse);
    const averageState = getCourseAverageState(course);
    const instructorName = (course.instructor || "").trim() || "TBA";
    const rmpInfo = buildRmpLookupInfo(course);
    const rmpState = getCourseRmpState(course);
    const showColorPicker = groupRepresentatives.has(course) && typeof changeCourseColorHandler === "function";
    const courseWorkdayLink = getCourseWorkdayLink(course);

    const card = document.createElement("div");
    card.dataset.courseRenderKey = getCourseRenderKey(course);
    card.dataset.courseId = courseIdentity(course);
    const colorIndex = isValidCourseColorIndex(course?.colorIndex)
      ? course.colorIndex
      : (index % COURSE_COLOR_COUNT) + 1;
    const subClass =
      course.isLab || course.isSeminar || course.isDiscussion || isExperientialCourse(course)
        ? " course-card--sub"
        : "";
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
              ? `<span class="course-code-conflict wd-hover-tooltip" data-tooltip="${escHTML(conflictMessage)}">🚩</span>`
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
          ${
            showColorPicker
              ? `<div class="course-card__color-picker">
                  <button
                    class="course-card__color-button"
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded="false"
                  >
                    <span
                      class="course-card__color-swatch"
                      style="${escHTML(colorSwatchStyle(colorIndex))}"
                      aria-hidden="true"
                    ></span>
                  </button>
                  <div class="course-card__color-menu" role="listbox">
                    ${colorOptions
                      .map((palette) => {
                        const paletteId = Number(palette.id);
                        if (!isValidCourseColorIndex(paletteId)) return "";
                        const selected = paletteId === colorIndex;
                        return `<button
                          class="course-card__color-option${selected ? " is-selected" : ""}"
                          type="button"
                          role="option"
                          aria-selected="${selected}"
                          data-color-index="${paletteId}"
                        >
                          <span
                            class="course-card__color-option-swatch"
                            style="${escHTML(colorSwatchStyle(paletteId))}"
                            aria-hidden="true"
                          ></span>
                        </button>`;
                      })
                      .join("")}
                  </div>
                </div>`
              : ""
          }
          ${
            courseWorkdayLink
              ? `<button
                  class="course-card__link-button wd-hover-tooltip"
                  type="button"
                  aria-label="Open course link"
                  data-tooltip="Visit section page ↗"
                  data-course-link="${escHTML(courseWorkdayLink)}"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">link</span>
                </button>`
              : ""
          }
        </div>
        <div class="course-card__instructor-wrap">
          ${
            rmpInfo
              ? `<button
                  type="button"
                  class="course-card__rmp-button"
                  data-prof-name="${escHTML(rmpInfo.profName)}"
                  data-campus="${escHTML(rmpInfo.campus)}"
                >
                  RMP Rating
                </button>`
              : ""
          }
          <div class="course-card__instructor">
              ${escHTML(formatInstructorName(instructorName))}
          </div>
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
        ${
          showAverageButton
            ? `<div class="course-card__actions">
                <button
                  type="button"
                  class="course-card__avg-button"
                  data-subject="${escHTML(averageInfo.subject)}"
                  data-course="${escHTML(averageInfo.course)}"
                  data-section="${escHTML(averageInfo.section)}"
                  data-campus="${escHTML(averageInfo.campus)}"
                >
                  Course averages
                </button>
              </div>`
            : ""
        }
        <button class="course-card__delete-button" type="button">
          <span class="material-symbols-rounded" aria-hidden="true">delete</span>
        </button>
      </div>
    `;

    const colorPicker = card.querySelector(".course-card__color-picker");
    const colorButton = card.querySelector(".course-card__color-button");
    const colorMenu = card.querySelector(".course-card__color-menu");
    if (colorPicker && colorButton && colorMenu && typeof changeCourseColorHandler === "function") {
      colorButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const isOpen = colorPicker.classList.toggle("is-open");
        colorButton.setAttribute("aria-expanded", String(isOpen));
        ui.tableBody?.querySelectorAll(".course-card__color-picker.is-open").forEach((picker) => {
          if (picker === colorPicker) return;
          picker.classList.remove("is-open");
          picker.querySelector(".course-card__color-button")?.setAttribute("aria-expanded", "false");
        });
      });

      colorMenu.addEventListener("click", (event) => {
        const option = event.target.closest(".course-card__color-option");
        if (!option) return;

        event.preventDefault();
        event.stopPropagation();
        const selectedColorIndex = Number(option.dataset.colorIndex);
        if (isValidCourseColorIndex(selectedColorIndex)) changeCourseColorHandler(course, selectedColorIndex);
      });

      colorPicker.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        colorPicker.classList.remove("is-open");
        colorButton.setAttribute("aria-expanded", "false");
        colorButton.focus();
      });
    }

    const linkButton = card.querySelector(".course-card__link-button");
    if (linkButton) {
      linkButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const link = linkButton.dataset.courseLink || "";
        if (link) {
          window.open(link, "_blank", "noopener,noreferrer");
          ui.footerNotes?.showTemporary("Opened the section in a new tab. If asked, sign in there. If unavailable, search Workday and paste the current Section link.", { durationMs: 10000 });
        }
      });
    }

    const deleteButton = card.querySelector(".course-card__delete-button");
    if (deleteButton && typeof removeCourseHandler === "function") {
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeCourseHandler(course);
      });
    }

    const averageButton = card.querySelector(".course-card__avg-button");
    if (averageButton && showAverageButton) {
      averageState.button = averageButton;
      applyAverageButtonState(averageButton, averageState);

      averageButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (averageState.status === "resolved" && averageState.link && averageState.expiresAt > Date.now()) {
          window.open(averageState.link, "_blank", "noopener,noreferrer");
        } else {
          void loadAverageForButton(averageButton, averageState);
        }
      });
    }

    const rmpButton = card.querySelector(".course-card__rmp-button");
    if (rmpButton) {
      rmpState.button = rmpButton;
      applyRmpButtonState(rmpButton, rmpState);

      rmpButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (rmpState.status === "loaded" && rmpState.data?.link) {
          window.open(rmpState.data.link, "_blank", "noopener,noreferrer");
          return;
        }

        if (rmpState.status === "loading") return;

        await loadRmpForButton(rmpButton, rmpState, { force: rmpState.status === "error" });
      });
    }

    if (!courseWorkdayLink) {
      const note = document.createElement("small");
      note.textContent = "Workday section link unavailable or untrusted. Open Workday and copy the current Section link.";
      card.appendChild(note);
    }
    frag.appendChild(card);
  });

  ui.tableBody.appendChild(frag);

  debug.log({ id: "renderCourseObjects.done" }, "Rendered course rows", courses || []);
}

// Reorders already-rendered course cards to match courses order. Input: ui object, courses array. Output: none.
export function reorderCourseObjects(ui, courses) {
  const container = ui?.tableBody;
  if (!container) return;

  const cardsByKey = new Map();
  Array.from(container.children).forEach((child) => {
    const key = child?.dataset?.courseRenderKey;
    if (!key) return;
    cardsByKey.set(key, child);
  });

  const orderedCards = [];

  for (const course of courses || []) {
    const key = getCourseRenderKey(course);
    const card = cardsByKey.get(key);

    if (!card) {
      renderCourseObjects(ui, courses, { onRemoveCourse: ui.onRemoveCourse });
      return;
    }

    orderedCards.push(card);
  }

  const frag = document.createDocumentFragment();
  orderedCards.forEach((card) => frag.appendChild(card));
  container.appendChild(frag);

  debug.log({ id: "renderCourseObjects.reorder" }, "Reordered course rows", courses || []);
}
