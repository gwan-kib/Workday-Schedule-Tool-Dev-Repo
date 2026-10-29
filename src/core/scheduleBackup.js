import { normalizeSchedule, dateNumber } from "./meetings.js";
import { trustedSectionLink } from "../extraction/trustedWorkday.js";
export const BACKUP_VERSION = 1;
export const BACKUP_SETTINGS = [
  "wdCourseColorAssignments",
  "wdHoverTooltipsEnabled",
  "wdTimeFormat",
];
const fail = (message) => {
  throw new Error(`Invalid backup: ${message}`);
};
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const string = (v, max = 1000) => typeof v === "string" && v.length <= max;
const textFields = [
  "code",
  "title",
  "section_number",
  "instructor",
  "meeting",
  "instructionalFormat",
  "workdayCourseId",
  "startDate",
  "endDate",
  "courseGroupKey",
  "deliveryMode",
];
const booleanFields = [
  "isLab",
  "isSeminar",
  "isDiscussion",
  "isExperiential",
  "isOnline",
];
export function cleanCourse(c) {
  if (
    !object(c) ||
    !string(c.code, 200) ||
    !c.code.trim() ||
    !string(c.section_number ?? "", 100)
  )
    fail("course code/section missing or too long.");
  const out = {};
  for (const k of textFields)
    if (c[k] != null) {
      if (!string(c[k], k === "meeting" ? 10000 : 2000)) fail(`course ${k}.`);
      out[k] = c[k];
    }
  for (const k of booleanFields)
    if (c[k] != null) {
      if (typeof c[k] !== "boolean") fail(`course ${k}.`);
      out[k] = c[k];
    }
  for (const k of ["colorIndex", "manualColorIndex", "courseIndex"])
    if (c[k] != null) {
      if (!Number.isInteger(c[k]) || c[k] < 1 || c[k] > 1000)
        fail("course color/index.");
      out[k] = c[k];
    }
  if (c.workdayCourseLink) {
    const link = trustedSectionLink(c.workdayCourseLink);
    if (!link) fail("untrusted Workday section link.");
    out.workdayCourseLink = link;
  }
  if (
    c.meetingLines != null &&
    (!Array.isArray(c.meetingLines) ||
      c.meetingLines.length > 100 ||
      c.meetingLines.some((x) => !string(x, 5000)))
  )
    fail("meeting lines.");
  out.meetingLines = [...(c.meetingLines || [])];
  for (const k of ["meetingAnchors", "meetingExceptions"])
    if (c[k] != null) {
      if (!Array.isArray(c[k]) || c[k].length > 100) fail(`${k}.`);
      out[k] = c[k].map((v) => {
        if (k === "meetingAnchors") {
          if (v != null && dateNumber(v) === null) fail("meeting anchor date.");
          return v;
        }
        if (
          !Array.isArray(v) ||
          v.length > 750 ||
          v.some((d) => dateNumber(d) === null)
        )
          fail("meeting exception dates.");
        return [...v];
      });
    }
  if (normalizeSchedule([out]).diagnostics.some((d) => d.code === "invalid"))
    fail("invalid meeting dates/times.");
  return out;
}
const colors = (v) =>
  Array.isArray(v) &&
  v.length === 8 &&
  v.every((n) => Number.isInteger(n) && n >= 1 && n <= 8);
export function cleanSettings(settings = {}) {
  if (!object(settings)) fail("settings must be an object.");
  const out = {};
  if (settings.wdCourseColorAssignments != null) {
    if (!colors(settings.wdCourseColorAssignments)) fail("color preferences.");
    out.wdCourseColorAssignments = [...settings.wdCourseColorAssignments];
  }
  if (settings.wdHoverTooltipsEnabled != null) {
    if (typeof settings.wdHoverTooltipsEnabled !== "boolean")
      fail("hover preference.");
    out.wdHoverTooltipsEnabled = settings.wdHoverTooltipsEnabled;
  }
  if (settings.wdTimeFormat != null) {
    if (!["24h", "am/pm"].includes(settings.wdTimeFormat)) fail("time format.");
    out.wdTimeFormat = settings.wdTimeFormat;
  }
  return out;
}
export function validateBackup(data) {
  if (!object(data) || data.format !== "ubc-workday-schedules")
    fail("file format not recognized.");
  if (data.version !== BACKUP_VERSION)
    fail(
      "unsupported version. Update the extension before restoring this file.",
    );
  if (!Array.isArray(data.schedules) || data.schedules.length > 10)
    fail("expected up to 10 schedules.");
  const ids = new Set(),
    names = new Set();
  let preferred = false;
  const schedules = data.schedules.map((s) => {
    if (
      !object(s) ||
      !string(s.id, 200) ||
      !s.id ||
      !string(s.name, 200) ||
      !s.name.trim() ||
      !Array.isArray(s.courses) ||
      s.courses.length > 200
    )
      fail("schedule metadata/courses.");
    const name = s.name.trim(),
      key = name.replace(/\s+/g, " ").toLowerCase();
    if (ids.has(s.id) || names.has(key))
      fail("duplicate schedule ID or name in file.");
    ids.add(s.id);
    names.add(key);
    if (s.colorAssignments != null && !colors(s.colorAssignments))
      fail("schedule colors.");
    if (s.isFavorite != null && typeof s.isFavorite !== "boolean")
      fail("preferred schedule flag.");
    if (s.isFavorite && preferred) fail("multiple preferred schedules.");
    preferred ||= s.isFavorite;
    return {
      id: s.id,
      name,
      savedAt:
        string(s.savedAt, 100) && Number.isFinite(Date.parse(s.savedAt))
          ? s.savedAt
          : new Date(0).toISOString(),
      courses: s.courses.map(cleanCourse),
      colorAssignments: s.colorAssignments ? [...s.colorAssignments] : null,
      isFavorite: Boolean(s.isFavorite),
    };
  });
  return {
    format: "ubc-workday-schedules",
    version: BACKUP_VERSION,
    schedules,
    settings: cleanSettings(data.settings),
  };
}
export function createBackup(schedules, settings) {
  return {
    ...validateBackup({
      format: "ubc-workday-schedules",
      version: BACKUP_VERSION,
      schedules,
      settings,
    }),
    exportedAt: new Date().toISOString(),
  };
}
export function parseBackup(text) {
  if (typeof text !== "string" || text.length > 5 * 1024 * 1024)
    fail("file exceeds 5 MB.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail("malformed JSON.");
  }
  return validateBackup(data);
}
export function planRestore(
  existing,
  backup,
  mode = "merge",
  idFactory = () => crypto.randomUUID(),
) {
  if (!["merge", "replace"].includes(mode)) fail("restore mode.");
  const incoming = validateBackup(backup);
  if (mode === "replace") return incoming;
  const schedules = structuredClone(existing),
    names = new Set(
      existing.map((s) => s.name.trim().replace(/\s+/g, " ").toLowerCase()),
    );
  const key = (n) => n.trim().replace(/\s+/g, " ").toLowerCase();
  for (const s of incoming.schedules) {
    if (
      existing.some(
        (old) =>
          old.id === s.id &&
          old.name === s.name &&
          JSON.stringify(old.courses.map(cleanCourse)) ===
            JSON.stringify(s.courses),
      )
    )
      continue;
    const copy = structuredClone(s);
    if (schedules.some((old) => old.id === copy.id)) copy.id = idFactory();
    let suffix = 2;
    while (names.has(key(copy.name)))
      copy.name = `${s.name} (imported ${suffix++})`;
    names.add(key(copy.name));
    copy.isFavorite =
      copy.isFavorite && !schedules.some((old) => old.isFavorite);
    schedules.push(copy);
  }
  if (schedules.length > 10)
    fail(
      "merge would exceed 10 saved schedules. Choose fewer plans or use Replace.",
    );
  // Existing settings win in Merge; the caller supplies missing keys only.
  return { ...incoming, schedules };
}
