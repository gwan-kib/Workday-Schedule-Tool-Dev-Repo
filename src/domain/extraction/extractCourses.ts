import { $$ } from "../../lib/dom";
import { debugFor } from "../../lib/debug";
import type { CourseData, SchedulePickerOption } from "../../lib/types";
import { buildHeaderMaps, findWorkdayGrids, type WorkdayGridMatch } from "./grid";
import {
  extractMeetingLines,
  extractStartDate,
  formatMeetingLineForPanel,
  isOnlineDelivery,
  normalizeMeetingPatternsText,
} from "./parsers/meetingPatternsInfo";
import { parseSectionLinkString } from "./parsers/sectionLinkInfo";
import { createRowCellReader } from "./rowCellReader";

const debug = debugFor("courseExtraction");

function extractCoursesFromGrid(found: WorkdayGridMatch | null): CourseData[] {
  if (!found) return [];

  const headerMaps = buildHeaderMaps(found.root);
  const courses: CourseData[] = [];

  for (const row of found.rows) {
    const course = extractFromRow(row, headerMaps);
    if (course && (course.code || course.title) && Object.values(course).join("").trim()) {
      courses.push(course);
    }
  }

  return removeDuplicateCourses(courses);
}

function summarizeCourseNames(courses: CourseData[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const course of courses) {
    const label = course.code.trim();
    if (!label) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(label);
  }

  return names;
}

export async function extractCoursesData({
  selectSchedule,
}: {
  selectSchedule?: (options: SchedulePickerOption[]) => Promise<string | null>;
} = {}): Promise<CourseData[] | null> {
  const candidates = findWorkdayGrids()
    .map((grid, index) => {
      const courses = extractCoursesFromGrid(grid);
      if (!courses.length) return null;

      return {
        id: `schedule-${index + 1}`,
        title: `Schedule ${index + 1}`,
        courses,
        courseNames: summarizeCourseNames(courses),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  if (!candidates.length) return [];
  if (candidates.length === 1 || typeof selectSchedule !== "function") return candidates[0].courses;

  const selectedId = await selectSchedule(
    candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      courseNames: candidate.courseNames,
      courseCount: candidate.courses.length,
    })),
  );

  if (!selectedId) return null;
  return candidates.find((candidate) => candidate.id === selectedId)?.courses ?? null;
}

function removeDuplicateCourses(allCourses: CourseData[]): CourseData[] {
  const seen = new Set<string>();
  const uniqueCourses: CourseData[] = [];

  for (const course of allCourses) {
    const key = [course.code, course.title, course.section_number].join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCourses.push(course);
  }

  return uniqueCourses;
}

export function extractFromRow(
  row: Element,
  headerMaps: ReturnType<typeof buildHeaderMaps>,
): CourseData | null {
  const { getCellByHeader, readCellTextByHeader } = createRowCellReader(row, headerMaps);
  const allLinksInRow = $$(row, '[data-automation-id="promptOption"]');

  const sectionLinkEl = allLinksInRow.find((el) => {
    const text =
      el.getAttribute("data-automation-label") ||
      el.getAttribute("title") ||
      el.getAttribute("aria-label") ||
      el.textContent ||
      "";
    return /^[A-Z][A-Z0-9_]*\s*\d{2,3}-/.test(text);
  });

  const sectionLinkText =
    (sectionLinkEl &&
      (sectionLinkEl.getAttribute("data-automation-label") ||
        sectionLinkEl.getAttribute("title") ||
        sectionLinkEl.getAttribute("aria-label") ||
        sectionLinkEl.textContent)) ||
    "";

  const sectionDetails = parseSectionLinkString(sectionLinkText);
  if (!sectionDetails) return null;

  const instructionalFormatText = readCellTextByHeader("instructionalFormat");
  const startDateText = readCellTextByHeader("startDate");

  const labLike = (value: string) => /\b(laboratory)\b/i.test(value);
  const seminarLike = (value: string) => /\bseminar\b/i.test(value);
  const discussionLike = (value: string) => /\bdiscussion\b/i.test(value);

  const isLab = labLike(instructionalFormatText);
  const isSeminar = seminarLike(instructionalFormatText);
  const isDiscussion = discussionLike(instructionalFormatText);

  const getInstructionalFormatAbbr = (text: string) => {
    if (labLike(text)) return "Lab";
    if (seminarLike(text)) return "Seminar";
    if (discussionLike(text)) return "Discussion";
    return text.trim();
  };

  let instructor = "N/A";
  if (!isLab && !isSeminar && !isDiscussion) {
    instructor = readCellTextByHeader("instructor");
    if (!instructor) return null;
  }

  const meetingEl = getCellByHeader("meeting");
  if (!meetingEl) return null;

  const meetingLines = extractMeetingLines(meetingEl);
  if (!meetingLines.length) return null;

  const meetingObj = formatMeetingLineForPanel(meetingLines[0]);
  const deliveryModeEl = getCellByHeader("deliveryMode");
  const online = isOnlineDelivery(deliveryModeEl);

  if (online) meetingObj.location = "Online";

  let meeting = [meetingObj.days, meetingObj.time].filter(Boolean).join(" | ");
  meeting += `\n${meetingObj.location || (online ? "Online" : "")}`;

  const startDate = extractStartDate(meetingLines[0]) || extractStartDate(startDateText);

  const result: CourseData = {
    code: sectionDetails.code,
    title: sectionDetails.title,
    section_number: sectionDetails.section_number,
    instructor,
    meeting: normalizeMeetingPatternsText(meeting),
    instructionalFormat: getInstructionalFormatAbbr(instructionalFormatText),
    startDate,
    meetingLines,
    isLab,
    isSeminar,
    isDiscussion,
  };

  debug.log({ id: "courseExtraction.extractFromRow" }, "Extracted course from row", result);
  return result;
}
