import { debugFor } from "../../lib/debug";
import type { TermCampusInfo } from "../../lib/types";
import { parseSectionLinkString } from "../extraction/parsers/sectionLinkInfo";

const debug = debugFor("gradesApi");

const API_BASE = "https://ubcgrades.com/api";
const DEFAULT_API_VERSION = "v3";
const TERM_CAMPUS_RE = /(\d{4})-\d{2}\s+(Winter|Summer)\s+Term\s+\d+\s+\((UBC-[VO])\)/i;
const SUBJECT_COURSE_RE = /^\s*([A-Z][A-Z0-9_]{1,8})\s*(\d{3}[A-Z]?)\s*$/;

const responseCache = new Map<string, unknown>();

type FetchOptions = {
  signal?: AbortSignal;
  useCache?: boolean;
};

function normalizeSubject(raw: string): string {
  return String(raw || "").replace(/_[VO]$/i, "");
}

function normalizeSection(raw: string): string {
  const value = String(raw || "")
    .trim()
    .toUpperCase();
  if (!value) return "";
  return value.length > 3 ? value.slice(0, 3) : value;
}

function buildGradesUrl({
  version,
  campus,
  yearsession,
  subject,
  course,
  section,
}: {
  version: string;
  campus: string;
  yearsession: string;
  subject: string;
  course: string;
  section?: string;
}): string {
  const base = `${API_BASE}/${version}/grades/${campus}/${yearsession}/${subject}/${course}`;
  return section ? `${base}/${section}` : base;
}

function buildYearsessionsUrl({ version, campus }: { version: string; campus: string }): string {
  return `${API_BASE}/${version}/yearsessions/${campus}/`;
}

function cacheKey(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join("|");
}

async function fetchJson(url: string, { signal }: FetchOptions = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const error = new Error(`UBCGrades request failed (${response.status})`) as Error & {
      status?: number;
      url?: string;
    };

    error.status = response.status;
    error.url = url;
    throw error;
  }

  return (await response.json()) as unknown;
}

async function fetchYearsessions(
  { campus, version = DEFAULT_API_VERSION }: { campus: string; version?: string },
  { signal, useCache = true }: FetchOptions = {},
): Promise<unknown> {
  if (!campus) return null;

  const cacheId = cacheKey(version, "yearsessions", campus);
  if (useCache && responseCache.has(cacheId)) return responseCache.get(cacheId);

  const url = buildYearsessionsUrl({ version, campus });
  const data: unknown = await fetchJson(url, { signal });
  if (useCache) responseCache.set(cacheId, data);

  return data;
}

function normalizeYearsessionsList(data: unknown): string[] {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean).map(String);
  if (
    typeof data === "object" &&
    data &&
    Array.isArray((data as { yearsessions?: unknown[] }).yearsessions)
  ) {
    return (data as { yearsessions: unknown[] }).yearsessions.filter(Boolean).map(String);
  }
  return [];
}

function resolveFallbackYearsession(requested: string, available: string[]): string | null {
  if (!requested || !available.length) return requested || null;
  if (available.includes(requested)) return requested;

  const normalize = (value: string) => String(value || "").toUpperCase();
  const requestedYear = Number(normalize(requested).slice(0, 4));
  const requestedSeason = normalize(requested).slice(4);

  const parsed = available
    .map((value) => {
      const normalized = normalize(value);
      return {
        value: normalized,
        year: Number(normalized.slice(0, 4)),
        season: normalized.slice(4),
      };
    })
    .filter((item) => Number.isFinite(item.year))
    .sort((left, right) => left.year - right.year || left.season.localeCompare(right.season));

  const sameSeasonPrior = parsed.filter(
    (item) => item.season === requestedSeason && item.year <= requestedYear,
  );
  if (sameSeasonPrior.length) return sameSeasonPrior[sameSeasonPrior.length - 1].value;
  return parsed.length ? parsed[parsed.length - 1].value : requested;
}

function buildYearsessionFallbacks(requested: string, minYear = 2020): string[] {
  const normalized = String(requested || "").toUpperCase();
  const year = Number(normalized.slice(0, 4));
  const season = normalized.slice(4) || "W";
  if (!Number.isFinite(year)) return [];

  const values: string[] = [];
  for (let value = year; value >= minYear; value -= 1) {
    values.push(`${value}${season}`);
  }

  return values;
}

function buildAvailableYearsessionCandidates(requested: string, available: string[]): string[] {
  if (!available.length) return [];

  const normalize = (value: string) => String(value || "").toUpperCase();
  const requestedYear = Number(normalize(requested).slice(0, 4));
  const requestedSeason = normalize(requested).slice(4);

  const parsed = available
    .map((value) => {
      const normalized = normalize(value);
      return {
        value: normalized,
        year: Number(normalized.slice(0, 4)),
        season: normalized.slice(4),
      };
    })
    .filter((item) => Number.isFinite(item.year));

  const sameSeason = parsed
    .filter((item) => item.season === requestedSeason && item.year <= requestedYear)
    .sort((left, right) => right.year - left.year)
    .map((item) => item.value);

  const remaining = parsed
    .filter((item) => !sameSeason.includes(item.value))
    .sort((left, right) => right.year - left.year || left.season.localeCompare(right.season))
    .map((item) => item.value);

  return [...sameSeason, ...remaining];
}

function parseCourseCode(code: string): { subject: string; course: string } | null {
  const normalized = String(code || "")
    .trim()
    .toUpperCase();
  const match = normalized.match(SUBJECT_COURSE_RE);
  if (!match) return null;

  return {
    subject: normalizeSubject(match[1]),
    course: match[2],
  };
}

export function parseCourseInfoFromPromptText(promptText: string) {
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

function readTermCampusFromText(text: string): TermCampusInfo | null {
  const match = String(text || "").match(TERM_CAMPUS_RE);
  if (!match) return null;

  const yearsession = `${match[1]}${match[2].toLowerCase() === "winter" ? "W" : "S"}`;
  const campus = match[3].toUpperCase() === "UBC-V" ? "UBCV" : "UBCO";

  return { campus, yearsession };
}

export function readTermCampus(): TermCampusInfo | null {
  return readTermCampusFromText(document.body?.innerText || "");
}

async function fetchCourseGrades(
  {
    campus,
    yearsession,
    subject,
    course,
    version = DEFAULT_API_VERSION,
  }: {
    campus: string;
    yearsession: string;
    subject: string;
    course: string;
    version?: string;
  },
  { signal, useCache = true }: FetchOptions = {},
): Promise<unknown> {
  if (!campus || !yearsession || !subject || !course) return null;

  const cacheId = cacheKey(version, campus, yearsession, subject, course);
  if (useCache && responseCache.has(cacheId)) return responseCache.get(cacheId);

  const url = buildGradesUrl({ version, campus, yearsession, subject, course });
  const data: unknown = await fetchJson(url, { signal });
  if (useCache) responseCache.set(cacheId, data);

  return data;
}

export async function fetchSectionGradesWithFallback(
  {
    campus,
    yearsession,
    subject,
    course,
    section,
  }: {
    campus: string;
    yearsession: string;
    subject: string;
    course: string;
    section?: string;
  },
  { signal, useCache = true, isValid }: FetchOptions & { isValid?: (value: unknown) => boolean } = {},
): Promise<unknown> {
  let resolvedYearsession = yearsession;
  let yearsessionCandidates: string[] = [];

  try {
    const list = await fetchYearsessions({ campus }, { signal, useCache });
    const available = normalizeYearsessionsList(list);
    resolvedYearsession = resolveFallbackYearsession(yearsession, available) ?? yearsession;
    yearsessionCandidates = buildAvailableYearsessionCandidates(resolvedYearsession, available);
  } catch (error) {
    debug.warn(
      { id: "gradesApi.yearsessionLookupFailed" },
      "Yearsession lookup failed, continuing with requested value",
      error,
    );
  }

  if (!yearsessionCandidates.length) {
    yearsessionCandidates = [
      resolvedYearsession,
      ...buildYearsessionFallbacks(resolvedYearsession, 2020),
    ].filter(Boolean);
  }

  if (section) {
    debug.log({ id: "gradesApi.sectionIgnored" }, "Using course-level grades endpoint", { section });
  }

  const seen = new Set<string>();

  for (const candidate of yearsessionCandidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);

    try {
      const data = await fetchCourseGrades(
        { campus, yearsession: candidate, subject, course, version: DEFAULT_API_VERSION },
        { signal, useCache },
      );

      if (typeof isValid !== "function" || isValid(data)) return data;
    } catch (error) {
      const typedError = error as Error & { status?: number };
      if (typedError.status !== 404) throw error;
    }
  }

  return null;
}
