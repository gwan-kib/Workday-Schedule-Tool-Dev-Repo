import { DAYS, normalizeSchedule, dateNumber } from "./meetings.js";
import { COURSE_COLOR_COUNT } from "../mainPanel/settings/courseColorSettings.js";

// Anchor each separate meeting period to its first Monday-based teaching week.
// Overlapping ranges share an anchor so opposite-week sections stay opposite.
function meetingPeriods(meetings) {
  const periods = [];
  for (const meeting of [...meetings].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const start = dateNumber(meeting.startDate),
      end = dateNumber(meeting.endDate);
    const previous = periods.at(-1);
    if (previous && start <= previous.end) previous.end = Math.max(previous.end, end);
    else periods.push({ start, end, monday: start - ((new Date(start * 86400000).getUTCDay() + 6) % 7) });
  }
  return periods;
}

// week=0 is the full canonical view used by conflict summaries; 1/2 are display selectors.
export function scheduleLayout(courses, week = 0) {
  const normalized = normalizeSchedule(courses);
  const periods = meetingPeriods(normalized.meetings);
  const selectedWeek = week === 2 ? 2 : week === 1 ? 1 : 0;
  const meetings = normalized.meetings.flatMap((meeting) => {
    if (!selectedWeek || meeting.interval === 1) return [meeting];
    const period = periods.find(
      (p) => dateNumber(meeting.startDate) >= p.start && dateNumber(meeting.endDate) <= p.end,
    );
    const dates = meeting.dates.filter(
      (date) => Math.floor((dateNumber(date) - period.monday) / 7) % 2 === selectedWeek - 1,
    );
    return dates.length ? [{ ...meeting, dates }] : [];
  });
  const days = DAYS.filter((d, i) => i < 5 || meetings.some((m) => m.days.includes(d)));
  const start = Math.floor(Math.min(480, ...meetings.map((m) => m.startMinutes)) / 30) * 30;
  const end = Math.ceil(Math.max(1260, ...meetings.map((m) => m.endMinutes)) / 30) * 30;
  const slots = Array.from({ length: (end - start) / 30 + 1 }, (_, i) => start + i * 30);
  const eventsByDay = new Map(days.map((d) => [d, []]));
  meetings.forEach((meeting) => {
    const c = meeting.course;
    const eventType = c.isLab
      ? "lab"
      : c.isSeminar
        ? "seminar"
        : c.isDiscussion
          ? "discussion"
          : c.isExperiential || /experiential/i.test(c.instructionalFormat || "")
            ? "experiential"
            : "";
    const labels = { lab: "[LAB]", seminar: "[SEM]", discussion: "[DISC]", experiential: "[EXP]" };
    for (const day of meeting.days) {
      const dates = meeting.dates.filter((d) => DAYS[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7] === day);
      if (!dates.length) continue;
      eventsByDay.get(day)?.push({
        ...meeting,
        id: `${meeting.id}-${day}`,
        colorIndex:
          Number.isInteger(c.colorIndex) && c.colorIndex >= 1 && c.colorIndex <= COURSE_COLOR_COUNT
            ? c.colorIndex
            : (courses.indexOf(c) % COURSE_COLOR_COUNT) + 1,
        eventType,
        label: labels[eventType] || "",
        code: c.code || "",
        title: c.title || "",
        dates,
        rowStart: (meeting.startMinutes - start) / 30,
        rowSpan: (meeting.endMinutes - meeting.startMinutes) / 30,
        startIdx: (meeting.startMinutes - start) / 30,
        endIdx: (meeting.endMinutes - start) / 30,
      });
    }
  });
  return { ...normalized, meetings, selectedWeek, days, slots, eventsByDay };
}
