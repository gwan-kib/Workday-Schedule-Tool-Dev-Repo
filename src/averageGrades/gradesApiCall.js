import { debugFor } from "../utilities/debugTool.js";
import { parseSectionLinkString } from "../extraction/parsers/sectionLinkInfo.js";

const debug = debugFor("gradesApiCall");

const API_BASE = "https://ubcgrades.com/api";
const DEFAULT_API_VERSION = "v3";
const FALLBACK_API_VERSION = "v2";

const TERM_CAMPUS_RE =
  /^\s*(\d{4})-\d{2}\s+(Winter|Summer)\s+Term\s+\d+\s+\((UBC-[VO])\)\s*$/i;

const SUBJECT_COURSE_RE = /^\s*([A-Z][A-Z0-9_]{1,8})\s*(\d{3}[A-Z]?)\s*$/;

const responseCache = new Map();

const normalizeSubject = (raw) => String(raw || "").replace(/_[VO]$/i, "");

const normalizeSection = (raw) => {
  const str = String(raw || "").trim().toUpperCase();
  if (!str) return "";
  return str.length > 3 ? str.slice(0, 3) : str;
};

const buildGradesUrl = ({ version, campus, yearsession, subject, course, section }) => {
  const parts = [API_BASE, version, "grades", campus, yearsession, subject, course];
  if (section) parts.push(section);
  return parts.join("/");
};

const cacheKey = (version, campus, yearsession, subject, course, section) =>
  [version, campus, yearsession, subject, course, section].filter(Boolean).join("|");

async function fetchJson(url, { signal } = {}) {
  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    const message = `UBCGrades request failed (${resp.status})`;
    throw new Error(message);
  }
  return resp.json();
}

export function parseCourseCode(code) {
  const str = String(code || "").trim().toUpperCase();
  const match = str.match(SUBJECT_COURSE_RE);
  if (!match) return null;

  const subject = normalizeSubject(match[1]);
  const course = match[2];

  return { subject, course };
}

export function parseCourseInfoFromPromptText(promptText) {
  const parsed = parseSectionLinkString(promptText);
  if (!parsed) return null;

  const codeInfo = parseCourseCode(parsed.code);
  if (!codeInfo) return null;

  return {
    ...codeInfo,
    section: normalizeSection(parsed.section_number),
    title: parsed.title,
    full: parsed.full,
  };
}

export function readTermCampusFromText(text) {
  const m = String(text || "").match(TERM_CAMPUS_RE);
  if (!m) return null;

  const startYear = m[1];
  const season = m[2].toLowerCase();
  const campusRaw = m[3].toUpperCase();

  const yearsession = `${startYear}${season === "winter" ? "W" : "S"}`;
  const campus = campusRaw === "UBC-V" ? "UBCV" : "UBCO";

  return { campus, yearsession };
}

export function readTermCampus() {
  const text = document?.body?.innerText || "";
  return readTermCampusFromText(text);
}

export function attachCourseHoverListener({ onCourse }) {
  if (typeof onCourse !== "function") return () => {};

  const handler = (event) => {
    const el = event.target.closest('[data-automation-id="promptOption"]');
    if (!el) return;

    const str =
      el.getAttribute("data-automation-label") ||
      el.getAttribute("title") ||
      el.getAttribute("aria-label") ||
      el.textContent ||
      "";

    const courseInfo = parseCourseInfoFromPromptText(str);
    if (!courseInfo) return;

    onCourse(courseInfo);
  };

  document.addEventListener("mouseover", handler);
  return () => document.removeEventListener("mouseover", handler);
}

export async function fetchSectionGrades(
  { campus, yearsession, subject, course, section, version = DEFAULT_API_VERSION },
  { signal, useCache = true } = {},
) {
  if (!campus || !yearsession || !subject || !course) return null;

  const sectionValue = normalizeSection(section);
  const cacheId = cacheKey(version, campus, yearsession, subject, course, sectionValue);
  if (useCache && responseCache.has(cacheId)) return responseCache.get(cacheId);

  const url = buildGradesUrl({
    version,
    campus,
    yearsession,
    subject,
    course,
    section: sectionValue,
  });

  const data = await fetchJson(url, { signal });
  debug.log(
    { id: "fetchSectionGrades.response" },
    "UBCGrades response:",
    { version, campus, yearsession, subject, course, section: sectionValue },
    data,
  );
  if (useCache) responseCache.set(cacheId, data);
  return data;
}

export async function fetchSectionGradesWithFallback(
  { campus, yearsession, subject, course, section },
  { signal, useCache = true } = {},
) {
  try {
    return await fetchSectionGrades(
      { campus, yearsession, subject, course, section, version: DEFAULT_API_VERSION },
      { signal, useCache },
    );
  } catch (error) {
    debug.warn({ id: "fetchSectionGradesWithFallback" }, "v3 failed; trying v2", {
      error: String(error),
      campus,
      yearsession,
      subject,
      course,
      section,
    });

    return fetchSectionGrades(
      { campus, yearsession, subject, course, section, version: FALLBACK_API_VERSION },
      { signal, useCache },
    );
  }
}
