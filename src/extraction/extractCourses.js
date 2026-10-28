import { fetchCourseFromWorkdayId } from "./singleCourseImport.js";
import { collectSectionEntries, WORKDAY_SELECTORS } from "./workdaySelectors.js";
import { createLimiter } from "../utilities/network.js";
import { courseIdentity } from "../core/meetings.js";
const limit = createLimiter(4);

export async function extractCoursesData({
  root = document,
  entries = collectSectionEntries(root),
  fetchCourse = fetchCourseFromWorkdayId,
} = {}) {
  if (!entries.length)
    return {
      status: root.querySelector?.(WORKDAY_SELECTORS.login)
        ? "logged-out"
        : root.querySelector?.(WORKDAY_SELECTORS.emptySchedule)
          ? "empty"
          : "unsupported",
      requestedCount: 0,
      successCount: 0,
      courses: [],
      failures: [],
    };
  const results = await Promise.allSettled(entries.map((entry) => limit(() => fetchCourse(entry.courseId))));
  const courses = [],
    failures = [],
    seen = new Set();
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value?.code && result.value?.section_number) {
      const key = courseIdentity(result.value);
      if (!seen.has(key)) {
        seen.add(key);
        courses.push(result.value);
      }
    } else
      failures.push({
        ...entries[index],
        classification:
          result.reason?.status === 401 || result.reason?.status === 403
            ? "logged-out"
            : result.reason?.status
              ? "network"
              : "data-or-network",
        message: result.reason?.message || "Incomplete course data",
      });
  });
  return {
    status: failures.length ? (courses.length ? "partial" : "failed") : "complete",
    requestedCount: entries.length,
    successCount: results.filter((r) => r.status === "fulfilled" && r.value?.code && r.value?.section_number).length,
    courses,
    failures,
  };
}
