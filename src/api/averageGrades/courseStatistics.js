import { fetchReliable, TtlCache } from "../../utilities/network.js";
import { buildUbcGradesCourseUrl, buildYearsessionsUrl } from "./gradesApiCall.js";
const cache = new TtlCache(60 * 60 * 1000);

const number = (value) =>
  value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
export function aggregateGradeRows(payload) {
  const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
  // OVERALL is already a course aggregate. Including its sections double-counts.
  const overall = rows.find((r) => /^overall$/i.test(r.section || ""));
  const chosen = overall ? [overall] : rows;
  if (!chosen.length) return null;
  const entries = chosen.map((r) => ({ average: number(r.average), count: number(r.reported ?? r.enrolled) }));
  if (entries.some((r) => r.average === null || r.average < 0 || r.average > 100)) return null;
  const weighted = entries.every((r) => r.count !== null && r.count > 0);
  const count = weighted ? entries.reduce((n, r) => n + r.count, 0) : null;
  // A single OVERALL can be shown without a sample count, but a pooled average
  // cannot be calculated honestly when any contributing weight is missing.
  return {
    average: weighted
      ? entries.reduce((n, r) => n + r.average * r.count, 0) / count
      : overall
        ? entries[0].average
        : null,
    count,
    stale: Boolean(payload?.stale),
    missingWeights: !weighted,
  };
}
export function summarizeCourseYears(records, window) {
  const valid = records.filter((r) => r.stats && r.stats.average !== null);
  const latestYear = valid.length ? Math.max(...valid.map((r) => r.year)) : null;
  const combine = (rows) => {
    if (!rows.length) return null;
    const weighted = rows.every((r) => r.stats.count > 0);
    const count = weighted ? rows.reduce((n, r) => n + r.stats.count, 0) : null;
    return {
      average: weighted
        ? rows.reduce((n, r) => n + r.stats.average * r.stats.count, 0) / count
        : rows.length === 1
          ? rows[0].stats.average
          : null,
      count,
    };
  };
  const covered = [
    ...new Set(
      valid
        .filter((r) => !records.some((other) => other.year === r.year && other.stats?.average == null))
        .map((r) => r.year),
    ),
  ].sort();
  const allHaveData = records.every((r) => r.stats?.average !== null && r.stats?.average !== undefined);
  const five = combine(valid);
  // Multiple years require weights for every available session/section.
  if (five && (!allHaveData || valid.some((r) => !(r.stats.count > 0)))) five.average = null;
  const latest = latestYear ? { ...combine(valid.filter((r) => r.year === latestYear)), year: latestYear } : null;
  if (latest && records.some((r) => r.year === latestYear && r.stats?.average == null)) latest.average = null;
  return {
    latest,
    fiveYear: {
      ...(five || { average: null, count: null }),
      window,
      covered,
      missing: window.filter((y) => !covered.includes(y)),
    },
    stale: records.some((r) => r.stats?.stale),
  };
}

async function json(url) {
  return cache.get(url, async () => {
    const response = await fetchReliable(url);
    return response.json();
  });
}
export async function fetchCourseStatistics({ campus, subject, course, yearsession = `${new Date().getFullYear()}W` }) {
  campus = String(campus).toUpperCase();
  subject = String(subject)
    .toUpperCase()
    .replace(/_[VO]$/, "");
  course = String(course).toUpperCase();
  if (!/^(UBCO|UBCV)$/.test(campus) || !/^[A-Z0-9]+$/.test(subject) || !/^\d{3}[A-Z]?$/.test(course))
    throw new Error("Unsupported course for grade lookup.");
  const requestYear = Number(String(yearsession).slice(0, 4));
  const available = await json(buildYearsessionsUrl({ campus }));
  const sessions = [...new Set((Array.isArray(available) ? available : available?.yearsessions || []).map(String))]
    .filter((s) => /^\d{4}[WS]$/.test(s) && +s.slice(0, 4) <= requestYear)
    .sort()
    .reverse();
  if (!sessions.length)
    return { latest: null, fiveYear: { average: null, count: null, window: [], covered: [], missing: [] } };
  const end = Math.max(...sessions.map((s) => +s.slice(0, 4)));
  const window = Array.from({ length: 5 }, (_, i) => end - 4 + i);
  const records = await Promise.all(
    sessions
      .filter((s) => window.includes(+s.slice(0, 4)))
      .slice(0, 10)
      .map(async (session) => {
        try {
          const data = await json(`https://ubcgrades.com/api/v3/grades/${campus}/${session}/${subject}/${course}`);
          return { year: +session.slice(0, 4), session, stats: aggregateGradeRows(data) };
        } catch (error) {
          if (error.status === 404) return null; // No offering in this session.
          throw error;
        }
      }),
  );
  const result = summarizeCourseYears(records.filter(Boolean), window);
  result.stale ||= Boolean(available.stale);
  const latestSession = records
    .filter((r) => r && r.year === result.latest?.year && r.stats?.average != null)
    .sort((a, b) => b.session.localeCompare(a.session))[0]?.session;
  result.source = buildUbcGradesCourseUrl({ campus, subject, course, yearsession: latestSession || `${end}W` });
  return result;
}

export function courseStatisticsLabel(result) {
  const latest = result?.latest;
  const five = result?.fiveYear;
  const format = (n) => (n == null ? "unavailable" : `${n.toFixed(1)}%`);
  return `${result?.stale ? "Stale cached data\n" : ""}Latest year${latest ? ` (${latest.year})` : ""}: ${format(latest?.average)}\n5-year window${five?.window?.length ? ` (${five.window[0]}–${five.window.at(-1)})` : ""}: ${format(five?.average)}\nCovered: ${five?.covered?.join(", ") || "none"}; missing: ${five?.missing?.join(", ") || "none"}\nSamples: latest ${latest?.count ?? "unknown"}; window ${five?.count ?? "unknown"}${five?.missing?.length ? " (available years only)" : ""}\nCourse-level · UBCGrades`;
}
