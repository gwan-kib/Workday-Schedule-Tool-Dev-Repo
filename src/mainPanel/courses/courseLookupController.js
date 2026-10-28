import { gradeResultText, renderGradeDetails } from "../../api/averageGrades/gradeResultView.js";
import { fetchCourseStatistics, courseStatisticsLabel } from "../../api/averageGrades/courseStatistics.js";
import {
  fetchProfRating,
  inferCampusFromCourseCode,
  normalizeProfessorName,
} from "../../api/rateMyProfessor/rmpApi.js";
import { debugFor } from "../../utilities/debugTool.js";
const debug = debugFor("courseLookups");
const averageStateByCourse = new WeakMap();
const rmpStateByCourse = new WeakMap();
// Returns persistent average-button UI state per course object. Input: course object. Output: state object.
function getCourseAverageState(course) {
  if (!course || typeof course !== "object") {
    return { status: "idle", label: "Course averages", link: "", button: null, pendingRequest: null };
  }

  const existing = averageStateByCourse.get(course);
  if (existing) return existing;

  const state = { status: "idle", label: "Course averages", link: "", button: null, pendingRequest: null };
  averageStateByCourse.set(course, state);
  return state;
}

// Returns persistent RMP UI state per course object. Input: course object. Output: state object.
function getCourseRmpState(course) {
  if (!course || typeof course !== "object") {
    return { status: "idle", data: null, button: null, pendingRequest: null };
  }

  const existing = rmpStateByCourse.get(course);
  if (existing) return existing;

  const state = { status: "idle", data: null, button: null, pendingRequest: null };
  rmpStateByCourse.set(course, state);
  return state;
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

// Applies current average state to a button. Input: button element and state. Output: none.
function applyAverageButtonState(button, state) {
  if (!button) return;

  const status = state?.status || "idle";
  const label = state?.label || "Course averages";
  const hasLink = status === "resolved" && Boolean(state?.link);

  button.dataset.status = status;
  button.classList.toggle("wd-hover-tooltip", hasLink);
  button.textContent = status === "loading" ? "Loading..." : label;
  button.disabled = status === "loading";
  renderGradeDetails(button, { details: state.details, source: state.link });

  if (hasLink) {
    button.dataset.tooltip = state.tooltip || "Visit UBCGrades ↗";
  } else {
    delete button.dataset.tooltip;
    button.removeAttribute("title");
  }
}

// Formats RMP label text. Input: rating data or null. Output: button label.
function formatRmpText(data) {
  if (!data) return "RMP N/A";
  const rating = typeof data.rating === "number" ? data.rating.toFixed(1) : String(data.rating || "").trim();
  return rating ? `RateMyProf:\n${rating} / 5` : "RateMyProf: N/A";
}

// Extracts instructor/campus info for an RMP lookup. Input: course object. Output: lookup object or null.
function buildRmpLookupInfo(courseData) {
  const normalized = normalizeProfessorName(courseData?.instructor);
  if (!normalized) return null;

  return {
    profName: normalized.fullName,
    campus: inferCampusFromCourseCode(courseData?.code),
  };
}

// Applies current RMP state to a button. Input: button element and state. Output: none.
function applyRmpButtonState(button, state) {
  if (!button) return;

  const status = state?.status || "idle";
  const data = state?.data || null;
  const hasProfileLink = status === "loaded" && Boolean(data?.link);

  button.disabled = status === "loading";
  button.dataset.status = status;
  button.classList.toggle("wd-hover-tooltip", hasProfileLink);

  if (hasProfileLink) {
    button.dataset.tooltip = "Visit RateMyProf ↗";
  } else {
    delete button.dataset.tooltip;
    button.removeAttribute("title");
  }

  if (status === "loading") {
    button.textContent = "Loading...";
    return;
  }

  if (hasProfileLink) {
    button.textContent = `${data.stale ? "Stale - " : ""}${formatRmpText(data)}`;
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

// Loads RMP data into a course-card button and keeps the latest rendered button synced. Input: button/state object. Output: none.
async function loadRmpForButton(button, state, { force = false } = {}) {
  if (!button || !state) return;

  state.button = button;

  if (state.status === "loading") {
    applyRmpButtonState(button, state);
    try {
      await state.pendingRequest;
    } catch (error) {
      // The request path already updates UI state and logging.
    }
    return;
  }

  if (!force && state.expiresAt > Date.now() && (state.status === "loaded" || state.status === "empty")) {
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
      state.expiresAt = Date.now() + (data?.stale ? 60000 : 3600000);
    } catch (error) {
      state.data = null;
      state.status = "error";
      debug.warn({ id: "renderCourseObjects.rmpLookupFailed" }, "Failed to load RMP rating", {
        instructor: profName,
        campus,
        error: String(error),
      });
    } finally {
      state.pendingRequest = null;
      applyRmpButtonState(state.button, state);
    }
  })();

  state.pendingRequest = request;
  await request;
}

// Returns current yearsession string. Input: none. Output: YYYYW string.
function getCurrentYearsession() {
  return `${new Date().getFullYear()}W`;
}

// Loads average into a course-card button and keeps the latest rendered button synced. Input: button/state object. Output: none.
async function loadAverageForButton(button, state) {
  if (!button || !state) return;

  state.button = button;

  if (state.status === "loading") {
    applyAverageButtonState(button, state);
    try {
      await state.pendingRequest;
    } catch (error) {
      // The request path already updates UI state and logging.
    }
    return;
  }

  if (state.status === "resolved" && state.expiresAt > Date.now()) {
    applyAverageButtonState(button, state);
    return;
  }

  const subject = button.dataset.subject || "";
  const course = button.dataset.course || "";
  const section = button.dataset.section || "";
  const campus = button.dataset.campus || "UBCV";
  const yearsession = getCurrentYearsession();

  state.status = "loading";
  applyAverageButtonState(button, state);

  if (!subject || !course || !yearsession) {
    state.label = "Average: N/A";
    state.link = "";
    state.status = "resolved";
    applyAverageButtonState(button, state);
    return;
  }

  const request = (async () => {
    try {
      const result = await fetchCourseStatistics({ campus, yearsession, subject, course });
      const text = gradeResultText(result);
      state.label = text.summary;
      state.details = text.details;
      state.link = result.source || "";
      state.tooltip = courseStatisticsLabel(result) + "\nView source";
      state.expiresAt = Date.now() + (result.stale ? 60000 : 3600000);
    } catch (error) {
      state.label = "Grades: network error - click to retry";
      state.details = "";
      state.expiresAt = 0;
      state.link = "";
      debug.warn({ id: "renderCourseObjects.averageLookupFailed" }, "Failed to load course average", {
        subject,
        course,
        section,
        campus,
        error: String(error),
      });
    } finally {
      state.pendingRequest = null;
      state.status = "resolved";
      applyAverageButtonState(state.button, state);
    }
  })();

  state.pendingRequest = request;
  await request;
}

export {
  getCourseAverageState,
  getCourseRmpState,
  buildAverageCourseInfo,
  buildRmpLookupInfo,
  applyAverageButtonState,
  applyRmpButtonState,
  loadAverageForButton,
  loadRmpForButton,
};
export function hydrateCourseLookups(ui, courses) {
  const cards = [...ui.tableBody.querySelectorAll(".course-card")];
  courses.forEach((course, i) => {
    const card = cards[i];
    if (!card) return;
    const average = card.querySelector(".course-card__avg-button");
    const rmp = card.querySelector(".course-card__rmp-button");
    if (average) void loadAverageForButton(average, getCourseAverageState(course));
    if (rmp) void loadRmpForButton(rmp, getCourseRmpState(course));
  });
}
