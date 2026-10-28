// Canonical, date-only meeting model. Dates stay ISO strings; UTC is used only
// for calendar arithmetic, never to interpret a local calendar day.
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WORKDAY_TIME_ZONE = "America/Vancouver";
const DAY_MS = 86400000;
const zoneFormatters = new Map();
const instantCache = new Map();

export function dateNumber(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return null;
  const n = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new Date(n).toISOString().slice(0, 10) === value ? n / DAY_MS : null;
}
export const dateString = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export function parseLocalDate(value) {
  if (dateNumber(value) === null) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const courseIdentity = (c) =>
  String(c?.workdayCourseId || [c?.code, c?.section_number].join("|"))
    .trim()
    .toLowerCase();

// Four independently seeded lanes keep identifiers stable across builds/restarts.
export function stableId(value) {
  return [2166136261, 2246822519, 3266489917, 668265263]
    .map((seed) => {
      let h = seed;
      for (const ch of String(value)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
      return (h >>> 0).toString(16).padStart(8, "0");
    })
    .join("");
}

function timeMinutes(h, m, period) {
  h = Number(h);
  m = Number(m);
  if (h < 1 || h > 12 || m < 0 || m > 59) return null;
  return ((h % 12) + (period.toLowerCase() === "p" ? 12 : 0)) * 60 + m;
}

export function normalizeMeeting(course, line, index = 0) {
  const raw = String(line || "");
  const fail = (code, message) => ({
    meeting: null,
    diagnostic: {
      courseId: courseIdentity(course),
      lineIndex: index,
      code,
      message,
    },
  });
  const range = raw.match(/(\d{4}-\d{2}-\d{2})\s*[-–—]\s*(\d{4}-\d{2}-\d{2})/);
  const times = raw.match(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i);
  const days = [...new Set(raw.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g) || [])].sort(
    (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b),
  );
  if (!range || !times || !days.length)
    return fail("unknown", "Meeting dates, days or times are missing or unsupported.");
  const start = dateNumber(range[1]),
    end = dateNumber(range[2]);
  const startMinutes = timeMinutes(times[1], times[2], times[3]);
  const endMinutes = timeMinutes(times[4], times[5], times[6]);
  if (
    start === null ||
    end === null ||
    end < start ||
    end - start > 730 ||
    startMinutes === null ||
    endMinutes === null ||
    endMinutes <= startMinutes
  ) {
    return fail("invalid", "Invalid date range or time interval; this meeting was excluded.");
  }
  const alternate = /alternate\s+weeks|every\s+(?:other|2)\s+week/i.test(raw);
  // An interval start is not necessarily the first teaching week. Only explicit
  // Workday metadata or an explicit first-meeting label supplies a reliable anchor.
  const anchor = course?.meetingAnchors?.[index] || raw.match(/first\s+meeting\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
  if (
    alternate &&
    (dateNumber(anchor) === null ||
      anchor < range[1] ||
      anchor > range[2] ||
      !days.includes(DAYS[(new Date(dateNumber(anchor) * DAY_MS).getUTCDay() + 6) % 7]))
  ) {
    return fail("uncertain-recurrence", "Alternating weeks have no reliable first-meeting date.");
  }
  const exceptions = (course?.meetingExceptions?.[index] || []).filter((d) => dateNumber(d) !== null);
  const parts = raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  const location = parts
    .filter((p) => !/\d{4}-\d{2}-\d{2}|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|\d{1,2}:\d{2}\s*[ap]/i.test(p))
    .join(" | ");
  const identity = [
    courseIdentity(course),
    range[1],
    range[2],
    days,
    startMinutes,
    endMinutes,
    alternate ? anchor : "weekly",
  ].join("|");
  const meeting = {
    id: stableId(identity),
    courseId: courseIdentity(course),
    course,
    startDate: range[1],
    endDate: range[2],
    startMinutes,
    endMinutes,
    days,
    interval: alternate ? 2 : 1,
    anchor: alternate ? anchor : range[1],
    exceptions,
    location,
    timeZone: WORKDAY_TIME_ZONE,
  };
  meeting.dates = meetingDates(meeting);
  if (!meeting.dates.length) return fail("no-occurrences", "No active meeting dates in the supplied range.");
  try {
    for (const date of meeting.dates) {
      zonedInstant(date, startMinutes, meeting.timeZone);
      zonedInstant(date, endMinutes, meeting.timeZone);
    }
  } catch {
    return fail("uncertain-timezone", "A meeting falls at an invalid or ambiguous daylight-saving time.");
  }
  return { meeting, diagnostic: null };
}

export function meetingDates(m) {
  const dates = [];
  const start = dateNumber(m.startDate),
    end = dateNumber(m.endDate);
  const anchor = dateNumber(m.anchor);
  // Monday-based weeks, anchored to Workday's explicit first meeting.
  const anchorMonday = anchor - ((new Date(anchor * DAY_MS).getUTCDay() + 6) % 7);
  for (let n = start; n <= end; n++) {
    const dayIndex = (new Date(n * DAY_MS).getUTCDay() + 6) % 7;
    const date = dateString(n);
    if (
      m.days.includes(DAYS[dayIndex]) &&
      !m.exceptions.includes(date) &&
      (m.interval === 1 || (n >= anchor && Math.floor((n - anchorMonday) / 7) % m.interval === 0))
    )
      dates.push(date);
  }
  return dates;
}

export function normalizeSchedule(courses = []) {
  const meetings = [],
    diagnostics = [],
    unknownCourses = [],
    seen = new Set();
  for (const course of courses) {
    const lines = Array.isArray(course?.meetingLines) ? course.meetingLines : [];
    let unknown = !lines.length;
    lines.forEach((line, index) => {
      const result = normalizeMeeting(course, line, index);
      if (result.diagnostic) {
        diagnostics.push(result.diagnostic);
        unknown = true;
      } else if (!seen.has(result.meeting.id)) {
        seen.add(result.meeting.id);
        meetings.push(result.meeting);
      }
    });
    if (!lines.length)
      diagnostics.push({ courseId: courseIdentity(course), code: "unknown", message: "No meeting times supplied." });
    if (unknown) unknownCourses.push(course);
  }
  return { meetings, diagnostics, unknownCourses };
}

export function courseDateRange(course) {
  const ranges = (course?.meetingLines || [])
    .flatMap((line) => [...String(line).matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((m) => m[0]))
    .filter((d) => dateNumber(d) !== null)
    .sort();
  return { startDate: ranges[0] || "", endDate: ranges.at(-1) || "" };
}

export function meetingsOverlap(a, b) {
  if (a.startMinutes >= b.endMinutes || b.startMinutes >= a.endMinutes) return false;
  const dates = new Set(a.dates);
  return b.dates.some((d) => dates.has(d));
}

// Convert wall-clock time in the meeting's zone, independent of the viewer's OS.
export function zonedInstant(date, minutes, timeZone = WORKDAY_TIME_ZONE) {
  const cacheKey = `${date}|${minutes}|${timeZone}`;
  if (instantCache.has(cacheKey)) return new Date(instantCache.get(cacheKey));
  const [y, mo, d] = date.split("-").map(Number);
  const target = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
  if (!zoneFormatters.has(timeZone))
    zoneFormatters.set(
      timeZone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }),
    );
  const fmt = zoneFormatters.get(timeZone);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    const delta = target - represented;
    if (!delta) {
      if (
        [-3600000, 3600000].some((offset) => fmt.format(new Date(instant + offset)) === fmt.format(new Date(instant)))
      )
        throw new Error("Ambiguous daylight-saving time.");
      if (instantCache.size >= 10000) instantCache.delete(instantCache.keys().next().value);
      instantCache.set(cacheKey, instant);
      return new Date(instant);
    }
    instant += delta;
  }
  throw new Error("Meeting time is ambiguous or invalid in its time zone.");
}
export const utcStamp = (date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
