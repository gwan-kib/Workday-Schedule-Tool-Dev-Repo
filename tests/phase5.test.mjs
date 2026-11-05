import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSharedSchedule,
  decodeSharedLink,
  encodeSharedLink,
  MAX_SHARE_FILE,
  parseSharedSchedule,
  serializeSharedSchedule,
  sharedScheduleForImport,
  SHARE_PAGE,
  SHARE_PREFIX,
} from "../src/core/scheduleShare.js";
import { optimizeSchedules } from "../src/core/scheduleOptimizer.js";
import { loadOptimizerOptions } from "../src/extraction/optimizerOptions.js";
import { planScheduleImport } from "../src/core/scheduleBackup.js";
import { course, line } from "./fixtures/courses.mjs";

const section = (code, section_number, days, time, options = {}) => course({
  code, section_number, meetingLines: [line(days, time)], ...options,
});
const block = {
  id: "private-stored-id", title: "Commute", category: "Travel", color: "#125678",
  startDate: "2026-09-08", endDate: "2026-12-15", days: ["Tue"],
  recurrence: "alternate", startMinutes: 600, endMinutes: 660, exceptions: ["2026-09-08"],
};

test("ranked preferences resolve trade-offs and a Friday option remains eligible", async () => {
  const friday = section("TEST_O 101", "001", "Fri", "11:00 a.m. - 12:00 p.m.");
  const monday = section("TEST_O 101", "002", "Mon", "9:00 a.m. - 10:00 a.m.");
  const groups = [[[friday], [monday], [friday]]];
  const first = await optimizeSchedules({ groups, priorities: ["friday", "late"] });
  assert.deepEqual(first.suggestions.map(s => s.courses[0].section_number), ["002", "001"]);
  const second = await optimizeSchedules({ groups, priorities: ["late", "friday"] });
  assert.equal(second.suggestions[0].courses[0].section_number, "001");
  const fridayOnly = await optimizeSchedules({ groups: [[[friday]]], priorities: ["friday"] });
  assert.equal(fridayOnly.suggestions.length, 1);
});

test("the optimizer uses actual alternating dates, skip dates and fixed classes as hard constraints", async () => {
  const alternative = (id, anchor) => section("TEST_O 101", id, "Tue", "10:30 a.m. - 11:30 a.m.", {
    meetingAnchors: [anchor],
    meetingLines: [line("Tue (Alternate Weeks)", "10:30 a.m. - 11:30 a.m.")],
  });
  const blocked = alternative("001", "2026-09-08");
  const okay = alternative("002", "2026-09-15");
  const uncertain = alternative("003", undefined);
  const fixed = section("TEST_O 201", "001", "Tue", "11:30 a.m. - 12:30 p.m.");
  const result = await optimizeSchedules({
    groups: [[[blocked], [okay], [uncertain]]], fixed: [fixed], personalBlocks: [block],
  });
  assert.equal(result.excluded, 1);
  assert.deepEqual(result.suggestions.map(s => s.courses.map(c => c.section_number)), [["001", "002"]]);
  const noSolution = await optimizeSchedules({ groups: [[[blocked]]], personalBlocks: [block] });
  assert.deepEqual(noSolution.suggestions, []);
  assert.equal(noSolution.limited, false);
  const nonRecurring = { ...block, endDate: block.startDate, recurrence: "once", exceptions: [] };
  const skipped = { ...blocked, meetingExceptions: [[block.startDate]] };
  assert.equal((await optimizeSchedules({ groups: [[[skipped]]], personalBlocks: [nonRecurring] })).suggestions.length, 1);
});

test("a bounded many-section search returns distinct deterministic ties", async () => {
  const groups = Array.from({ length: 6 }, (_, group) => Array.from({ length: 6 }, (_, index) => [
    section("TEST_O " + (100 + group), "00" + index, "Mon",
      (7 + group) + ":00 " + (group === 5 ? "p.m." : "a.m.") + " - " +
      (7 + group) + ":30 " + (group === 5 ? "p.m." : "a.m."), {
        meetingLines: [line("Mon", group === 5 ? "12:00 p.m. - 12:30 p.m." : (7 + group) + ":00 a.m. - " + (7 + group) + ":30 a.m.", "2026-09-07 - 2026-09-07")],
      }),
  ]));
  const first = await optimizeSchedules({ groups });
  const reverse = await optimizeSchedules({ groups: groups.map(group => [...group].reverse()) });
  assert.ok(first.limited);
  assert.equal(new Set(first.suggestions.map(s => s.key)).size, 5);
  assert.deepEqual(first.suggestions.map(s => s.key), reverse.suggestions.map(s => s.key));
});

test("Workday options keep confirmed bundles intact and skip unavailable choices", async () => {
  const url = id => "https://wd10.myworkday.com/ubc/d/inst/1$15194/15194$" + id + ".htmld";
  const lecture = section("TEST_O 101", "001", "Tue", "10:00 a.m. - 11:00 a.m.");
  const lab = section("TEST_O 101", "L01", "Tue", "11:00 a.m. - 12:00 p.m.", { instructionalFormat: "Lab" });
  const differentTerm = { ...lecture, meetingLines: [line("Tue", "11:00 a.m. - 12:00 p.m.", "2027-01-04 - 2027-04-12")] };
  const calls = [];
  const fetchSection = async link => {
    calls.push(link);
    if (link === url(1)) return lecture;
    if (link === url(2)) return lab;
    if (link === url(4)) return differentTerm;
    throw new Error("Unavailable");
  };
  const result = await loadOptimizerOptions([url(1) + " " + url(2) + "\n" + url(1) + " " + url(3)],
    [lecture, lab, differentTerm], { fetchSection });
  assert.deepEqual(result.groups, [[[lecture, lab]]]);
  assert.deepEqual(result.fixed, [differentTerm]);
  assert.equal(result.unavailable, 1);
  assert.equal(calls.length, 3);
  await assert.rejects(() => loadOptimizerOptions([url(1)], [lecture, lab], { fetchSection }), /required components/);
  await assert.rejects(() => loadOptimizerOptions([url(1) + " " + url(4)], [], { fetchSection }), /same course, term/);
  await assert.rejects(() => loadOptimizerOptions(["https://example.test/private"], [], { fetchSection }), /Section links/);
});

test("share links and files carry the preview fields and import as independent copies", async () => {
  const source = course({
    title: "Café 室",
    workdayCourseId: "workday-secret-id",
    workdayCourseLink: "https://workday.example/private",
    courseIndex: 8,
    accountToken: "secret-token",
    notes: "private notes",
  });
  const text = serializeSharedSchedule(createSharedSchedule([source]));
  for (const secret of ["workday-secret-id", "workday.example", "secret-token", "private notes", "courseIndex", block.title])
    assert.ok(!text.includes(secret));
  const link = await encodeSharedLink(text);
  assert.ok(link.startsWith(SHARE_PAGE + SHARE_PREFIX));
  const decoded = await decodeSharedLink(link);
  assert.equal(decoded.courses[0].title, "Café 室");
  assert.equal(decoded.courses[0].instructor, source.instructor);
  assert.match(decoded.courses[0].meetingLines[0], /Room: 101/);
  assert.deepEqual(decoded, parseSharedSchedule(text));

  const included = createSharedSchedule([source], [block]);
  assert.equal(included.personalBlocks[0].title, block.title);
  assert.notEqual(included.personalBlocks[0].id, block.id);
  const incoming = sharedScheduleForImport(included);
  const existing = [{ ...incoming, id: "existing", isFavorite: true }];
  const result = planScheduleImport(existing, incoming);
  assert.deepEqual(result.schedules[0], existing[0]);
  assert.equal(result.imported.name, "Shared schedule (1)");
  assert.notEqual(result.imported.personalBlocks[0].id, block.id);
  assert.match(result.imported.courses[0].meeting, /Room: 101/);
});

test("untrusted or oversized shares are rejected, and long links fall back to JSON", async () => {
  const large = Array.from({ length: 60 }, (_, index) => course({
    section_number: String(index),
    title: Array.from({ length: 3 }, (_, part) =>
      createHash("sha512").update(index + ":" + part).digest("hex")).join(""),
  }));
  const text = serializeSharedSchedule(createSharedSchedule(large));
  assert.equal(await encodeSharedLink(text), null);
  assert.equal(parseSharedSchedule(text).courses.length, 60);
  await assert.rejects(() => decodeSharedLink("https://example.test/" + SHARE_PREFIX + "AA"), /valid WST/);
  await assert.rejects(() => decodeSharedLink(SHARE_PAGE + SHARE_PREFIX + "AA"), /damaged/);
  assert.throws(() => parseSharedSchedule(text.replace('"version":1', '"version":99')), /from this extension/);
  assert.throws(() => parseSharedSchedule(" ".repeat(MAX_SHARE_FILE + 1)), /512 KB/);

  const expanded = await encodeSharedLink(" ".repeat(MAX_SHARE_FILE + 1));
  await assert.rejects(() => decodeSharedLink(expanded), /size limit/);
});
