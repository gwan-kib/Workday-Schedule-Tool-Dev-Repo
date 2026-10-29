import test from "node:test";
import assert from "node:assert/strict";
import { getScheduleSaveState } from "../src/core/scheduleSaveState.js";
import { assignCourseColors } from "../src/mainPanel/settings/courseColorSettings.js";

const courses = () => [
  { code: "TEST 101", section_number: "001", meetingLines: ["Monday 10:00 - 11:00"] },
  { code: "TEST 102", section_number: "001", meetingLines: ["Tuesday 10:00 - 11:00"] },
];
const savedState = () => ({
  courses: courses(),
  savedSchedules: [{ id: "source", name: "My plan", courses: courses() }],
  currentSavedScheduleId: "source",
});

test("legacy snapshots match after derived colours are assigned, without mutating saved courses", () => {
  const state = savedState();
  const original = structuredClone(state.savedSchedules);
  assignCourseColors(state.courses);
  state.courses.reverse();
  state.query = "TEST 101";
  state.filtered = [state.courses[0]];
  state.view = { timeFormat: "24h", week: 2 };
  assert.equal(getScheduleSaveState(state).status, "saved");
  assert.deepEqual(state.savedSchedules, original);
});

test("course additions, removals, meeting changes and manual colours are unsaved edits with a source", () => {
  const edits = [
    (state) => state.courses.pop(),
    (state) => state.courses.push({ code: "TEST 103", section_number: "L01" }),
    (state) => state.courses[0].meetingLines.push("Friday 10:00 - 11:00"),
    (state) => { state.courses[0].manualColorIndex = 8; },
  ];
  for (const edit of edits) {
    const state = savedState();
    edit(state);
    const result = getScheduleSaveState(state);
    assert.equal(result.status, "working");
    assert.equal(result.saved.id, "source");
  }
});

test("empty schedules always use the empty status, including a linked saved schedule", () => {
  const state = savedState();
  state.courses = [];
  assert.equal(getScheduleSaveState(state).label, "No courses added yet");
  assert.equal(getScheduleSaveState(state).saved.id, "source");
  state.savedSchedules[0].courses = [];
  assert.equal(getScheduleSaveState(state).status, "empty");
});

test("identical courses without an existing source do not count as saved", () => {
  const state = savedState();
  state.currentSavedScheduleId = null;
  assert.equal(getScheduleSaveState(state).status, "working");
  state.currentSavedScheduleId = "deleted";
  assert.equal(getScheduleSaveState(state).saved, null);
  assert.equal(getScheduleSaveState(state).label, "Working - not saved");
});
