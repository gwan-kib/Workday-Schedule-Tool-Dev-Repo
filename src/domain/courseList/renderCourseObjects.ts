import { debugFor } from "../../lib/debug";
import type { AverageCourseInfo, CourseData, ProfessorRating } from "../../lib/types";
import { fetchSectionGradesWithFallback } from "../grades/gradesApi";
import { fetchProfRating, inferCampusFromCourseCode, normalizeProfessorName } from "../rmp/rmpApi";

const debug = debugFor("renderCourseObjects");

const renderKeyByCourse = new WeakMap<CourseData, string>();
const averageStateByCourse = new WeakMap<CourseData, { status: string; label: string }>();
const rmpStateByCourse = new WeakMap<
  CourseData,
  {
    status: string;
    data: ProfessorRating | null;
    button: HTMLButtonElement | null;
    pendingRequest: Promise<void> | null;
  }
>();

let renderKeyCounter = 0;

function getCourseRenderKey(course: CourseData): string {
  const existing = renderKeyByCourse.get(course);
  if (existing) return existing;

  renderKeyCounter += 1;
  const key = `course-render-${renderKeyCounter}`;
  renderKeyByCourse.set(course, key);
  return key;
}

function getCourseAverageState(course: CourseData) {
  const existing = averageStateByCourse.get(course);
  if (existing) return existing;

  const state = { status: "idle", label: "5 Year Average" };
  averageStateByCourse.set(course, state);
  return state;
}

function getCourseRmpState(course: CourseData) {
  const existing = rmpStateByCourse.get(course);
  if (existing) return existing;

  const state = { status: "idle", data: null, button: null, pendingRequest: null };
  rmpStateByCourse.set(course, state);
  return state;
}

const escHTML = (value: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeConflictToken = (value: string) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

function cleanLines(text: string): string {
  return String(text || "")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function splitMeeting(meeting: string): { main: string; sub: string } {
  const parts = cleanLines(meeting).split("\n");
  const main = (parts[0] || "").trim();
  const sub = parts
    .slice(1)
    .map((part) => part.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, "").trim())
    .filter(Boolean)
    .join("\n");

  return { main, sub };
}

function splitCourseCode(code: string) {
  const match = String(code || "").match(/^([A-Z_]+)\s*(\d+[A-Z]?)$/);
  if (match) {
    return { subject: match[1], number: match[2], raw: `${match[1]} ${match[2]}` };
  }

  return { subject: "", number: "", raw: code || "" };
}

function formatInstructorName(name: string): string {
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

function formatMultiline(text: string): string {
  return escHTML(text || "").replace(/\n/g, "<br>");
}

function buildAverageCourseInfo(course: CourseData): AverageCourseInfo | null {
  const match = String(course.code || "")
    .trim()
    .toUpperCase()
    .match(/^\s*([A-Z][A-Z0-9_]{1,8})\s*(\d{3}[A-Z]?)\s*$/);
  if (!match) return null;

  const section = String(course.section_number || "")
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

function extractAverage(data: unknown): number | string | null {
  if (!data) return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const average = extractAverage(item);
      if (average != null) return average;
    }
    return null;
  }

  if (typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const direct =
    record.average ??
    record.avg ??
    record.average_grade ??
    record.averagePercent ??
    record.avgPercent ??
    record.mean ??
    null;

  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const nested =
    (record.grades as Record<string, unknown> | undefined)?.average ??
    (record.grades as Record<string, unknown> | undefined)?.avg ??
    (record.summary as Record<string, unknown> | undefined)?.average ??
    (record.summary as Record<string, unknown> | undefined)?.avg ??
    null;

  if (typeof nested === "number") return nested;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return null;
}

const hasValidAverage = (data: unknown) => extractAverage(data) != null;

function formatAverageText(average: number | string | null): string {
  if (average == null) return "Average: N/A";
  if (typeof average === "number") return `Average: ${average.toFixed(1)}%`;
  return `Average: ${average}%`;
}

function applyAverageButtonState(
  button: HTMLButtonElement | null,
  state: { status: string; label: string },
): void {
  if (!button) return;

  const status = state.status || "idle";
  const label = state.label || "5 Year Average";

  button.dataset.status = status;
  button.textContent = status === "loading" ? "Loading..." : label;
  button.disabled = status === "loading" || status === "resolved";
}

function formatRmpText(data: ProfessorRating | null): string {
  if (!data) return "RMP N/A";
  const rating = typeof data.rating === "number" ? data.rating.toFixed(1) : String(data.rating || "").trim();
  return rating ? `RateMyProf:\n${rating} / 5` : "RateMyProf: N/A";
}

function buildRmpLookupInfo(course: CourseData): { profName: string; campus: "UBCV" | "UBCO" } | null {
  const normalized = normalizeProfessorName(course.instructor);
  if (!normalized) return null;

  return {
    profName: normalized.fullName,
    campus: inferCampusFromCourseCode(course.code),
  };
}

function applyRmpButtonState(
  button: HTMLButtonElement | null,
  state: {
    status: string;
    data: ProfessorRating | null;
  },
): void {
  if (!button) return;

  const status = state.status || "idle";
  const data = state.data || null;
  const hasProfileLink = status === "loaded" && Boolean(data?.link);

  button.disabled = status === "loading";
  button.dataset.status = status;
  button.classList.toggle("wd-hover-tooltip", hasProfileLink);

  if (hasProfileLink) {
    button.dataset.tooltip = "Visit RateMyProf Site ->";
    button.title = "Open RateMyProfessors profile";
  } else {
    delete button.dataset.tooltip;
    button.removeAttribute("title");
  }

  if (status === "loading") {
    button.textContent = "Loading...";
    return;
  }

  if (hasProfileLink) {
    button.textContent = formatRmpText(data);
    return;
  }

  if (status === "empty") {
    button.textContent = "RateMyProf: N/A";
    return;
  }

  if (status === "error") {
    button.textContent = "RateMyProf: Error";
    return;
  }

  button.textContent = "RateMyProf";
}

async function loadRmpForButton(
  button: HTMLButtonElement,
  state: {
    status: string;
    data: ProfessorRating | null;
    button: HTMLButtonElement | null;
    pendingRequest: Promise<void> | null;
  },
  { force = false }: { force?: boolean } = {},
) {
  state.button = button;

  if (state.status === "loading") {
    applyRmpButtonState(button, state);
    try {
      await state.pendingRequest;
    } catch {
      // Errors are handled when the request promise resolves.
    }
    return;
  }

  if (!force && (state.status === "loaded" || state.status === "empty")) {
    applyRmpButtonState(button, state);
    return;
  }

  const profName = button.dataset.profName || "";
  const campus = button.dataset.campus || "UBCV";

  if (!profName) {
    state.data = null;
    state.status = "empty";
    applyRmpButtonState(button, state);
    return;
  }

  state.status = "loading";
  applyRmpButtonState(button, state);

  const request = (async () => {
    try {
      const data = await fetchProfRating({ profName, campus });
      state.data = data;
      state.status = data?.link ? "loaded" : "empty";
    } catch (error) {
      state.data = null;
      state.status = "error";
      debug.warn({ id: "renderCourseObjects.rmpLookupFailed" }, "Failed to load RMP rating", error);
    } finally {
      state.pendingRequest = null;
      applyRmpButtonState(state.button, state);
    }
  })();

  state.pendingRequest = request;
  await request;
}

function getCurrentYearsession(): string {
  return `${new Date().getFullYear()}W`;
}

async function loadAverageForButton(button: HTMLButtonElement, state: { status: string; label: string }) {
  if (state.status === "loading" || state.status === "resolved") return;

  const subject = button.dataset.subject || "";
  const course = button.dataset.course || "";
  const section = button.dataset.section || "";
  const campus = button.dataset.campus || "UBCV";
  const yearsession = getCurrentYearsession();

  state.status = "loading";
  applyAverageButtonState(button, state);

  if (!subject || !course || !yearsession) {
    state.label = "Average: N/A";
    state.status = "resolved";
    applyAverageButtonState(button, state);
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

    state.label = formatAverageText(extractAverage(data));
  } catch {
    state.label = "Average: N/A";
  } finally {
    state.status = "resolved";
    applyAverageButtonState(button, state);
  }
}

export function renderCourseObjects(
  container: HTMLElement | null,
  courses: CourseData[],
  conflictPartnersByCode: Map<string, string[]> = new Map(),
): void {
  if (!container) return;

  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  courses.forEach((course, index) => {
    const formatLabel = String(course.instructionalFormat || "").trim();
    const sectionLabel = String(course.section_number || "").trim();
    const isLectureCourse = !(course.isLab || course.isSeminar || course.isDiscussion);
    const { main: meetingMain, sub: meetingSub } = splitMeeting(course.meeting);
    const codeInfo = splitCourseCode(course.code || "");
    const averageInfo = buildAverageCourseInfo(course);
    const showAverageButton = Boolean(averageInfo && isLectureCourse);
    const averageState = getCourseAverageState(course);
    const instructorName = course.instructor.trim() || "TBA";
    const rmpInfo = buildRmpLookupInfo(course);
    const rmpState = getCourseRmpState(course);

    const card = document.createElement("div");
    card.dataset.courseRenderKey = getCourseRenderKey(course);

    const colorIndex = course.colorIndex || (index % 7) + 1;
    const subClass = course.isLab || course.isSeminar || course.isDiscussion ? " course-card--sub" : "";
    card.className = `course-card course-card--color-${colorIndex}${subClass}`;

    const courseConflictKey = normalizeConflictToken(course.code || course.title || "");
    const conflictPartners = conflictPartnersByCode.get(courseConflictKey) || [];
    const conflictMessage = conflictPartners.length
      ? `Schedule conflict with: ${conflictPartners.join(", ")}`
      : "";

    card.innerHTML = `
      <div class="course-card__top">
        <div class="course-card__code">
          ${
            conflictPartners.length
              ? `<span class="course-code-conflict wd-hover-tooltip" aria-label="Schedule conflict warning" data-tooltip="${escHTML(conflictMessage)}">!</span>`
              : ""
          }
          ${
            codeInfo.subject
              ? `<span class="course-code-subject">${escHTML(codeInfo.subject)}</span>
                 <span class="course-code-number">${escHTML(codeInfo.number)}</span>`
              : `<span class="course-code-subject">${escHTML(codeInfo.raw)}</span>`
          }
          ${
            sectionLabel
              ? `<span class="course-code-section wd-hover-tooltip" data-tooltip="Section number">${escHTML(sectionLabel)}</span>`
              : ""
          }
          ${formatLabel ? `<span class="course-pill">${escHTML(formatLabel)}</span>` : ""}
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
          <div class="course-card__instructor">${formatInstructorName(instructorName)}</div>
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
          showAverageButton && averageInfo
            ? `<div class="course-card__actions">
                <button
                  type="button"
                  class="course-card__avg-button"
                  data-subject="${escHTML(averageInfo.subject)}"
                  data-course="${escHTML(averageInfo.course)}"
                  data-section="${escHTML(averageInfo.section)}"
                  data-campus="${escHTML(averageInfo.campus)}"
                >
                  5 Year Average
                </button>
              </div>`
            : ""
        }
      </div>
    `;

    const averageButton = card.querySelector<HTMLButtonElement>(".course-card__avg-button");
    if (averageButton && averageInfo) {
      applyAverageButtonState(averageButton, averageState);
      averageButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void loadAverageForButton(averageButton, averageState);
      });
    }

    const rmpButton = card.querySelector<HTMLButtonElement>(".course-card__rmp-button");
    if (rmpButton) {
      rmpState.button = rmpButton;
      applyRmpButtonState(rmpButton, rmpState);

      rmpButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (rmpState.status === "loaded" && rmpState.data?.link) {
          window.open(rmpState.data.link, "_blank", "noopener,noreferrer");
          return;
        }

        if (rmpState.status === "loading") return;
        void loadRmpForButton(rmpButton, rmpState, { force: rmpState.status === "error" });
      });

      void loadRmpForButton(rmpButton, rmpState);
    }

    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}
