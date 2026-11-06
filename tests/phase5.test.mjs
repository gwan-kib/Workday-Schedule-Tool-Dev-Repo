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
import { catalogSectionLink, readCourseCatalog } from "../src/api/courseCatalog.js";
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

test("automatic discovery uses the draft, same campus and term, and keeps unresolved linked activities", async () => {
  const lecture = section("DATA_O 311", "101", "Tue", "10:00 a.m. - 11:00 a.m.");
  const lab = section("DATA_O 311", "L02", "Fri", "11:00 a.m. - 12:00 p.m.", { instructionalFormat: "Lab" });
  const standalone = section("ENGL_O 109", "001", "Fri", "9:00 a.m. - 10:00 a.m.");
  const missing = section("ANTH_O 170", "001", "Thu", "9:00 a.m. - 10:00 a.m.");
  const term = "2026-27 Winter Term 1 (UBC-O)";
  const entry = (section, extra = {}) => ({
    section, term, title: "Public catalog course", format: "Lecture", mode: "In person",
    status: "Open", startDate: "2026-09-08", endDate: "2026-12-09", days: ["m"],
    startTime: 32400, endTime: 36000, varies: false,
    ...extra,
  });
  const listings = {
    "DATA_O 311": [entry("101"), entry("L01", { format: "Laboratory" }), entry("L02", { format: "Laboratory" })],
    "ENGL_O 109": [entry("001"), entry("002", { link: "https://courses.students.ubc.ca/courses/english/english-2026-sec-002" }),
      entry("003", { status: "Closed" }), entry("004", { varies: true }),
      entry("005", { term: "2026-27 Winter Term 2 (UBC-O)", startDate: "2027-01-04", endDate: "2027-04-12" })],
  };
  const seen = [];
  const options = await loadOptimizerOptions([lecture, lab, standalone, missing], {
    loadCatalog: async code => {
      seen.push(code);
      if (!listings[code]) throw new Error("Unavailable");
      return listings[code];
    },
  });
  assert.deepEqual(seen.sort(), ["ANTH_O 170", "DATA_O 311", "ENGL_O 109"]);
  assert.deepEqual(options.fixed, [lecture, lab, missing]);
  assert.deepEqual(options.groups[0].map(([course]) => course.section_number), ["001", "002"]);
  assert.match(options.report[0].note, /pairing/);
  assert.match(options.report[2].note, /could not be retrieved/);
  const result = await optimizeSchedules({ ...options, priorities: ["friday"] });
  const changed = result.suggestions.find(s => s.courses.some(c => c.code === standalone.code && c.section_number === "002"));
  assert.ok(changed);
  assert.deepEqual(changed.courses.filter(c => c.code === lecture.code), [lecture, lab]);
});

test("the public catalog follows validated pages and refuses an incomplete or foreign next link", async () => {
  const code = "DATA_O 311";
  const reference = { type: "node--course", id: "course" };
  const row = id => ({
    id, type: "node--section",
    attributes: { field_section_number: id, field_time_varies: false },
    relationships: { field_course: { data: reference } },
  });
  const included = [{ ...reference, attributes: { field_course_code: code, title: "Machine Learning" } }];
  const result = await readCourseCatalog(code, { loadPage: async url => {
    assert.equal(url.origin, "https://courses.students.ubc.ca");
    assert.equal(url.searchParams.get("filter[field_course.field_course_code]"), code);
    const offset = url.searchParams.get("page[offset]");
    if (offset === "50") return { data: [row("L02")], included };
    const next = new URL(url);
    next.searchParams.set("page[offset]", "50");
    return { data: [row("101")], included, links: { next: { href: next.href } } };
  } });
  assert.deepEqual(result.map(section => section.section), ["101", "L02"]);
  await assert.rejects(() => readCourseCatalog(code, { loadPage: async () => ({
    data: [row("101")], included, links: { next: { href: "https://example.test/catalog" } },
  }) }), /invalid section page/);
  assert.equal(catalogSectionLink("https://courses.students.ubc.ca.evil.test/courses/a/b"), "");
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
