import { debugFor, debugLog } from "../utilities/debugTool.js";
import { parseSectionLinkString } from "../extraction/parsers/sectionLinkInfo.js";

const debug = debugFor("gradesApiCall");
debugLog({ local: { gradesApiCall: true } });

// Base endpoint for grade lookups.
// Example output: when version="v3", campus="UBCV", yearsession="2024W",
// subject="CPSC", course="110" -> "https://ubcgrades.com/api/v3/grades/UBCV/2024W/CPSC/110"
const API_BASE = "https://ubcgrades.com/api";
const DEFAULT_API_VERSION = "v3";

// Input: page text containing "2024-25 Winter Term 1 (UBC-V)"
// Output: captures year, season, and campus code for parsing.
const TERM_CAMPUS_RE = /(\d{4})-\d{2}\s+(Winter|Summer)\s+Term\s+\d+\s+\((UBC-[VO])\)/i;

// Input: "CPSC 110" or "BIOL_ 200"
// Output: subject="CPSC"/"BIOL_", course="110"/"200"
const SUBJECT_COURSE_RE = /^\s*([A-Z][A-Z0-9_]{1,8})\s*(\d{3}[A-Z]?)\s*$/;

// In-memory cache for API responses to avoid repeated network calls.
// Example key: "v3|UBCV|2024W|CPSC|110|101"
const responseCache = new Map();

// Input: "BIOL_V" -> Output: "BIOL"
const normalizeSubject = (raw) => String(raw || "").replace(/_[VO]$/i, "");

// Input: " 101 " -> Output: "101", Input: "L1A" -> Output: "L1A"
const normalizeSection = (raw) => {
  const str = String(raw || "")
    .trim()
    .toUpperCase();
  if (!str) return "";
  return str.length > 3 ? str.slice(0, 3) : str;
};

// Input: { version:"v3", campus:"UBCV", yearsession:"2024W", subject:"CPSC", course:"110", section:"101" }
// Output: "https://ubcgrades.com/api/v3/grades/UBCV/2024W/CPSC/110/101"
const buildGradesUrl = ({ version, campus, yearsession, subject, course, section }) => {
  const base = `${API_BASE}/${version}/grades/${campus}/${yearsession}/${subject}/${course}`;
  return section ? `${base}/${section}` : base;
};

// Input: { version:"v3", campus:"UBCV" }
// Output: "https://ubcgrades.com/api/v3/yearsessions/UBCV/"
const buildYearsessionsUrl = ({ version, campus }) =>
  `${API_BASE}/${version}/yearsessions/${campus}/`;

// Input: ("v3","UBCV","2024W","CPSC","110","101")
// Output: "v3|UBCV|2024W|CPSC|110|101"
const cacheKey = (version, campus, yearsession, subject, course, section) =>
  [version, campus, yearsession, subject, course, section].filter(Boolean).join("|");

// Input: url string, optional AbortSignal.
// Output: parsed JSON object or throws on non-2xx.
// Example output: { average: 74.3, ... }
async function fetchJson(url, { signal } = {}) {
  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    const message = `UBCGrades request failed (${resp.status})`;
    const error = new Error(message);
    error.status = resp.status;
    error.url = url;
    throw error;
  }
  return resp.json();
}

// Input: { campus:"UBCV", version? }, optional { signal, useCache }
// Output: yearsession list response, e.g. ["2024W","2024S",...]
async function fetchYearsessions(
  { campus, version = DEFAULT_API_VERSION },
  { signal, useCache = true } = {},
) {
  if (!campus) return null;
  const cacheId = cacheKey(version, "yearsessions", campus);
  if (useCache && responseCache.has(cacheId)) return responseCache.get(cacheId);

  const url = buildYearsessionsUrl({ version, campus });
  debug.log({ id: "fetchYearsessions.request" }, "UBCGrades yearsessions request:", { campus }, url);

  const data = await fetchJson(url, { signal });
  debug.log({ id: "fetchYearsessions.response" }, "UBCGrades yearsessions response:", { campus }, data);

  if (useCache) responseCache.set(cacheId, data);
  return data;
}

// Input: API response list or { yearsessions: [...] }
// Output: ["2024W","2024S"]
function normalizeYearsessionsList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean).map(String);
  if (Array.isArray(data?.yearsessions)) return data.yearsessions.filter(Boolean).map(String);
  return [];
}

// Input: requested="2024W", available=["2023W","2024S"]
// Output: "2024S" (closest available prior/near match)
function resolveFallbackYearsession(requested, available) {
  if (!requested || !available.length) return requested || null;
  if (available.includes(requested)) return requested;

  const normalize = (value) => String(value || "").toUpperCase();
  const req = normalize(requested);
  const reqYear = Number(req.slice(0, 4));
  const reqSeason = req.slice(4);

  const parsed = available
    .map((value) => {
      const v = normalize(value);
      return { value: v, year: Number(v.slice(0, 4)), season: v.slice(4) };
    })
    .filter((item) => Number.isFinite(item.year));

  parsed.sort((a, b) => (a.year - b.year) || a.season.localeCompare(b.season));

  const sameSeasonPrior = parsed.filter((item) => item.season === reqSeason && item.year <= reqYear);
  if (sameSeasonPrior.length) return sameSeasonPrior[sameSeasonPrior.length - 1].value;

  return parsed.length ? parsed[parsed.length - 1].value : requested;
}

// Input: requested="2024W", minYear=2022
// Output: ["2024W","2023W","2022W"]
function buildYearsessionFallbacks(requested, minYear = 2020) {
  const req = String(requested || "").toUpperCase();
  const year = Number(req.slice(0, 4));
  const season = req.slice(4) || "W";
  if (!Number.isFinite(year)) return [];

  const out = [];
  for (let y = year; y >= minYear; y -= 1) {
    out.push(`${y}${season}`);
  }
  return out;
}

// Input: requested="2024W", available=["2022W","2024S","2023W"]
// Output: ["2023W","2022W","2024S"] (same season first, recent to older)
function buildAvailableYearsessionCandidates(requested, available) {
  if (!available.length) return [];

  const normalize = (value) => String(value || "").toUpperCase();
  const req = normalize(requested);
  const reqYear = Number(req.slice(0, 4));
  const reqSeason = req.slice(4);

  const parsed = available
    .map((value) => {
      const v = normalize(value);
      return { value: v, year: Number(v.slice(0, 4)), season: v.slice(4) };
    })
    .filter((item) => Number.isFinite(item.year));

  const sameSeason = parsed
    .filter((item) => item.season === reqSeason && item.year <= reqYear)
    .sort((a, b) => b.year - a.year)
    .map((item) => item.value);

  const remaining = parsed
    .filter((item) => !sameSeason.includes(item.value))
    .sort((a, b) => (b.year - a.year) || a.season.localeCompare(b.season))
    .map((item) => item.value);

  return [...sameSeason, ...remaining];
}

// Input: "CPSC 110"
// Output: { subject:"CPSC", course:"110" }
export function parseCourseCode(code) {
  const str = String(code || "")
    .trim()
    .toUpperCase();
  const match = str.match(SUBJECT_COURSE_RE);
  if (!match) return null;

  const subject = normalizeSubject(match[1]);
  const course = match[2];

  return { subject, course };
}

// Input: "CPSC 110 101 - Intro to CS"
// Output: { subject:"CPSC", course:"110", section:"101", title:"Intro to CS", full:"..." }
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

// Input: page text containing "2024-25 Winter Term 1 (UBC-V)"
// Output: { campus:"UBCV", yearsession:"2024W" }
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

// Input: none (uses document.body.innerText)
// Output: { campus:"UBCV", yearsession:"2024W" } or null
export function readTermCampus() {
  const text = document?.body?.innerText || "";
  return readTermCampusFromText(text);
}

// Input: { onCourse: ({ subject, course, section, title, full }) => void }
// Output: cleanup function to remove the listener.
// Example output: onCourse({ subject:"CPSC", course:"110", section:"101", title:"Intro to CS" })
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

// Input: { campus:"UBCV", yearsession:"2024W", subject:"CPSC", course:"110", section:"101" }
// Output: API JSON for the section, or null if inputs missing.
// Example output: { average: 74.3, ... }
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

  debug.log(
    { id: "fetchSectionGrades.request" },
    "UBCGrades request:",
    { version, campus, yearsession, subject, course, section: sectionValue },
    url,
  );

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

// Input: { campus:"UBCV", yearsession:"2024W", subject:"CPSC", course:"110" }
// Output: API JSON for the course, or null if inputs missing.
// Example output: { average: 73.8, ... }
export async function fetchCourseGrades(
  { campus, yearsession, subject, course, version = DEFAULT_API_VERSION },
  { signal, useCache = true } = {},
) {
  if (!campus || !yearsession || !subject || !course) return null;

  const cacheId = cacheKey(version, campus, yearsession, subject, course);
  if (useCache && responseCache.has(cacheId)) return responseCache.get(cacheId);

  const url = buildGradesUrl({
    version,
    campus,
    yearsession,
    subject,
    course,
  });

  debug.log(
    { id: "fetchCourseGrades.request" },
    "UBCGrades course request:",
    { version, campus, yearsession, subject, course },
    url,
  );

  const data = await fetchJson(url, { signal });
  debug.log(
    { id: "fetchCourseGrades.response" },
    "UBCGrades course response:",
    { version, campus, yearsession, subject, course },
    data,
  );
  if (useCache) responseCache.set(cacheId, data);
  return data;
}

// Input: { campus, yearsession, subject, course, section }, optional { signal, useCache, isValid }
// Output: first valid course-level JSON from fallback yearsessions, or null.
// Example output: { average: 73.8, ... }
export async function fetchSectionGradesWithFallback(
  { campus, yearsession, subject, course, section },
  { signal, useCache = true, isValid } = {},
) {
  let resolvedYearsession = yearsession;
  let yearsessionCandidates = [];
  try {
    const list = await fetchYearsessions({ campus }, { signal, useCache });
    const available = normalizeYearsessionsList(list);
    resolvedYearsession = resolveFallbackYearsession(yearsession, available);
    yearsessionCandidates = buildAvailableYearsessionCandidates(resolvedYearsession, available);
  } catch (error) {
    debug.warn(
      { id: "fetchSectionGradesWithFallback.yearsessionLookupFailed" },
      "yearsession lookup failed; continuing with requested",
      { error: String(error), campus, yearsession },
    );
  }

  if (!yearsessionCandidates.length) {
    yearsessionCandidates = [resolvedYearsession, ...buildYearsessionFallbacks(resolvedYearsession, 2020)].filter(
      Boolean,
    );
  }

  if (section) {
    debug.log(
      { id: "fetchSectionGradesWithFallback.sectionIgnored" },
      "section provided; using course-level endpoint only",
      { campus, yearsession, subject, course, section },
    );
  }

  const seen = new Set();
  for (const candidate of yearsessionCandidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);

    if (candidate !== yearsession) {
      debug.warn(
        { id: "fetchSectionGradesWithFallback.yearsessionFallback" },
        "trying fallback yearsession",
        { campus, requested: yearsession, candidate },
      );
    }

    try {
      const data = await fetchCourseGrades(
        { campus, yearsession: candidate, subject, course, version: DEFAULT_API_VERSION },
        { signal, useCache },
      );
      if (typeof isValid !== "function" || isValid(data)) return data;
      debug.warn(
        { id: "fetchSectionGradesWithFallback.invalidData" },
        "course-level v3 returned invalid data; trying next yearsession",
        { campus, yearsession: candidate, subject, course },
      );
    } catch (error) {
      if (error?.status !== 404) throw error;
    }
  }

  return null;
}
