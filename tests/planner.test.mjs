import test from "node:test";
import assert from "node:assert/strict";
import { course, line } from "./fixtures/courses.mjs";
import {
  scheduleStatistics,
  conflictDetails,
  eventLanes,
  compareSchedules,
} from "../src/core/planner.js";
import {
  createBackup,
  parseBackup,
  planScheduleImport,
  parseWstSchedule,
} from "../src/core/scheduleBackup.js";
import {
  trustedSectionLink,
  courseWorkdayLink,
} from "../src/extraction/trustedWorkday.js";
import { timetablePages, jpegPdf } from "../src/exportLogic/exportTimetable.js";
import { JSDOM } from "jsdom";
import { mountPlanner } from "../src/mainPanel/schedules/plannerController.js";
import { renderSchedule } from "../src/mainPanel/schedules/scheduleView.js";
import { fetchCourseFromWorkdayLink } from "../src/extraction/singleCourseImport.js";
const range = "2026-09-07 - 2026-09-20";
const c = (code, time, overrides = {}) =>
  course({ code, meetingLines: [line("Mon", time, range)], ...overrides });
const snapshot = (id, name, courses, isFavorite = false) => ({
  id,
  name,
  courses,
  isFavorite,
  savedAt: "2026-10-01T00:00:00Z",
  colorAssignments: [1, 2, 3, 4, 5, 6, 7, 8],
});

test("conflicts distinguish exact clashes, short transitions, different terms and unknown recurrence", () => {
  const a = c("A 101", "9:00 a.m. - 10:00 a.m.");
  const b = c("B 101", "9:45 a.m. - 10:15 a.m.");
  const d = c("D 101", "10:15 a.m. - 11:00 a.m.");
  const unknown = c("U 101", "9:00 a.m. - 10:00 a.m.", {
    meetingLines: [
      line("Mon (Alternate Weeks)", "9:00 a.m. - 10:00 a.m.", range),
    ],
  });
  const r = conflictDetails([a, b, d, unknown]);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].start, 585);
  assert.equal(r.conflicts[0].end, 600);
  assert.equal(r.conflicts[0].dates.length, 2);
  assert.equal(r.transitions.length, 1);
  assert.equal(r.transitions[0].minutes, 0);
  assert.equal(r.diagnostics.length, 1);
});

test("three or more concurrent events get separate lanes, including transitive overlaps", () => {
  const events = [
    { id: "a", startMinutes: 540, endMinutes: 600 },
    { id: "b", startMinutes: 550, endMinutes: 590 },
    { id: "c", startMinutes: 560, endMinutes: 620 },
    { id: "d", startMinutes: 620, endMinutes: 650 },
  ];
  const lanes = eventLanes(events);
  assert.equal(lanes.get("a").count, 3);
  assert.equal(
    new Set(events.slice(0, 3).map((e) => lanes.get(e.id).lane)).size,
    3,
  );
  assert.equal(lanes.get("d").count, 1);
});

test("compare distinguishes section swaps and moved times without mutating snapshots", () => {
  const a = c("A 101", "9:00 a.m. - 10:00 a.m."),
    b = { ...a, section_number: "002" },
    m = { ...a, meetingLines: [line("Tue")] };
  const before = JSON.stringify(a);
  assert.equal(compareSchedules([a], [b]).moved.length, 1);
  assert.equal(compareSchedules([a], [m]).moved.length, 1);
  assert.equal(JSON.stringify(a), before);
});

test("backup round-trip strips secrets; a single import appends a uniquely named copy and keeps preference", () => {
  const a = snapshot(
    "a",
    "Plan A",
    [
      c("A 101", "9:00 a.m. - 10:00 a.m.", {
        token: "secret",
        extra: { password: "secret" },
      }),
    ],
    true,
  );
  const backup = createBackup([a], {
      wdHoverTooltipsEnabled: false,
      wdTimeFormat: "24h",
      accessToken: "secret",
    }),
    text = JSON.stringify(backup);
  assert.ok(!text.includes("secret"));
  assert.equal(parseBackup(text).schedules[0].courses[0].code, "A 101");
  const incoming = parseWstSchedule(text);
  const imported = planScheduleImport([a], incoming, () => "new-id");
  assert.equal(imported.schedules.length, 2);
  assert.equal(imported.imported.id, "new-id");
  assert.equal(imported.imported.name, "Plan A (1)");
  assert.equal(imported.imported.isFavorite, false);
  assert.equal(imported.schedules.filter(s => s.isFavorite).length, 1);
  assert.equal(a.courses[0].section_number, "001");
});

test("backup rejects malformed/future/oversized data and unsafe links/settings without writes", () => {
  assert.throws(() => parseBackup("{"), /malformed/);
  const b = createBackup([snapshot("a", "A", [course()])], {});
  assert.throws(
    () => parseBackup(JSON.stringify({ ...b, version: 999 })),
    /version/,
  );
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({ ...b, settings: { wdHoverTooltipsEnabled: "false" } }),
      ),
    /hover/,
  );
  const bad = structuredClone(b);
  bad.schedules[0].courses[0].workdayCourseLink = "javascript:alert(1)";
  assert.throws(() => parseBackup(JSON.stringify(bad)), /untrusted/);
  assert.throws(() => parseBackup(" ".repeat(5 * 1024 * 1024 + 1)), /5 MB/);
  const poison = JSON.parse(
    JSON.stringify(b).replace(
      '"settings":{}',
      '"settings":{"__proto__":{"polluted":true},"token":"secret"}',
    ),
  );
  assert.deepEqual(parseBackup(JSON.stringify(poison)).settings, {});
  assert.equal({}.polluted, undefined);
});

test("navigation accepts UBC section links only and refuses tenant/host/credential tricks", () => {
  const url = "https://wd10.myworkday.com/ubc/d/inst/1$15194/15194$123.htmld";
  assert.equal(trustedSectionLink(url + "?secret=x#details"), url);
  assert.equal(
    courseWorkdayLink(
      { workdayCourseId: "123" },
      "https://wd10.myworkday.com/ubc/home.htmld",
    ),
    url,
  );
  for (const bad of [
    "https://evil.myworkday.com/ubc/d/inst/1$15194/15194$123.htmld",
    url.replace("/ubc/", "/other/"),
    url.replace("https:", "http:"),
    url.replace("wd10.", "wd10.myworkday.com.evil."),
    url.replace("https://", "https://user:pass@"),
    url.replace(".com/", ".com:123/"),
    url.replace("15194$123", "15194$abc"),
  ])
    assert.equal(trustedSectionLink(bad), "", bad);
});

test("section requests retain redirect metadata and explain expired sessions and missing sections", async () => {
  const previous = globalThis.fetch,
    url = "https://wd10.myworkday.com/ubc/d/inst/1$15194/15194$123.htmld";
  try {
    for (const [status, message] of [
      [401, /Sign into/],
      [404, /no longer available/],
    ]) {
      globalThis.fetch = async () => new Response("", { status });
      await assert.rejects(
        () => fetchCourseFromWorkdayLink(url),
        (e) => e.status === status && message.test(e.message),
      );
    }
    globalThis.fetch = async () => {
      const r = new Response("{}");
      Object.defineProperty(r, "url", {
        value: "https://wd10.myworkday.com/ubc/login.htmld",
      });
      return r;
    };
    await assert.rejects(() => fetchCourseFromWorkdayLink(url), /redirected/);
  } finally {
    globalThis.fetch = previous;
  }
});

test("visual export keeps exactly two pages, escapes details and excludes account/link IDs", async () => {
  const courses = Array.from({ length: 25 }, (_, i) =>
    c(`TEST ${100 + i}`, "9:00 a.m. - 10:00 a.m.", {
      title: "Very long title ".repeat(20) + "<script>evil()</script>",
      section_number: String(i),
      instructor: "Instructor Name",
      workdayCourseId: "private-account-id",
      workdayCourseLink:
        "https://wd10.myworkday.com/ubc/d/inst/1$15194/15194$123.htmld",
    }),
  );
  for (const orientation of ["portrait", "landscape"]) {
    const p = timetablePages(courses, { orientation });
    assert.equal(p.pages.length, 2);
    const s = p.pages.join("");
    assert.ok(s.includes("Instructor Name"));
    assert.ok(s.includes("&lt;script&gt;"));
    assert.ok(!s.includes("<script>"));
    assert.ok(!s.includes("private-account-id"));
    assert.ok(!s.includes("myworkday.com"));
    assert.ok(s.includes("TEST 124"));
  }
  const blob = jpegPdf([new Uint8Array([255, 216, 255, 217])], 1123, 794),
    bytes = new Uint8Array(await blob.arrayBuffer()),
    text = new TextDecoder().decode(bytes);
  assert.match(text, /^%PDF-1.4/);
  assert.match(text, /\/Count 1/);
  assert.match(text, /%%EOF$/);
});

test("comparison stays read-only until an explicit preference action", async () => {
  const dom = new JSDOM(
    '<div id="main"><div id="grid"></div><div id="footer"></div></div>',
    {
      url: "https://wd10.myworkday.com/ubc/home.htmld",
      pretendToBeVisual: true,
    },
  );
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.getComputedStyle = dom.window.getComputedStyle;
  globalThis.structuredClone = structuredClone;
  const a = c("A 101", "9:00 a.m. - 10:00 a.m."),
    b = { ...a, section_number: "002" };
  const state = {
      courses: [a],
      savedSchedules: [snapshot("a", "Alpha", [a]), snapshot("b", "Beta", [b])],
    },
    before = JSON.stringify(state);
  let writes = 0;
  const notes = [];
  const ui = {
    root: document.body,
    mainPanel: document.querySelector("#main"),
    scheduleGrid: document.querySelector("#grid"),
    footerNotes: { showTemporary: (s) => notes.push(s) },
  };
  mountPlanner(ui, {
    getState: () => state,
    replaceCourses: (v) => (state.courses = v),
    saveSchedules: async (v) => {
      writes++;
      state.savedSchedules = v;
    },
  });
  const find = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
  find("Compare saved plans").click();
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(document.querySelector(".planner-comparison"));
  assert.equal(JSON.stringify(state), before);
  assert.equal(writes, 0);
  const fields = [...document.querySelectorAll("dialog select")];
  assert.equal(fields[0].querySelector('option[value="b"]').disabled, true);
  assert.equal(fields[1].querySelector('option[value="a"]').disabled, true);
  find("Swap sides").click();
  assert.deepEqual(fields.map((field) => field.value), ["b", "a"]);
  assert.equal(writes, 0);
  find("Swap sides").click();
  find("Set as Preferred").click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(writes, 1);
  assert.equal(state.savedSchedules[0].isFavorite, true);
  assert.equal(document.querySelector('[aria-pressed="true"].planner-preferred-button').textContent, "Preferred schedule");
  find("Close").click();
  assert.equal(document.querySelector("dialog"), null);
  dom.window.close();
});

test("conflicts keep separate focusable lanes without the removed detail panel", () => {
  const dom = new JSDOM('<div id="grid"></div>');
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.getComputedStyle = dom.window.getComputedStyle;
  renderSchedule({ scheduleGrid: document.querySelector("#grid") }, [c("A 101", "9:00 a.m. - 10:00 a.m."), c("B 101", "9:15 a.m. - 10:15 a.m."), c("C 101", "9:30 a.m. - 10:30 a.m.")]);
  assert.equal(document.querySelectorAll(".schedule-entry-float").length, 3);
  assert.equal(document.querySelector(".planner-conflicts"), null);
  assert.equal(document.querySelector(".schedule-entry-float").tabIndex, 0);
  dom.window.close();
});

test("conflict badges distinguish meeting patterns of the same section across terms", () => {
  const dom = new JSDOM('<div id="grid"></div>');
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.getComputedStyle = dom.window.getComputedStyle;
  const fall = line('Mon', '9:00 a.m. - 10:00 a.m.', '2026-09-07 - 2026-09-20');
  const winter = line('Mon', '9:30 a.m. - 10:30 a.m.', '2027-01-04 - 2027-01-17');
  renderSchedule({ scheduleGrid: document.querySelector('#grid') }, [
    course({ code: 'A 101', meetingLines: [fall, winter] }),
    course({ code: 'B 101', meetingLines: [fall] }),
  ]);
  const entries = [...document.querySelectorAll('.schedule-entry-float')];
  assert.equal(entries.filter(e => e.classList.contains('has-conflict')).length, 2);
  assert.ok(!entries.find(e => e.getAttribute('aria-label').includes('2027-01-04')).classList.contains('has-conflict'));
  dom.window.close();
});
