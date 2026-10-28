import { DAYS, normalizeSchedule } from "./meetings.js";
import { COURSE_COLOR_COUNT } from "../mainPanel/settings/courseColorSettings.js";

export function scheduleLayout(courses, rangeKey = "all") {
  const normalized = normalizeSchedule(courses);
  const windows = [...new Set(normalized.meetings.map((m) => `${m.startDate}/${m.endDate}`))].sort();
  const selected = windows.includes(rangeKey) ? rangeKey : "all";
  const meetings = normalized.meetings.filter((m) => selected === "all" || `${m.startDate}/${m.endDate}` === selected);
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
        dates: meeting.dates.filter((d) => DAYS[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7] === day),
        rowStart: (meeting.startMinutes - start) / 30,
        rowSpan: (meeting.endMinutes - meeting.startMinutes) / 30,
        startIdx: (meeting.startMinutes - start) / 30,
        endIdx: (meeting.endMinutes - start) / 30,
      });
    }
  });
  return { ...normalized, meetings, windows, selected, days, slots, eventsByDay };
}
