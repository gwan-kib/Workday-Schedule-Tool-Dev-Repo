import type { CourseData } from "../../lib/types";

const DAY_CODES: Record<string, string> = {
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
  Sun: "SU",
};

const DATE_RANGE_REGEX = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const TIME_RANGE_REGEX = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*-\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i;
const DAYS_REGEX = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g;

function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function escapeIcsText(value: string): string {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldIcsLine(line: string): string {
  const max = 75;
  if (!line || line.length <= max) return line;

  let output = "";
  let index = 0;

  while (index < line.length) {
    const chunk = line.slice(index, index + max);
    output += chunk;
    index += max;
    if (index < line.length) output += "\r\n ";
  }

  return output;
}

function buildPropLine(name: string, value: string): string {
  return foldIcsLine(`${name}:${escapeIcsText(value)}`);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function formatDateTime(date: Date): string {
  return `${formatDate(date)}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function formatDateTimeUtc(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(
    date.getUTCMinutes(),
  )}${pad(date.getUTCSeconds())}Z`;
}

function parseTime(hoursToken: string, minutesToken: string, periodToken: string) {
  let hours = Number.parseInt(hoursToken, 10);
  const minutes = Number.parseInt(minutesToken, 10);
  const period = periodToken.toLowerCase();

  if (period === "p" && hours !== 12) hours += 12;
  if (period === "a" && hours === 12) hours = 0;

  return { hours, minutes };
}

function parseMeetingLine(line: string) {
  const dateMatch = String(line || "").match(DATE_RANGE_REGEX);
  const timeMatch = String(line || "").match(TIME_RANGE_REGEX);
  const days = String(line || "").match(DAYS_REGEX) || [];

  if (!dateMatch || !timeMatch || !days.length) return null;

  return {
    startDate: dateMatch[1],
    endDate: dateMatch[2],
    days: [...new Set(days.map((day) => DAY_CODES[day]).filter(Boolean))],
    startTime: parseTime(timeMatch[1], timeMatch[2], timeMatch[3]),
    endTime: parseTime(timeMatch[4], timeMatch[5], timeMatch[6]),
  };
}

function extractLocation(line: string): string {
  const parts = String(line || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.find((part) => /\([A-Z]{2,}\)/.test(part)) || parts.find((part) => /online/i.test(part)) || "";
}

function extractBuildingFloorRoom(line: string) {
  const raw = String(line || "");
  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const building = parts.find((part) => /\([A-Z]{2,}\)/.test(part)) || "";

  const floorMatch = raw.match(/\bfloor\b\s*[:-]?\s*(-?[A-Za-z0-9]+)/i);
  const roomMatch = raw.match(/\b(room|rm)\b\s*[:-]?\s*([A-Za-z0-9]+)/i);

  return {
    building,
    floor: floorMatch?.[1] || "",
    room: roomMatch?.[2] || "",
  };
}

function findFirstValidDate(startDate: string, dayCodes: string[]): Date {
  const start = new Date(`${startDate}T00:00:00`);

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const code = Object.values(DAY_CODES)[date.getDay() === 0 ? 6 : date.getDay() - 1];
    if (dayCodes.includes(code)) return date;
  }

  return start;
}

function buildClassEvent(course: CourseData, line: string) {
  const parsed = parseMeetingLine(line);
  if (!parsed) return null;

  const firstDate = findFirstValidDate(parsed.startDate, parsed.days);
  const startDate = new Date(firstDate);
  startDate.setHours(parsed.startTime.hours, parsed.startTime.minutes, 0, 0);

  const endDate = new Date(firstDate);
  endDate.setHours(parsed.endTime.hours, parsed.endTime.minutes, 0, 0);

  const { building, floor, room } = extractBuildingFloorRoom(line);
  const summary = [course.code, course.title].filter(Boolean).join(" - ") || "Scheduled Course";
  const description = [
    course.section_number ? `Section: ${course.section_number}` : null,
    course.instructor ? `Instructor: ${course.instructor}` : null,
    course.instructionalFormat ? `Format: ${course.instructionalFormat}` : null,
    building ? `Building: ${building}` : null,
    floor ? `Floor: ${floor}` : null,
    room ? `Room: ${room}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const untilLocal = new Date(`${parsed.endDate}T23:59:59`);

  return {
    uid: `${course.code || "course"}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    summary,
    description,
    location: extractLocation(line),
    dtstart: formatDateTime(startDate),
    dtend: formatDateTime(endDate),
    rrule: `FREQ=WEEKLY;BYDAY=${parsed.days.join(",")};UNTIL=${formatDateTimeUtc(untilLocal)}`,
  };
}

export function buildIcsFile(courses: CourseData[]): string {
  const events = courses.flatMap((course) =>
    (course.meetingLines || []).map((line) => buildClassEvent(course, line)).filter(Boolean),
  );
  const timezone = getLocalTimeZone();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Workday Extension//Schedule Export//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${timezone}`,
  ];

  events.forEach((event) => {
    if (!event) return;
    lines.push("BEGIN:VEVENT");
    lines.push(buildPropLine("UID", event.uid));
    lines.push(buildPropLine("SUMMARY", event.summary));
    if (event.description) lines.push(buildPropLine("DESCRIPTION", event.description));
    if (event.location) lines.push(buildPropLine("LOCATION", event.location));
    lines.push(foldIcsLine(`DTSTART;TZID=${timezone}:${event.dtstart}`));
    lines.push(foldIcsLine(`DTEND;TZID=${timezone}:${event.dtend}`));
    lines.push(foldIcsLine(`RRULE:${event.rrule}`));
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function exportCoursesAsIcs(courses: CourseData[], scheduleName: string | null): void {
  const ics = buildIcsFile(courses);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = scheduleName
    ? `${`[WST] ${scheduleName}`.replace(/[\\/:*?"<>|]/g, "-")}.ics`
    : "[WST] Schedule.ics";

  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 100);
}
