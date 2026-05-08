import { debugFor, debugLog } from "../utilities/debugTool.js";
import { fetchCourseFromWorkdayId, parseWorkdayCourseIdFromAutomationId } from "./singleCourseImport.js";

const debug = debugFor("courseExtraction");
debugLog({ local: { courseExtraction: false } });

const SELECTED_COURSE_SELECTOR = '[data-automation-id^="selectedItem_15194$"]';
const COURSE_CONTAINER_SELECTOR = 'li[data-automation-id="compositeContainer"], tr, [role="row"]';

const readElementLabel = (el) =>
  (
    el?.getAttribute?.("data-automation-label") ||
    el?.getAttribute?.("title") ||
    el?.getAttribute?.("aria-label") ||
    el?.textContent ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();

function getCourseContainer(selectedCourseEl) {
  return selectedCourseEl?.closest?.(COURSE_CONTAINER_SELECTOR) || selectedCourseEl?.parentElement || selectedCourseEl;
}

function getPromptLabel(selectedCourseEl) {
  return readElementLabel(selectedCourseEl?.querySelector?.('[data-automation-id="promptOption"]')) || readElementLabel(selectedCourseEl);
}

function courseKey(course) {
  const id = String(course?.workdayCourseId || "").trim();
  if (id) return `id:${id}`;

  return ["code", "section_number"]
    .map((key) =>
      String(course?.[key] || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    )
    .join("|");
}

function removeDuplicateCourses(courses) {
  const seen = new Set();
  const uniqueCourses = [];

  for (const course of courses || []) {
    const key = courseKey(course);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    uniqueCourses.push(course);
  }

  debug.log({ id: "removeDuplicateCourses" }, "Deduped courses from Workday IDs", {
    inputCount: courses?.length || 0,
    outputCount: uniqueCourses.length,
    courseIds: uniqueCourses.map((course) => course.workdayCourseId).filter(Boolean),
  });

  return uniqueCourses;
}

function summarizeCourseNames(courses) {
  const seen = new Set();
  const names = [];

  for (const course of courses || []) {
    const label = String(course?.code || "").trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;

    seen.add(key);
    names.push(label);
  }

  return names;
}

export function collectWorkdayCourseIdEntries(root = document) {
  const selectedCourseEls = Array.from(root?.querySelectorAll?.(SELECTED_COURSE_SELECTOR) || []);
  const seenIds = new Set();
  const entries = [];

  for (const selectedCourseEl of selectedCourseEls) {
    const automationId = selectedCourseEl.getAttribute("data-automation-id") || "";
    const courseId = parseWorkdayCourseIdFromAutomationId(automationId);

    if (!courseId || seenIds.has(courseId)) continue;
    seenIds.add(courseId);

    entries.push({
      courseId,
      automationId,
      label: getPromptLabel(selectedCourseEl),
      element: selectedCourseEl,
      container: getCourseContainer(selectedCourseEl),
    });
  }

  debug.log({ id: "collectWorkdayCourseIdEntries.done" }, "Collected Workday course IDs", {
    count: entries.length,
    entries: entries.map(({ courseId, automationId, label }) => ({ courseId, automationId, label })),
  });

  return entries;
}

async function extractCourseFromEntry(entry) {
  try {
    const course = await fetchCourseFromWorkdayId(entry.courseId);
    debug.log({ id: "extractCourseFromEntry.jsonSuccess" }, "Extracted course from Workday JSON", {
      courseId: entry.courseId,
      code: course?.code,
      section: course?.section_number,
    });
    return course;
  } catch (error) {
    debug.warn({ id: "extractCourseFromEntry.failed" }, "Could not extract course from Workday JSON", {
      courseId: entry.courseId,
      label: entry.label,
      error: String(error?.message || error),
    });
    return null;
  }
}

// Extracts courses from Workday by collecting section IDs and fetching their JSON details.
// Input: optional root/selector callback. Output: array of course objects or null on cancel.
export async function extractCoursesData({ root = document, selectSchedule } = {}) {
  debug.log({ id: "extractCoursesData.start" }, "Starting course-ID based extraction");

  const entries = collectWorkdayCourseIdEntries(root);
  if (!entries.length) {
    debug.warn({ id: "extractCoursesData.noCourseIds" }, "No Workday course IDs were found on the page");
    return [];
  }

  const candidate = {
    id: "workday-course-ids",
    title: "Detected Workday Courses",
    entries,
  };

  if (typeof selectSchedule === "function") {
    debug.log({ id: "extractCoursesData.selectionSkipped" }, "Single course-ID candidate detected; schedule picker not needed", {
      courseCount: entries.length,
    });
  }

  const results = await Promise.allSettled(candidate.entries.map((entry) => extractCourseFromEntry(entry)));
  const courses = results
    .map((result, index) => {
      if (result.status === "fulfilled") return result.value;

      const entry = candidate.entries[index];
      debug.warn({ id: "extractCoursesData.entryRejected" }, "Course extraction promise rejected", {
        courseId: entry?.courseId,
        error: String(result.reason?.message || result.reason),
      });
      return null;
    })
    .filter(Boolean);

  const extractedCourses = removeDuplicateCourses(courses);

  debug.log({ id: "extractCoursesData.done" }, "Course-ID extraction complete", {
    requestedCount: candidate.entries.length,
    extractedCount: extractedCourses.length,
    failedIds: candidate.entries
      .filter((entry) => !extractedCourses.some((course) => String(course.workdayCourseId) === String(entry.courseId)))
      .map((entry) => entry.courseId),
    courseNames: summarizeCourseNames(extractedCourses),
  });

  return extractedCourses;
}
