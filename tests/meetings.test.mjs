import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSchedule,
  normalizeMeeting,
  parseLocalDate,
  dateNumber,
  courseDateRange,
  meetingsOverlap,
  zonedInstant,
} from "../src/core/meetings.js";
import { scheduleLayout } from "../src/core/scheduleLayout.js";
import { detectScheduleConflicts } from "../src/mainPanel/schedules/scheduleCollisions.js";
import { course, line } from "./fixtures/courses.mjs";
import { debugLog } from "../src/utilities/debugTool.js";
debugLog({ global: false });

test("validates impossible dates and times without silent correction", () => {
  for (const bad of [
    line("Mon", "13:00 p.m. - 2:00 p.m."),
    line("Mon", "9:70 a.m. - 10:00 a.m."),
    line("Mon", "9:00 a.m. - 8:00 a.m."),
    line("Mon", undefined, "2026-02-30 - 2026-03-30"),
  ]) {
    assert.equal(normalizeMeeting(course(), bad).diagnostic.code, "invalid");
  }
  assert.equal(dateNumber("2024-02-29") !== null, true);
  assert.equal(dateNumber("2025-02-29"), null);
});
test("date-only values retain local calendar dates", () => {
  for (const date of ["2026-09-01", "2026-12-31", "2027-01-01", "2024-02-29"]) {
    const d = parseLocalDate(date);
    assert.equal(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      date,
    );
  }
});
test("uses all meeting windows, including summer and year boundaries", () => {
  const c = course({
    meetingLines: [
      line(),
      line("Fri", undefined, "2027-01-01 - 2027-04-15"),
      line("Mon", undefined, "2027-05-01 - 2027-08-15"),
    ],
  });
  assert.deepEqual(courseDateRange(c), { startDate: "2026-09-01", endDate: "2027-08-15" });
  const layout = scheduleLayout([c]);
  assert.equal(layout.meetings.length, 3);
  assert.equal(scheduleLayout([c], 1).meetings.length, 3);
  assert.equal(scheduleLayout([c], 2).meetings.length, 3);
});
test("unknown and unanchored alternating meetings remain visible with diagnostics", () => {
  const c = course({ meetingLines: [line("Mon (Alternate Weeks)")] });
  const normalized = normalizeSchedule([c, course({ meetingLines: [] })]);
  assert.equal(normalized.meetings.length, 0);
  assert.equal(normalized.unknownCourses.length, 2);
  assert.equal(normalized.diagnostics[0].code, "uncertain-recurrence");
});
test("alternating parity and verified exceptions control actual meeting dates", () => {
  const a = normalizeSchedule([
    course({
      meetingLines: [line("Mon (Alternate Weeks)")],
      meetingAnchors: ["2026-09-07"],
      meetingExceptions: [["2026-09-21"]],
    }),
  ]).meetings[0];
  assert.ok(a.dates.includes("2026-09-07"));
  assert.ok(!a.dates.includes("2026-09-14"));
  assert.ok(!a.dates.includes("2026-09-21"));
  const b = normalizeSchedule([
    course({ meetingLines: [line("Mon (Alternate Weeks)")], meetingAnchors: ["2026-09-14"] }),
  ]).meetings[0];
  assert.equal(meetingsOverlap(a, b), false);
});
test("weekend columns and hours appear only when required", () => {
  const normal = scheduleLayout([course()]);
  assert.deepEqual(normal.days, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  assert.equal(normal.slots[0], 480);
  assert.equal(normal.slots.at(-1), 1260);
  const extended = scheduleLayout([
    course({ meetingLines: [line("Sat", "7:00 a.m. - 8:00 a.m."), line("Sun", "10:00 p.m. - 11:00 p.m.")] }),
  ]);
  assert.equal(extended.days.length, 7);
  assert.equal(extended.slots[0], 420);
  assert.equal(extended.slots.at(-1), 1380);
  assert.equal(extended.eventsByDay.get("Sun").length, 1);
});
test("minute-accurate conflicts exclude touching, disjoint terms, and opposite weeks", () => {
  const conflict = (a, b) => detectScheduleConflicts(scheduleLayout([a, b]).eventsByDay).conflictBlocks.length;
  const a = course();
  assert.equal(conflict(a, course({ code: "TEST 102", meetingLines: [line("Mon Wed", "9:20 a.m. - 9:50 a.m.")] })), 0);
  assert.ok(conflict(a, course({ code: "TEST 102", meetingLines: [line("Mon Wed", "9:19 a.m. - 9:50 a.m.")] })) > 0);
  assert.equal(
    conflict(a, course({ code: "TEST 102", meetingLines: [line("Mon Wed", undefined, "2027-01-01 - 2027-04-15")] })),
    0,
  );
  const layout = scheduleLayout([a]);
  assert.equal(layout.eventsByDay.get("Mon")[0].rowSpan, 20 / 30);
});
test("Vancouver wall time stays fixed while UTC changes across DST", () => {
  assert.equal(zonedInstant("2026-10-26", 540).toISOString(), "2026-10-26T16:00:00.000Z");
  assert.equal(zonedInstant("2026-11-02", 540).toISOString(), "2026-11-02T17:00:00.000Z");
});
test("nonexistent and ambiguous DST wall times become diagnostics", () => {
  for (const [date, time] of [
    ["2026-03-08", "2:15 a.m. - 2:45 a.m."],
    ["2026-11-01", "1:15 a.m. - 1:45 a.m."],
  ]) {
    const result = normalizeSchedule([course({ meetingLines: [line("Sun", time, `${date} - ${date}`)] })]);
    assert.equal(result.meetings.length, 0);
    assert.equal(result.diagnostics[0].code, "uncertain-timezone");
  }
});
