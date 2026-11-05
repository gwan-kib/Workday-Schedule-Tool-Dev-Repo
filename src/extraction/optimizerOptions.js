import { courseDateRange } from "../core/meetings.js";
import { trustedSectionLink } from "./trustedWorkday.js";
import { fetchCourseFromWorkdayLink } from "./singleCourseImport.js";

export const MAX_OPTIMIZER_GROUPS = 12;
const MAX_SECTION_LINKS = 60;
const codeKey = course => course.code.trim().replace(/\s+/g, " ").toUpperCase();
const formatKey = course => (course.instructionalFormat ||
  (course.isLab ? "Lab" : course.isSeminar ? "Seminar" : course.isDiscussion ? "Discussion" : "Lecture"))
  .trim().toLowerCase().replace(/^laboratory$/, "lab");

export async function loadOptimizerOptions(textGroups, draft, {
  fetchSection = fetchCourseFromWorkdayLink,
  signal,
} = {}) {
  if (!textGroups.length || textGroups.length > MAX_OPTIMIZER_GROUPS)
    throw new Error("Add between 1 and 12 required course groups.");
  const links = new Set();
  const groups = textGroups.map((text, groupIndex) => {
    const lines = text.trim().split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) throw new Error("Add a Workday Section link to group " + (groupIndex + 1) + ".");
    return lines.map((line, index) => {
      const option = line.trim().split(/\s+/).map(trustedSectionLink);
      if (option.some(link => !link) || new Set(option).size !== option.length)
        throw new Error("Check the Workday Section links in group " + (groupIndex + 1) + ", option " + (index + 1) + ".");
      option.forEach(link => links.add(link));
      return option;
    });
  });
  if (groups.flat(2).length > MAX_SECTION_LINKS)
    throw new Error("Use at most 60 section links per search.");

  const loaded = new Map(await Promise.all([...links].map(async link => {
    try {
      const course = await fetchSection(link, { signal });
      return [link, course?.code && course?.section_number ? course : null];
    } catch {
      return [link, null];
    }
  })));
  signal?.throwIfAborted();

  const replaced = new Set();
  const seenCodes = new Set();
  let unavailable = 0;
  const options = groups.map((group, groupIndex) => {
    const choices = group.map(option => option.map(link => loaded.get(link))).filter(option => {
      if (option.every(Boolean)) return true;
      unavailable++;
      return false;
    });
    const label = "Group " + (groupIndex + 1);
    if (!choices.length) throw new Error(label + " has no available options. Sign in and check its current Workday Section links.");

    const [first] = choices;
    const code = codeKey(first[0]);
    if (seenCodes.has(code)) throw new Error("Put all options for " + first[0].code + " in one group.");
    seenCodes.add(code);

    const formats = first.map(formatKey).sort();
    const range = courseDateRange({ meetingLines: first.flatMap(course => course.meetingLines || []) });
    const sameTerm = course => {
      const dates = courseDateRange(course);
      return !range.startDate || !dates.startDate ||
        (dates.startDate <= range.endDate && range.startDate <= dates.endDate);
    };
    for (const choice of choices) {
      const ranges = choice.map(courseDateRange).filter(dates => dates.startDate);
      const starts = ranges.map(dates => dates.startDate).sort();
      const ends = ranges.map(dates => dates.endDate).sort();
      const disjoint = starts.length > 1 && starts.at(-1) > ends[0];
      if (disjoint || choice.some(course => codeKey(course) !== code || !sameTerm(course)) ||
        JSON.stringify(choice.map(formatKey).sort()) !== JSON.stringify(formats)) {
        throw new Error(label + " must contain options for the same course, term and required components.");
      }
    }

    for (const course of draft) {
      if (codeKey(course) !== code || !sameTerm(course)) continue;
      if (!formats.includes(formatKey(course)))
        throw new Error(label + " must include the required components already in your draft for " + course.code + ".");
      replaced.add(course);
    }
    return choices;
  });
  return { groups: options, fixed: draft.filter(course => !replaced.has(course)), unavailable };
}
