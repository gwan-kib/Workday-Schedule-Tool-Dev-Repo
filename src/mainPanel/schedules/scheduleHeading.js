import { dateNumber } from "../../core/meetings.js";

const termForMonth = (month) =>
  month >= 9 ? "Winter Term 1" : month <= 4 ? "Winter Term 2" : month <= 6 ? "Summer Term 1" : "Summer Term 2";

// Heading labels are presentation only; actual meeting dates still control
// rendering, conflicts and exports. Prefer explicit term metadata when present.
export function scheduleTermLabel(courses = []) {
  const terms = new Set();
  for (const course of courses) {
    const explicit = [course.term, course.academicPeriod, course.academicPeriod?.descriptor]
      .filter((value) => typeof value === "string")
      .flatMap((value) => [...value.matchAll(/\b(Winter|Summer)(?:\s+Session)?\s*[-–]?\s*Term\s*([12])\b/gi)]);
    if (explicit.length) {
      explicit.forEach((match) =>
        terms.add(`${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} Term ${match[2]}`),
      );
      continue;
    }
    const ranges = (course.meetingLines || []).flatMap((line) => [
      ...String(line).matchAll(/(\d{4}-\d{2}-\d{2})\s*[-–—]\s*(\d{4}-\d{2}-\d{2})/g),
    ]);
    if (!ranges.length && dateNumber(course.startDate) !== null)
      terms.add(termForMonth(Number(course.startDate.slice(5, 7))));
    for (const range of ranges) {
      const start = dateNumber(range[1]),
        end = dateNumber(range[2]);
      if (start === null || end === null || end < start || end - start > 730) continue;
      const [year, month] = range[1].split("-").map(Number);
      const [endYear, endMonth] = range[2].split("-").map(Number);
      for (let index = year * 12 + month - 1; index <= endYear * 12 + endMonth - 1; index++)
        terms.add(termForMonth((index % 12) + 1));
    }
  }
  return terms.size > 1 ? "Multiple terms detected" : [...terms][0] || "Term unavailable";
}

// Shared name and term labels for the course and timetable headings.
export function renderScheduleHeading(host, scheduleName, courses) {
  if (!host) return;
  const name = document.createElement("span");
  name.className = "schedule-heading-name";
  name.textContent = scheduleName || "Working Schedule";
  const term = document.createElement("span");
  term.className = "schedule-heading-term";
  term.textContent = scheduleTermLabel(courses);
  host.replaceChildren(name, term);
}
