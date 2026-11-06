import { catalogCourseCode, requestCourseCatalog } from "../api/courseCatalog.js";
import { courseDateRange, dateNumber, normalizeSchedule } from "../core/meetings.js";
import { createLimiter } from "../utilities/network.js";
import { createCourseObject } from "./singleCourseImport.js";

const MAX_COURSES = 24;
const catalogDays = new Map([
  ["m", "Mon"], ["t", "Tue"], ["w", "Wed"], ["th", "Thu"],
  ["f", "Fri"], ["sa", "Sat"], ["su", "Sun"],
]);
const formatKey = value => String(value || "").trim().toLowerCase().replace(/^lab$/, "laboratory");
const sectionKey = value => String(value || "").trim().toUpperCase();
const fitsCampus = (term, code) => typeof term === "string" &&
  term.endsWith(code.includes("_O ") ? "(UBC-O)" : "(UBC-V)");

function overlaps(a, b) {
  return dateNumber(a.startDate) !== null && dateNumber(a.endDate) !== null &&
    dateNumber(b.startDate) !== null && dateNumber(b.endDate) !== null &&
    a.startDate <= b.endDate && b.startDate <= a.endDate;
}

function knownRange(course) {
  const range = courseDateRange(course);
  return range.startDate ? range : { startDate: course.startDate, endDate: course.endDate };
}

function identifyOffering(course, rows, code) {
  const range = knownRange(course);
  const period = typeof course.academicPeriod === "string" ? course.academicPeriod.trim() : "";
  const format = formatKey(course.instructionalFormat);
  const matches = rows.filter(row =>
    fitsCampus(row.term, code) &&
    sectionKey(row.section) === sectionKey(course.section_number) &&
    (!format || formatKey(row.format) === format) &&
    (fitsCampus(period, code) ? row.term === period : overlaps(range, row)),
  );
  const terms = new Set(matches.map(row => row.term));
  return terms.size === 1 ? matches[0].term : "";
}

function catalogTime(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds >= 86400 || seconds % 60) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = String((seconds / 60) % 60).padStart(2, "0");
  return (hours % 12 || 12) + ":" + minutes + (hours >= 12 ? " p.m." : " a.m.");
}

function optionCourse(code, row) {
  const { section, title, format, term, mode, instructors, days, startDate, endDate } = row;
  if (row.status !== "Open" || row.varies || row.hasRestrictions || !mode ||
    !Array.isArray(days) || !days.length || days.some(day => !catalogDays.has(day))) return null;
  if (typeof section !== "string" || !section.trim() || typeof title !== "string" || !format) return null;

  const start = catalogTime(row.startTime);
  const end = catalogTime(row.endTime);
  if (!start || !end || dateNumber(startDate) === null || dateNumber(endDate) === null) return null;
  const line = startDate + " - " + endDate + " | " + days.map(day => catalogDays.get(day)).join(" ") + " | " + start + " - " + end;
  const course = {
    ...createCourseObject({
      sectionDetails: { code, section_number: section, title },
      instructionalFormat: format,
      meetingLines: [line],
      instructors: Array.isArray(instructors) ? instructors.filter(name => typeof name === "string") : [],
      isOnline: mode === "Online",
    }),
    academicPeriod: term,
    deliveryMode: mode,
    catalogSectionLink: row.link,
  };
  return normalizeSchedule([course]).unknownCourses.length ? null : course;
}

export async function loadOptimizerOptions(draft, {
  loadCatalog = requestCourseCatalog,
  signal,
} = {}) {
  const fixed = [];
  const groups = [];
  const report = [];
  const byCode = new Map();

  for (const course of draft) {
    const code = catalogCourseCode(course.code);
    if (!code) {
      fixed.push(course);
      report.push({ label: course.code, note: "Kept as loaded because the UBC course code could not be matched." });
      continue;
    }
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(course);
  }

  if (byCode.size > MAX_COURSES)
    throw new Error("Search up to 24 courses at a time. Load a smaller working schedule and retry.");

  const limit = createLimiter(3);
  const listings = await Promise.all([...byCode].map(([code]) => limit(async () => {
    signal?.throwIfAborted();
    try {
      return await loadCatalog(code);
    } catch {
      return null;
    }
  })));
  signal?.throwIfAborted();

  for (const [index, [code, courses]] of [...byCode].entries()) {
    const rows = listings[index];
    if (!rows) {
      fixed.push(...courses);
      report.push({ label: code, note: "Kept as loaded because the UBC section listing could not be retrieved." });
      continue;
    }

    const terms = courses.map(course => identifyOffering(course, rows, code));
    if (terms.some(term => !term)) {
      fixed.push(...courses);
      report.push({ label: code, note: "Kept as loaded because the original section and term could not be matched." });
      continue;
    }

    for (const term of new Set(terms)) {
      const loaded = courses.filter((_, i) => terms[i] === term);
      const sections = rows.filter(row => row.term === term);
      const label = code + " · " + term;
      const count = sections.length + (sections.length === 1 ? " listed section. " : " listed sections. ");
      const formats = new Set(sections.map(row => formatKey(row.format)));

      // A public listing can confirm a single activity choice. It does not
      // establish which separately listed lectures, labs or seminars can pair.
      const unknownTerm = rows.some(row => !row.term &&
        loaded.some(course => overlaps(knownRange(course), row)));
      if (loaded.length !== 1 || formats.size !== 1 || formats.has("") || unknownTerm ||
        sections.some(row => row.hasRestrictions)) {
        fixed.push(...loaded);
        report.push({ label, note: count + "Kept your current sections because pairing or restrictions could not be verified." });
        continue;
      }

      const [current] = loaded;
      const options = [[current]];
      const used = new Set([sectionKey(current.section_number)]);
      const ambiguous = new Set(sections.filter((row, i) =>
        sections.some((other, j) => i !== j && sectionKey(other.section) === sectionKey(row.section)),
      ).map(row => sectionKey(row.section)));
      for (const row of sections) {
        const key = sectionKey(row.section);
        if (used.has(key) || ambiguous.has(key)) continue;
        const course = optionCourse(code, row);
        if (!course) continue;
        used.add(key);
        options.push([course]);
      }
      if (options.length > 1) groups.push(options);
      else fixed.push(current);
      const alternatives = options.length - 1;
      report.push({
        label,
        note: count + (alternatives
          ? alternatives + (alternatives === 1 ? " usable alternative." : " usable alternatives.")
          : "Kept as loaded because no other open section had a verified meeting time."),
      });
    }
  }
  return { groups, fixed, report };
}
