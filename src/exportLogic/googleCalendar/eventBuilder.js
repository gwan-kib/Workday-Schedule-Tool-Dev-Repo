import { normalizeSchedule, zonedInstant, utcStamp } from "../../core/meetings.js";
const COLORS = { 1: "11", 2: "6", 3: "3", 4: "9", 5: "5", 6: "10", 7: "7", 8: "4" };

export function buildEventsForCourse(course) {
  return normalizeSchedule([course]).meetings.map((m) => {
    const event = {
      summary: [course.code, course.title, course.section_number].filter(Boolean).join(" - "),
      description: [course.instructor, course.instructionalFormat].filter(Boolean).join("\n"),
      location: m.location,
      start: { dateTime: zonedInstant(m.dates[0], m.startMinutes, m.timeZone).toISOString(), timeZone: m.timeZone },
      end: { dateTime: zonedInstant(m.dates[0], m.endMinutes, m.timeZone).toISOString(), timeZone: m.timeZone },
      extendedProperties: { private: { wstSource: "workday-import", wstEvent: m.id } },
    };
    if (m.dates.length > 1)
      event.recurrence = [
        `RDATE:${m.dates.map((d) => utcStamp(zonedInstant(d, m.startMinutes, m.timeZone))).join(",")}`,
      ];
    if (COLORS[course.colorIndex]) event.colorId = COLORS[course.colorIndex];
    return event;
  });
}
