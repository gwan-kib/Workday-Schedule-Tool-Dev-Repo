import { DAYS, dateNumber, dateString, normalizeSchedule } from "./meetings.js";

export const MAX_PERSONAL_BLOCKS = 50;
const clock = n => `${Math.floor(n / 60) % 12 || 12}:${String(n % 60).padStart(2, "0")} ${n >= 720 ? "p.m." : "a.m."}`;
function blockCourse(b) {
  const start = dateNumber(b.startDate);
  const first = Array.from({ length: 7 }, (_, i) => start + i)
    .find(n => b.days.includes(DAYS[(new Date(n * 86400000).getUTCDay() + 6) % 7]));
  return {
    code: b.title, title: b.category || "Personal block", section_number: "Personal",
    instructionalFormat: "Personal block", isPersonalBlock: true,
    personalBlockId: b.id, personalColor: b.color, workdayCourseId: `personal:${b.id}`,
    startDate: b.startDate, endDate: b.endDate,
    meetingLines: [`${b.startDate} - ${b.endDate} | ${b.days.join(" ")} | ${clock(b.startMinutes)} - ${clock(b.endMinutes)}${b.recurrence === "alternate" ? " alternate weeks" : ""}`],
    meetingExceptions: [b.exceptions],
    meetingAnchors: b.recurrence === "alternate" ? [dateString(first)] : [],
  };
}
export function validatePersonalBlocks(value = []) {
  if (!Array.isArray(value) || value.length > MAX_PERSONAL_BLOCKS)
    throw new Error("A schedule can contain up to 50 personal blocks.");
  const ids = new Set();
  const blocks = value.map(raw => {
    const fail = () => { throw new Error("Personal block: check the title, dates, days and start/end times."); };
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id || raw.id.length > 100 || ids.has(raw.id)) fail();
    ids.add(raw.id);
    if (typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 100) fail();
    if (!["once", "weekly", "alternate"].includes(raw.recurrence)) fail();
    const start = dateNumber(raw.startDate), end = dateNumber(raw.endDate);
    if (start === null || end === null || end < start || end - start > 730 || (raw.recurrence === "once" && start !== end)) fail();
    if (!Number.isInteger(raw.startMinutes) || !Number.isInteger(raw.endMinutes) || raw.startMinutes < 0 || raw.endMinutes > 1439 || raw.endMinutes <= raw.startMinutes) fail();
    if (!Array.isArray(raw.days) || !raw.days.length || raw.days.some(d => !DAYS.includes(d)) || new Set(raw.days).size !== raw.days.length) fail();
    const days = raw.recurrence === "once" ? [DAYS[(new Date(start * 86400000).getUTCDay() + 6) % 7]] : [...raw.days];
    const exceptions = raw.exceptions ?? [];
    if (!Array.isArray(exceptions) || exceptions.length > 100 || exceptions.some(d => dateNumber(d) === null || d < raw.startDate || d > raw.endDate)) fail();
    if (typeof (raw.category ?? "") !== "string" || (raw.category ?? "").length > 40) fail();
    if (!/^#[0-9a-f]{6}$/i.test(raw.color ?? "#64748b")) fail();
    return {
      id: raw.id, title: raw.title.trim(), category: (raw.category || "").trim(), color: raw.color || "#64748b",
      startDate: raw.startDate, endDate: raw.endDate, startMinutes: raw.startMinutes, endMinutes: raw.endMinutes,
      days, recurrence: raw.recurrence, exceptions: [...new Set(exceptions)],
    };
  });
  for (const b of blocks) {
    const normalized = normalizeSchedule([blockCourse(b)]);
    if (!normalized.meetings.length || normalized.diagnostics.length)
      throw new Error("This personal block has no valid occurrences, or falls at an ambiguous daylight-saving time. Adjust its dates or times.");
  }
  return blocks;
}
export const personalBlockCourses = (blocks = []) => validatePersonalBlocks(blocks).map(blockCourse);
// Shared by timetable and conflict consumers.
export const scheduleItems = (courses = [], blocks = []) => [...courses, ...personalBlockCourses(blocks)];
export function calendarExportItems(courses, blocks, includePersonal = false) {
  return includePersonal ? scheduleItems(courses, blocks) : [...courses];
}
