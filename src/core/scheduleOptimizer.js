import { courseIdentity, normalizeSchedule } from "./meetings.js";
import { personalBlockCourses } from "./personalBlocks.js";

export const OPTIMIZER_PRIORITIES = {
  friday: "Fridays off",
  late: "Later starts",
  gaps: "Shorter gaps",
  early: "Earlier finishes",
  campus: "Fewer campus days",
};

const MAX_SEARCH_STEPS = 30000;
const RESULT_COUNT = 5;

function occurrenceDays(courses, personal = false) {
  const { meetings, unknownCourses } = normalizeSchedule(courses);
  if (unknownCourses.length) return null;
  const days = new Map();
  for (const meeting of meetings) {
    const interval = {
      courseId: meeting.courseId,
      start: meeting.startMinutes,
      end: meeting.endMinutes,
      personal,
      campus: !meeting.course.isOnline,
    };
    for (const date of meeting.dates) {
      if (!days.has(date)) days.set(date, []);
      days.get(date).push(interval);
    }
  }
  return days;
}

function clash(a, b) {
  return !(a.personal && b.personal) &&
    a.courseId !== b.courseId && a.start < b.end && b.start < a.end;
}

function addDays(occupied, days) {
  for (const [date, added] of days) {
    const existing = occupied.get(date) || [];
    if (added.some((a, index) =>
      existing.some(b => clash(a, b)) || added.slice(0, index).some(b => clash(a, b)))) {
      return null;
    }
  }
  for (const [date, added] of days) {
    if (!occupied.has(date)) occupied.set(date, []);
    occupied.get(date).push(...added);
  }
  return () => {
    for (const [date, added] of days) {
      const intervals = occupied.get(date);
      intervals.length -= added.length;
      if (!intervals.length) occupied.delete(date);
    }
  };
}

function measure(occupied) {
  let friday = 0, earliest = 1440, latest = 0, totalGap = 0, classDays = 0, campus = 0;
  for (const [date, intervals] of occupied) {
    const classes = intervals.filter(item => !item.personal).sort((a, b) => a.start - b.start);
    if (!classes.length) continue;
    classDays++;
    if (new Date(date + "T00:00:00Z").getUTCDay() === 5) friday++;
    if (classes.some(item => item.campus)) campus++;
    earliest = Math.min(earliest, classes[0].start);
    let end = classes[0].end;
    for (const item of classes.slice(1)) {
      totalGap += Math.max(0, item.start - end);
      end = Math.max(end, item.end);
    }
    latest = Math.max(latest, end);
  }
  return { friday, late: earliest, gaps: totalGap / (classDays || 1), early: latest, campus };
}

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sectionKey = courses => JSON.stringify(courses.map(courseIdentity).sort());

export async function optimizeSchedules({
  groups,
  fixed = [],
  personalBlocks = [],
  priorities = [],
  signal,
}) {
  const rank = [...new Set(priorities)];
  if (rank.some(key => !Object.hasOwn(OPTIMIZER_PRIORITIES, key)))
    throw new Error("Choose valid schedule priorities.");

  const occupied = occurrenceDays(personalBlockCourses(personalBlocks), true);
  const fixedDays = occurrenceDays(fixed);
  if (!fixedDays) throw new Error("A fixed course has missing or uncertain meeting times. Update it or add a verified option for that course.");
  if (!addDays(occupied, fixedDays))
    return { suggestions: [], excluded: 0, limited: false, fixedConflict: true };

  const options = [];
  let excluded = 0;
  for (const group of groups) {
    const unique = new Map();
    for (const courses of group) {
      signal?.throwIfAborted();
      const key = sectionKey(courses);
      if (unique.has(key)) continue;
      const days = occurrenceDays(courses);
      if (!days) {
        excluded++;
        continue;
      }
      unique.set(key, { key, courses, days });
    }
    options.push([...unique.values()].sort((a, b) => compareText(a.key, b.key)));
  }
  options.sort((a, b) => a.length - b.length);
  if (options.some(group => !group.length))
    return { suggestions: [], excluded, limited: false };

  const suggestions = [];
  const compare = (a, b) => {
    for (const key of rank) {
      const difference = a.metrics[key] - b.metrics[key];
      if (difference) return key === "late" ? -difference : difference;
    }
    return compareText(a.key, b.key);
  };

  const chosen = [];
  const ids = new Set(fixed.map(courseIdentity));
  let steps = 0, limited = false;

  async function search(depth) {
    if (depth === options.length) {
      const courses = [...fixed, ...chosen.flatMap(option => option.courses)];
      const key = sectionKey(courses);
      if (suggestions.some(plan => plan.key === key)) return;
      const candidate = { key, courses, metrics: measure(occupied) };
      const worst = suggestions.at(-1);
      if (suggestions.length < RESULT_COUNT || compare(candidate, worst) < 0) {
        suggestions.push(candidate);
        suggestions.sort(compare);
        if (suggestions.length > RESULT_COUNT) suggestions.pop();
      }
      return;
    }
    for (const option of options[depth]) {
      if (steps >= MAX_SEARCH_STEPS) {
        limited = true;
        return;
      }
      if (++steps % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      const optionIds = option.courses.map(courseIdentity);
      if (optionIds.some(id => ids.has(id)) || new Set(optionIds).size !== optionIds.length) continue;
      const removeDays = addDays(occupied, option.days);
      if (!removeDays) continue;
      optionIds.forEach(id => ids.add(id));
      chosen.push(option);
      await search(depth + 1);
      chosen.pop();
      optionIds.forEach(id => ids.delete(id));
      removeDays();
      if (limited) return;
    }
  }

  signal?.throwIfAborted();
  await search(0);
  return { suggestions, excluded, limited };
}
