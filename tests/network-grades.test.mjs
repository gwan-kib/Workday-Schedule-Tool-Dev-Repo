import test from "node:test";
import assert from "node:assert/strict";
import { createLimiter, fetchReliable, TtlCache } from "../src/utilities/network.js";
import {
  aggregateGradeRows,
  summarizeCourseYears,
  fetchCourseStatistics,
  courseStatisticsLabel,
} from "../src/api/averageGrades/courseStatistics.js";
const response = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

test("network concurrency is bounded", async () => {
  const limit = createLimiter(3);
  let active = 0,
    max = 0;
  await Promise.all(
    Array.from({ length: 12 }, () =>
      limit(async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
      }),
    ),
  );
  assert.equal(max, 3);
});
test("retry policy honors Retry-After and never retries permanent failures", async () => {
  let calls = 0;
  const delays = [];
  globalThis.fetch = async () => (++calls === 1 ? response(429, {}, { "Retry-After": "2" }) : response(200, {}));
  await fetchReliable("https://example.test", {}, { wait: async (ms) => delays.push(ms) });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response(403, {});
  };
  await assert.rejects(fetchReliable("https://forbidden.test"), /403/);
  assert.equal(calls, 1);
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response(429, {}, { "Retry-After": "120" });
  };
  await assert.rejects(fetchReliable("https://limited.test"), /429/);
  assert.equal(calls, 1);
});
test("slow/offline requests have bounded attempts and abort timeouts", async () => {
  let calls = 0;
  globalThis.fetch = async (_, { signal }) => {
    calls++;
    return new Promise((resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  };
  await assert.rejects(
    fetchReliable("https://slow.test", {}, { timeoutMs: 5, retries: 1, wait: async () => {} }),
    /timed out/,
  );
  assert.equal(calls, 2);
});
test("TTL caching coalesces requests, expires entries, and labels stale recovery", async () => {
  let now = 0,
    calls = 0;
  const cache = new TtlCache(10, () => now);
  const load = async () => {
    calls++;
    return { average: 80 };
  };
  await Promise.all([cache.get("same", load), cache.get("same", load)]);
  assert.equal(calls, 1);
  now = 11;
  assert.equal(
    (
      await cache.get("same", async () => {
        throw new Error("offline");
      })
    ).stale,
    true,
  );
  await cache.get("same", load);
  assert.equal(calls, 2);
});
test("a stalled response body also times out", async () => {
  globalThis.fetch = async () => ({
    status: 200,
    headers: new Headers(),
    statusText: "OK",
    arrayBuffer: () => new Promise(() => {}),
  });
  await assert.rejects(fetchReliable("https://slow.test", {}, { timeoutMs: 5, retries: 0 }), /timed out/);
});
test("course-level averages use sample weights and do not double-count OVERALL", () => {
  assert.deepEqual(
    aggregateGradeRows([
      { section: "001", average: 60, reported: 10 },
      { section: "002", average: 90, reported: 30 },
    ]),
    { average: 82.5, count: 40, stale: false, missingWeights: false },
  );
  assert.equal(
    aggregateGradeRows([
      { section: "OVERALL", average: 75, reported: 100 },
      { section: "001", average: 0, reported: 100 },
    ]).average,
    75,
  );
  assert.equal(
    aggregateGradeRows([
      { section: "001", average: 60 },
      { section: "002", average: 90 },
    ]).average,
    null,
  );
  assert.equal(aggregateGradeRows([{ average: "", reported: 2 }]), null);
});
test("five-year window discloses coverage and does not fabricate missing weights", () => {
  const records = [
    { year: 2024, stats: { average: 60, count: 10 } },
    { year: 2025, stats: { average: 90, count: 30 } },
  ];
  const result = summarizeCourseYears(records, [2021, 2022, 2023, 2024, 2025]);
  assert.equal(result.fiveYear.average, 82.5);
  assert.equal(result.latest.year, 2025);
  assert.equal(result.latest.average, 90);
  assert.deepEqual(result.fiveYear.missing, [2021, 2022, 2023]);
  assert.equal(result.fiveYear.count, 40);
  assert.match(courseStatisticsLabel(result), /Covered: 2024, 2025/);
  records[0].stats.count = null;
  assert.equal(summarizeCourseYears(records, [2024, 2025]).fiveYear.average, null);
});
test("grade lookup aggregates all offered sessions within a bounded five-year window", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    if (url.includes("yearsessions")) return response(200, ["2025W", "2024W", "2023W", "2022W", "2021W", "2020W"]);
    if (url.includes("2025W")) return response(200, [{ section: "OVERALL", average: 90, reported: 30 }]);
    if (url.includes("2024W")) return response(200, [{ section: "OVERALL", average: 60, reported: 10 }]);
    return response(404, {});
  };
  const result = await fetchCourseStatistics({ campus: "UBCO", subject: "TEST", course: "101", yearsession: "2026W" });
  assert.equal(result.latest.year, 2025);
  assert.equal(result.fiveYear.average, 82.5);
  assert.equal(urls.length, 6);
  assert.ok(!urls.some((u) => u.includes("2020W")));
  assert.match(result.source, /UBCO-2025W-TEST-101/);
});
test("429 cooldown prevents a burst of new requests to the same service", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response(429, {}, { "Retry-After": "120" });
  };
  await assert.rejects(fetchReliable("https://cooldown.test/one"), /429/);
  await assert.rejects(fetchReliable("https://cooldown.test/two"), /rate limit/);
  assert.equal(calls, 1);
});
test("RMP no-match and service-error states remain distinct and duplicate lookups coalesce", async () => {
  const { queryProfRating } = await import("../src/api/rateMyProfessor/rmpApi.js");
  globalThis.fetch = async () => response(200, { errors: [{ message: "Service failure" }] });
  await assert.rejects(queryProfRating({ profName: "Synthetic Error", campus: "UBCO" }), /temporarily unavailable/);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response(200, { data: { search: { teachers: { edges: [] } } } });
  };
  const results = await Promise.all([
    queryProfRating({ profName: "Synthetic Nomatch", campus: "UBCO" }),
    queryProfRating({ profName: "Synthetic Nomatch", campus: "UBCO" }),
  ]);
  assert.deepEqual(results, [null, null]);
  assert.equal(calls, 1);
});
