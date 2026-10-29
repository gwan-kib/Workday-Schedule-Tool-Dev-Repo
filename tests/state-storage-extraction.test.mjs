import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { STATE } from "../src/core/state.js";
import { createScheduleStore } from "../src/core/scheduleStore.js";
import { filterCourses, applyCourseSort, sortCourses } from "../src/mainPanel/courses/courseViewSorting.js";
import { extractCoursesData } from "../src/extraction/extractCourses.js";
import { extractCourseFromWorkdayJson } from "../src/extraction/singleCourseImport.js";
import { collectSectionEntries } from "../src/extraction/workdaySelectors.js";
import { course, fiveCourses, workdayJson } from "./fixtures/courses.mjs";
import { debugLog } from "../src/utilities/debugTool.js";
debugLog({ global: false });

let data = {},
  lastError = null,
  writeCount = 0;
globalThis.chrome = {
  runtime: {
    get lastError() {
      return lastError;
    },
  },
  storage: {
    local: {
      get(keys, callback) {
        callback(structuredClone(data));
      },
      set(values, callback) {
        writeCount++;
        if (!lastError) data = { ...data, ...structuredClone(values) };
        callback();
      },
    },
  },
};
const { loadSavedSchedules, persistSavedSchedules, createScheduleSnapshot, getScheduleNameError } =
  await import("../src/mainPanel/schedules/scheduleStorage.js");

test("filtering one of five courses leaves save/export canonical snapshots complete", () => {
  const state = { courses: fiveCourses(), query: "", sort: { key: null, dir: 1 } };
  const store = createScheduleStore(state);
  store.filter("Course 1");
  assert.equal(state.filtered.length, 1);
  assert.equal(store.snapshot().length, 5);
  assert.equal(store.export().meetings.length, 5);
  store.filter("no results");
  assert.equal(state.filtered.length, 0);
  assert.equal(store.snapshot().length, 5);
  const frozen = store.snapshot();
  frozen[0].title = "changed";
  assert.equal(state.courses[0].title, "Course 1");
});
test("search and repeat rendering cannot flip the selected sort", () => {
  STATE.courses = [course({ title: "Z" }), course({ title: "A" })];
  STATE.sort = { key: null, dir: 1 };
  filterCourses("");
  sortCourses("title");
  assert.equal(STATE.filtered[0].title, "A");
  for (let i = 0; i < 5; i++) {
    filterCourses("");
    applyCourseSort();
  }
  assert.equal(STATE.sort.dir, 1);
  assert.equal(STATE.filtered[0].title, "A");
  sortCourses("title");
  assert.equal(STATE.filtered[0].title, "Z");
  sortCourses("title");
  assert.equal(STATE.sort.key, null);
  assert.equal(STATE.filtered[0].title, "Z");
});
test("store load, add, remove and compare have explicit isolated ownership", () => {
  const state = { courses: [], query: "", sort: { key: null, dir: 1 } },
    store = createScheduleStore(state);
  const c = course();
  store.load([c]);
  c.title = "outside mutation";
  assert.equal(state.courses[0].title, "Example course");
  assert.equal(store.add(course()), false);
  assert.equal(store.add(course({ code: "TEST 202" })), true);
  assert.equal(store.compare([course()]).removed.length, 1);
  store.remove(course());
  assert.equal(state.courses.length, 1);
});
test("legacy storage survives versioned migration with preference and deep-copy snapshots", async () => {
  lastError = null;
  const snapshot = createScheduleSnapshot("Legacy", fiveCourses());
  snapshot.isFavorite = true;
  data = { wdSavedSchedules: [snapshot] };
  writeCount = 0;
  const loaded = await loadSavedSchedules();
  assert.equal(loaded[0].isFavorite, true);
  assert.equal(writeCount, 0);
  await persistSavedSchedules(loaded);
  assert.equal(data.wdScheduleSchemaVersion, 1);
  assert.equal(data.wdPreferredScheduleId, snapshot.id);
  assert.equal(data.wdSavedSchedules[0].courses.length, 5);
});
test("schedule names ignore case and whitespace while allowing a record to retain its own name", () => {
  const schedules = [{ id: "one", name: "Fall Plan" }, { id: "two", name: "Backup" }];
  for (const name of ["Fall Plan", "FALL PLAN", "  fall   plan ", "fall\tplan"]) {
    assert.match(getScheduleNameError(name, schedules), /already uses this name/);
    assert.equal(getScheduleNameError(name, schedules, "one"), null);
    assert.match(getScheduleNameError(name, schedules, "two"), /already uses this name/);
  }
  assert.equal(getScheduleNameError("New plan", schedules), null);
  assert.match(getScheduleNameError("   ", schedules), /cannot be empty/);
});

test("persistence rejects duplicate names before writing any saved data", async () => {
  const before = structuredClone(data);
  writeCount = 0;
  await assert.rejects(persistSavedSchedules([
    createScheduleSnapshot("Fall Plan", fiveCourses()),
    createScheduleSnapshot(" fall   PLAN ", fiveCourses()),
  ]), /already uses this name/);
  assert.equal(writeCount, 0);
  assert.deepEqual(data, before);
});

test("legacy duplicate records can be renamed one at a time without permitting new collisions", async () => {
  data = { wdSavedSchedules: [
    createScheduleSnapshot("Old plan", fiveCourses()),
    createScheduleSnapshot("OLD PLAN", fiveCourses()),
    createScheduleSnapshot("Old   plan", fiveCourses()),
  ] };
  writeCount = 0;
  const loaded = await loadSavedSchedules();
  assert.equal(writeCount, 0);
  const renamed = loaded.map((schedule, index) => index === 0 ? { ...schedule, name: "Distinct plan" } : schedule);
  await persistSavedSchedules(renamed);
  assert.equal(data.wdSavedSchedules.length, 3);
  assert.equal(data.wdSavedSchedules[0].name, "Distinct plan");
  const before = structuredClone(data);
  await assert.rejects(persistSavedSchedules([
    ...renamed, createScheduleSnapshot("old plan", fiveCourses()),
  ]), /already uses this name/);
  assert.deepEqual(data, before);
});

test("quota and read failures reject rather than reporting successful persistence", async () => {
  const before = structuredClone(data);
  lastError = { message: "QUOTA_BYTES exceeded" };
  await assert.rejects(persistSavedSchedules([]), /QUOTA_BYTES/);
  await assert.rejects(loadSavedSchedules(), /Could not read/);
  assert.deepEqual(data, before);
  lastError = null;
});
test("malformed/future storage is reported without overwriting existing bytes", async () => {
  for (const invalid of [
    { wdSavedSchedules: "corrupt" },
    { wdSavedSchedules: [{ id: "x", courses: [] }] },
    { wdSavedSchedules: [], wdScheduleSchemaVersion: 42 },
  ]) {
    data = structuredClone(invalid);
    writeCount = 0;
    await assert.rejects(loadSavedSchedules(), /damaged|unsupported|Unsupported/);
    assert.equal(writeCount, 0);
    assert.deepEqual(data, invalid);
  }
});
test("Workday JSON sibling groups and descriptor/value variations retain all dates", () => {
  const c = extractCourseFromWorkdayJson(workdayJson, {
    sourceUrl: "https://example.myworkday.com/ubc/inst/1$15194/15194$100.htmld",
  });
  assert.equal(c.instructor, "Example Instructor");
  assert.equal(c.meetingLines.length, 2);
  assert.equal(c.startDate, "2026-09-01");
  assert.equal(c.endDate, "2027-04-15");
});
test("alternate Workday selectors deduplicate section IDs", () => {
  const doc = new JSDOM(
    '<div data-automation-id="selectedItem_15194$100"></div><a href="/ubc/d/inst/1$15194/15194$100.htmld">Course</a><a href="/ubc/d/inst/1$15194/15194$101.htmld">Other</a>',
  ).window.document;
  assert.deepEqual(
    collectSectionEntries(doc).map((e) => e.courseId),
    ["100", "101"],
  );
});
test("partial extraction reports failed IDs and retries only the failures", async () => {
  const root = new JSDOM(
    '<div data-automation-id="selectedItem_15194$100"></div><div data-automation-id="selectedItem_15194$101"></div>',
  ).window.document;
  const result = await extractCoursesData({
    root,
    fetchCourse: async (id) => {
      if (id === "101") throw new Error("Offline");
      return course({ workdayCourseId: id });
    },
  });
  assert.equal(result.status, "partial");
  assert.equal(result.successCount, 1);
  assert.equal(result.failures[0].courseId, "101");
  const retried = [];
  const retry = await extractCoursesData({
    root,
    entries: result.failures,
    fetchCourse: async (id) => {
      retried.push(id);
      return course({ workdayCourseId: id });
    },
  });
  assert.equal(retry.status, "complete");
  assert.deepEqual(retried, ["101"]);
  const failed = await extractCoursesData({
    root,
    fetchCourse: async () => {
      throw new Error("Offline");
    },
  });
  assert.equal(failed.status, "failed");
});
test("no detected IDs, explicit empty schedules, and logged-out pages differ", async () => {
  for (const [html, status] of [
    ["<main></main>", "unsupported"],
    ['<div data-automation-id="noDataMessage"></div>', "empty"],
    ['<input type="password">', "logged-out"],
  ]) {
    const result = await extractCoursesData({ root: new JSDOM(html).window.document });
    assert.equal(result.status, status);
  }
});
