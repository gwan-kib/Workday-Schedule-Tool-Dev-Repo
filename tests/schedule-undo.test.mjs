import test from "node:test";
import assert from "node:assert/strict";
import { captureScheduleChange as capture, createScheduleUndoHistory } from "../src/core/scheduleUndo.js";
const course = (code) => ({ code, section_number: "001", meetingLines: [], manualColorIndex: 2 });
const plan = (id = "alpha", name = "Alpha") => ({ id, name, courses: [course("A 100"), course("B 100")], savedAt: "2026-10-29", notes: "Keep the lab", isFavorite: true });
const state = () => ({ courses: [], savedSchedules: [plan()], currentSavedScheduleId: null, currentScheduleName: null, syncPlanId: "draft", syncPlanName: "Working Schedule" });
const change = (history, state, action, label = "change") => {
  const before = capture(state); action(state); return history.record(before, capture(state), label);
};
const undo = (history, state) => {
  const next = history.plan(state);
  if (!next) return;
  state.savedSchedules = next.savedSchedules;
  if (next.working) Object.assign(state, next.working);
  history.commit(next);
};
const redo = (history, state) => {
  const next = history.plan(state, "redo");
  if (!next) return;
  state.savedSchedules = next.savedSchedules;
  if (next.working) Object.assign(state, next.working);
  history.commit(next);
};

test("Undo ignores no-op and metadata-only actions, including repeatedly clearing an empty draft", () => {
  const s = state(), history = createScheduleUndoHistory();
  assert.equal(history.plan(s), null);
  assert.equal(change(history, s, (s) => { s.syncPlanId = "another-empty-draft"; }), false);
  assert.equal(change(history, s, (s) => { s.savedSchedules[0].name = "Renamed"; s.savedSchedules[0].notes = "Updated notes"; }), false);
  assert.equal(history.canUndo, false);
});

test("course additions, removals, group replacements and Clear undo in order with independent snapshots", () => {
  const s = state(), history = createScheduleUndoHistory();
  change(history, s, (s) => { s.courses.push(course("A 100")); }, "Add A");
  change(history, s, (s) => { s.courses.push(course("B 100")); }, "Add B");
  change(history, s, (s) => { s.courses.shift(); }, "Remove A");
  change(history, s, (s) => { s.courses = [course("C 100"), course("D 100")]; }, "Replace group");
  change(history, s, (s) => { s.courses = []; }, "Clear");
  assert.equal(history.label, "Clear");
  undo(history, s); assert.deepEqual(s.courses.map((c) => c.code), ["C 100", "D 100"]);
  undo(history, s); assert.deepEqual(s.courses.map((c) => c.code), ["B 100"]);
  undo(history, s); assert.deepEqual(s.courses.map((c) => c.code), ["A 100", "B 100"]);
  undo(history, s); assert.deepEqual(s.courses.map((c) => c.code), ["A 100"]);
  undo(history, s); assert.deepEqual(s.courses, []);
  assert.equal(history.canUndo, false);
});

test("Undo saved deletion restores courses, notes, position and active source without overwriting another preference", () => {
  const s = state(), history = createScheduleUndoHistory();
  s.savedSchedules.push({ ...plan("beta", "Beta"), isFavorite: false });
  s.courses = structuredClone(s.savedSchedules[0].courses);
  s.currentSavedScheduleId = "alpha";
  change(history, s, (s) => { s.savedSchedules.shift(); s.currentSavedScheduleId = null; }, "Delete Alpha");
  s.savedSchedules[0].isFavorite = true;
  undo(history, s);
  assert.equal(s.savedSchedules[0].id, "alpha");
  assert.equal(s.savedSchedules[0].notes, "Keep the lab");
  assert.equal(s.savedSchedules[0].isFavorite, false);
  assert.equal(s.savedSchedules[1].isFavorite, true);
  assert.equal(s.currentSavedScheduleId, "alpha");
  assert.equal(s.syncPlanId, "alpha");
});

test("Undo a saved course update preserves later notes, names and unrelated saved plans", () => {
  const s = state(), history = createScheduleUndoHistory();
  change(history, s, (s) => { s.savedSchedules[0].courses.pop(); }, "Update Alpha");
  s.savedSchedules[0].name = "Renamed"; s.savedSchedules[0].notes = "New note";
  s.savedSchedules.push({ ...plan("beta", "Beta"), isFavorite: false });
  undo(history, s);
  assert.equal(s.savedSchedules[0].courses.length, 2);
  assert.equal(s.savedSchedules[0].name, "Renamed");
  assert.equal(s.savedSchedules[0].notes, "New note");
  assert.equal(s.savedSchedules[1].id, "beta");
});

test("Undo rejects newer saved course data without mutating state or consuming history", () => {
  const s = state(), history = createScheduleUndoHistory();
  change(history, s, (s) => { s.savedSchedules.push({ ...plan("beta", "Beta"), isFavorite: false }); }, "Import Beta");
  s.savedSchedules[1].courses.push(course("NEW 100"));
  const before = structuredClone(s);
  assert.throws(() => history.plan(s), /changed in another window/);
  assert.deepEqual(s, before);
  assert.equal(history.canUndo, true);
});

test("restoration respects the saved limit and resolves name collisions without replacing records", () => {
  const s = state(), history = createScheduleUndoHistory();
  change(history, s, (s) => { s.savedSchedules = []; }, "Delete Alpha");
  s.savedSchedules = Array.from({ length: 10 }, (_, i) => ({ ...plan(String(i), i ? `Plan ${i}` : "Alpha"), isFavorite: false }));
  assert.throws(() => history.plan(s), /limit: 10/);
  s.savedSchedules.pop(); undo(history, s);
  assert.equal(s.savedSchedules[0].name, "Alpha (1)");
  assert.equal(s.savedSchedules[0].id, "alpha");
  assert.equal(s.savedSchedules.length, 10);
});

test("Undo preserves later manual colors on remaining courses and does not revive a separately deleted source", () => {
  const s = state(), history = createScheduleUndoHistory();
  s.currentSavedScheduleId = "alpha"; s.courses = structuredClone(s.savedSchedules[0].courses);
  change(history, s, (s) => { s.courses.pop(); }, "Remove B");
  s.courses[0].manualColorIndex = 7; s.savedSchedules = [];
  undo(history, s);
  assert.equal(s.courses[0].manualColorIndex, 7);
  assert.equal(s.courses.length, 2);
  assert.equal(s.currentSavedScheduleId, null);
});

test("history is bounded and planning a restore leaves data unchanged until a successful commit", () => {
  const s = state(), history = createScheduleUndoHistory(2);
  for (const code of ["A", "B", "C"]) change(history, s, (s) => { s.courses.push(course(code)); });
  const before = structuredClone(s), next = history.plan(s);
  assert.deepEqual(s, before);
  assert.equal(history.canUndo, true);
  assert.equal(history.plan(s).token, next.token);
  undo(history, s); undo(history, s);
  assert.equal(history.canUndo, false);
  assert.deepEqual(s.courses.map((c) => c.code), ["A"]);
});

test("Redo reapplies course additions, removals, group replacement and Clear in original order", () => {
  const s = state(), history = createScheduleUndoHistory();
  assert.equal(history.canRedo, false);
  assert.equal(history.plan(s, "redo"), null);
  change(history, s, (s) => { s.courses = [course("A")]; }, "Add A");
  change(history, s, (s) => { s.courses.push(course("B")); }, "Add B");
  change(history, s, (s) => { s.courses.shift(); }, "Remove A");
  change(history, s, (s) => { s.courses = [course("C"), course("D")]; }, "Load group");
  change(history, s, (s) => { s.courses = []; }, "Clear");
  for (let i = 0; i < 5; i++) undo(history, s);
  assert.equal(history.redoLabel, "Add A");
  for (const expected of [["A"], ["A", "B"], ["B"], ["C", "D"], []]) {
    redo(history, s); assert.deepEqual(s.courses.map((c) => c.code), expected);
  }
  assert.equal(history.canRedo, false);
  assert.equal(history.canUndo, true);
  undo(history, s); assert.deepEqual(s.courses.map((c) => c.code), ["C", "D"]);
});

test("new course actions clear Redo, while no-op and metadata-only actions preserve it", () => {
  const s = state(), history = createScheduleUndoHistory();
  change(history, s, (s) => { s.courses.push(course("A")); }); undo(history, s);
  assert.equal(change(history, s, (s) => { s.savedSchedules[0].notes = "New notes"; }), false);
  assert.equal(change(history, s, () => {}), false);
  assert.equal(history.canRedo, true);
  change(history, s, (s) => { s.courses.push(course("B")); });
  assert.equal(history.canRedo, false);
  undo(history, s); redo(history, s);
  assert.deepEqual(s.courses.map((c) => c.code), ["B"]);
});

test("Redo saved deletion uses the actual restored record after a name collision", () => {
  const s = state(), history = createScheduleUndoHistory();
  change(history, s, (s) => { s.savedSchedules = []; }, "Delete Alpha");
  s.savedSchedules.push({ ...plan("other", "Alpha"), isFavorite: false });
  undo(history, s);
  assert.equal(s.savedSchedules.find((p) => p.id === "alpha").name, "Alpha (1)");
  redo(history, s);
  assert.deepEqual(s.savedSchedules.map((p) => p.id), ["other"]);
  undo(history, s);
  assert.equal(s.savedSchedules.find((p) => p.id === "alpha").name, "Alpha (1)");
  assert.equal(s.savedSchedules.find((p) => p.id === "alpha").notes, "Keep the lab");
});

test("Redo a saved addition retains metadata captured at Undo and preserves a newer preference", () => {
  const s = state(), history = createScheduleUndoHistory();
  change(history, s, (s) => { s.savedSchedules.push({ ...plan("beta", "Beta"), isFavorite: false }); }, "Import Beta");
  s.savedSchedules[1].name = "Renamed Beta"; s.savedSchedules[1].notes = "Edited after import";
  undo(history, s); redo(history, s);
  assert.equal(s.savedSchedules[1].name, "Renamed Beta");
  assert.equal(s.savedSchedules[1].notes, "Edited after import");
  assert.equal(s.savedSchedules[0].isFavorite, true);
});

test("Redo saved course updates preserves later notes and rejects newer course data", () => {
  const s = state(), history = createScheduleUndoHistory();
  change(history, s, (s) => { s.savedSchedules[0].courses.pop(); }, "Quick Save");
  undo(history, s); s.savedSchedules[0].notes = "Newer note";
  redo(history, s);
  assert.equal(s.savedSchedules[0].courses.length, 1);
  assert.equal(s.savedSchedules[0].notes, "Newer note");
  undo(history, s); s.savedSchedules[0].courses.push(course("EXTERNAL"));
  const before = structuredClone(s);
  assert.throws(() => history.plan(s, "redo"), /Redo was not applied/);
  assert.deepEqual(s, before);
  assert.equal(history.canRedo, true);
});

test("Redo respects capacity and keeps its step available when restoration is blocked", () => {
  const s = state(), history = createScheduleUndoHistory();
  change(history, s, (s) => { s.savedSchedules.push({ ...plan("beta", "Beta"), isFavorite: false }); }, "Import Beta");
  undo(history, s);
  for (let i = 0; i < 9; i++) s.savedSchedules.push({ ...plan(String(i), `Plan ${i}`), isFavorite: false });
  assert.throws(() => history.plan(s, "redo"), /limit: 10/);
  assert.equal(s.savedSchedules.length, 10);
  assert.equal(history.canRedo, true);
  s.savedSchedules.pop(); redo(history, s);
  assert.equal(s.savedSchedules.length, 10);
  assert.equal(s.savedSchedules.some((p) => p.id === "beta"), true);
});
