import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { course } from "./fixtures/courses.mjs";
import {
  createBackup,
  parseWstSchedule,
  planScheduleImport,
} from "../src/core/scheduleBackup.js";
import {
  createScheduleNotesButton,
  openScheduleNotes,
} from "../src/mainPanel/schedules/scheduleNotes.js";
import { mountPlanner } from "../src/mainPanel/schedules/plannerController.js";
const plan = (name = "Plan", id = "source") => ({
  id,
  name,
  courses: [course()],
  notes: "Remember the lab",
  isFavorite: true,
  savedAt: "2026-10-29",
  colorAssignments: null,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
const domSetup = () => {
  const dom = new JSDOM(
    '<button id="opener">Notes</button><div id="grid"></div><div id="menu"><button data-planner-action="import">Import WST schedule</button></div>',
  );
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  document.querySelector("#opener").focus();
  return dom;
};

test("single schedule import retains its name/notes, always adds a copy and fills the first available suffix", () => {
  const incoming = parseWstSchedule(
    JSON.stringify(createBackup([plan()], { wdTimeFormat: "24h" })),
  );
  assert.equal(
    planScheduleImport([], incoming, () => "one").imported.name,
    "Plan",
  );
  const existing = [plan(), plan("Plan (1)", "one"), plan("Plan (3)", "three")],
    before = JSON.stringify(existing);
  const result = planScheduleImport(existing, incoming, () => "new");
  assert.equal(result.imported.name, "Plan (2)");
  assert.equal(result.imported.notes, "Remember the lab");
  assert.equal(result.imported.isFavorite, false);
  assert.equal(result.schedules[0].isFavorite, true);
  assert.equal(result.schedules.length, 4);
  assert.equal(JSON.stringify(existing), before);
  assert.equal(
    planScheduleImport(result.schedules, incoming, () => "next").imported.name,
    "Plan (4)",
  );
  assert.equal(
    planScheduleImport([plan("  PLAN  ")], incoming, () => "case").imported
      .name,
    "Plan (1)",
  );
});

test("single import rejects multi-plan/empty files, oversized notes, capacity and duplicate generated IDs", () => {
  assert.throws(
    () =>
      parseWstSchedule(
        JSON.stringify(
          createBackup(
            [plan(), { ...plan("Other", "other"), isFavorite: false }],
            {},
          ),
        ),
      ),
    /exactly one/,
  );
  assert.throws(
    () => parseWstSchedule(JSON.stringify(createBackup([], {}))),
    /exactly one/,
  );
  assert.throws(
    () => createBackup([{ ...plan(), notes: "x".repeat(10001) }], {}),
    /notes/,
  );
  assert.throws(
    () =>
      planScheduleImport(
        Array.from({ length: 10 }, (_, i) => plan(String(i), String(i))),
        plan(),
      ),
    /up to 10/,
  );
  assert.throws(
    () => planScheduleImport([plan()], plan(), () => "source"),
    /new schedule ID/,
  );
});

test("selecting one WST file adds a plan without changing the working draft or settings; multiple files do not write", async () => {
  const dom = domSetup(),
    working = [course({ code: "WORK 100" })],
    state = {
      courses: working,
      savedSchedules: [plan()],
      view: { timeFormat: "am/pm" },
      currentSavedScheduleId: "source",
    };
  let writes = 0;
  const ui = {
    root: document.body,
    scheduleGrid: document.querySelector("#grid"),
    exportMenu: document.querySelector("#menu"),
  };
  mountPlanner(ui, {
    getState: () => state,
    saveSchedules: async (next) => {
      writes++;
      state.savedSchedules = next;
    },
  });
  document.querySelector("[data-planner-action=import]").click();
  await tick();
  const input = document.querySelector("input[type=file]"),
    file = {
      size: 2000,
      text: async () =>
        JSON.stringify(createBackup([plan()], { wdTimeFormat: "24h" })),
    };
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file, file],
  });
  input.dispatchEvent(new dom.window.Event("change"));
  await tick();
  assert.equal(writes, 0);
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new dom.window.Event("change"));
  await tick();
  assert.equal(writes, 1);
  assert.equal(state.savedSchedules.at(-1).name, "Plan (1)");
  assert.equal(state.courses, working);
  assert.equal(state.view.timeFormat, "am/pm");
  assert.equal(state.currentSavedScheduleId, "source");
  assert.equal(document.querySelector("dialog select"), null);
  assert.match(
    document.querySelector("[role=status]").textContent,
    /Imported "Plan \(1\)"/,
  );
  dom.window.close();
});

test("notes open read-only, render HTML literally, support cancel/save and round-trip with a schedule file", async () => {
  const dom = domSetup();
  let schedules = [
      { ...plan(), notes: "First line\n<img src=x onerror=alert(1)>" },
    ],
    writes = 0;
  const action = createScheduleNotesButton(schedules[0]);
  document.body.append(action);
  assert.equal(action.dataset.action, "notes");
  const dialog = openScheduleNotes(
    { root: document.body },
    {
      scheduleId: "source",
      getSchedules: () => schedules,
      saveSchedules: async (next) => {
        writes++;
        schedules = next;
      },
    },
  );
  assert.equal(document.querySelector("textarea"), null);
  assert.equal(document.activeElement.textContent, "Close");
  assert.equal(document.querySelector("img"), null);
  assert.match(
    document.querySelector(".schedule-notes-text").textContent,
    /<img/,
  );
  const button = (text) =>
    [...document.querySelectorAll("dialog button")].find(
      (b) => b.textContent === text,
    );
  button("Edit note").click();
  document.querySelector("textarea").value = "Cancelled draft";
  button("Cancel").click();
  assert.equal(writes, 0);
  assert.match(
    document.querySelector(".schedule-notes-text").textContent,
    /First line/,
  );
  button("Edit note").click();
  document.querySelector("textarea").value = "Updated note\nSecond line";
  button("Save note").click();
  await tick();
  assert.equal(writes, 1);
  assert.equal(schedules[0].notes, "Updated note\nSecond line");
  assert.equal(document.querySelector("textarea"), null);
  assert.equal(
    parseWstSchedule(JSON.stringify(createBackup(schedules, {}))).notes,
    schedules[0].notes,
  );
  dialog.close();
  dom.window.close();
});

test("note save failures keep the editor and existing note, while stale or deleted schedules are protected", async () => {
  const dom = domSetup();
  let schedules = [plan()],
    writes = 0;
  openScheduleNotes(
    { root: document.body },
    {
      scheduleId: "source",
      getSchedules: () => schedules,
      saveSchedules: async () => {
        writes++;
        throw new Error("Storage quota exceeded");
      },
    },
  );
  const button = (text) =>
    [...document.querySelectorAll("dialog button")].find(
      (b) => b.textContent === text,
    );
  button("Edit note").click();
  document.querySelector("textarea").value = "Unsaved draft";
  button("Save note").click();
  await tick();
  assert.equal(schedules[0].notes, "Remember the lab");
  assert.equal(document.querySelector("textarea").value, "Unsaved draft");
  assert.match(document.querySelector("[role=status]").textContent, /quota/);
  assert.equal(document.querySelector("[role=status]").dataset.tone, "error");
  schedules = [{ ...plan(), notes: "Changed in another tab" }];
  button("Save note").click();
  await tick();
  assert.equal(writes, 1);
  assert.match(
    document.querySelector("[role=status]").textContent,
    /another window/,
  );
  schedules = [];
  button("Save note").click();
  await tick();
  assert.equal(writes, 1);
  assert.match(document.querySelector("[role=status]").textContent, /deleted/);
  dom.window.close();
});

test("saving a note prevents repeated submissions and restores the reading action after completion", async () => {
  const dom = domSetup();
  let schedules = [plan()], writes = 0, finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const dialog = openScheduleNotes({ root: document.body }, {
    scheduleId: "source", getSchedules: () => schedules,
    saveSchedules: async (next) => { writes++; await pending; schedules = next; },
  });
  const find = (text) => [...document.querySelectorAll("dialog button")].find((b) => b.textContent === text);
  find("Edit note").click();
  document.querySelector("textarea").value = "Only save once";
  const save = find("Save note");
  save.click(); save.click();
  assert.equal(writes, 1);
  assert.equal(save.getAttribute("aria-busy"), "true");
  assert.equal(find("Cancel").disabled, true);
  finish(); await tick();
  assert.equal(schedules[0].notes, "Only save once");
  assert.equal(document.activeElement, find("Edit note"));
  assert.equal(document.querySelector("[role=status]").dataset.tone, "success");
  dialog.close();
  assert.equal(document.activeElement.id, "opener");
  dom.window.close();
});
