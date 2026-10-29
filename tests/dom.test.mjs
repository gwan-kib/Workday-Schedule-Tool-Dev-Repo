import { gradeResultText, renderGradeAverageHint } from "../src/api/averageGrades/gradeResultView.js";
import { loadAverageForButton, getCourseAverageState } from "../src/mainPanel/courses/courseLookupController.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { course, line, workdayJson } from "./fixtures/courses.mjs";
import { loadMainPanel } from "../src/mainPanel/shell/loadMainPanel.js";
import { renderCourseObjects } from "../src/mainPanel/courses/renderCourseObjects.js";
import { renderSchedule } from "../src/mainPanel/schedules/scheduleView.js";
import { debugLog } from "../src/utilities/debugTool.js";
debugLog({ global: false });

const root = new URL("../", import.meta.url);
async function asset(url) {
  const path = String(url)
    .replace(/^\w+-extension:\/\/test\//, "")
    .replace(/^dist\//, "src/");
  return new Response(await readFile(new URL(path, root), "utf8"));
}
function globals(dom, scheme = "chrome-extension") {
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.getComputedStyle = dom.window.getComputedStyle;
  globalThis.chrome = { runtime: { getURL: (path) => `${scheme}://test/${path}` } };
  globalThis.fetch = asset;
}
test("Chrome Google actions dispatch while Firefox actions are intercepted", async () => {
  for (const [scheme, blocked] of [
    ["chrome-extension", false],
    ["moz-extension", true],
  ]) {
    const dom = new JSDOM("<html><head></head><body></body></html>");
    globals(dom, scheme);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const ui = await loadMainPanel(host.attachShadow({ mode: "open" }));
    const logo = ui.root.querySelector("#widget-logo");
    assert.ok(logo.src.startsWith("data:image/png;base64,"));
    assert.deepEqual(Buffer.from(logo.src.split(",")[1], "base64"), await readFile(new URL("icon48.png", root)));
    assert.equal(logo.nextElementSibling.id, "widget-title");
    for (const control of [ui.googleSyncButton, ui.googleSignInButton, ui.googleSignOutButton]) {
      let calls = 0;
      control.addEventListener("click", () => calls++);
      control.click();
      assert.equal(calls, blocked ? 0 : 1);
      assert.equal(control.getAttribute("aria-disabled"), blocked ? "true" : null);
    }
    dom.window.close();
  }
});
test("untrusted instructor/timetable labels stay literal and rendering does not fetch or mutate", () => {
  const dom = new JSDOM('<div id="list"></div><div id="grid"></div>');
  globals(dom);
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches++;
    throw new Error("Unexpected render fetch");
  };
  const malicious = '<img src=x onerror="alert(1)"> & "quoted"';
  const c = Object.freeze(course({ code: malicious, title: malicious, instructor: malicious }));
  const ui = { tableBody: document.querySelector("#list"), scheduleGrid: document.querySelector("#grid") };
  renderCourseObjects(ui, [c]);
  renderSchedule(ui, [c]);
  assert.equal(document.querySelectorAll("img").length, 0);
  assert.ok(document.querySelector(".course-card__instructor").textContent.includes(malicious));
  assert.ok(document.querySelector(".schedule-entry-title").textContent.includes(malicious));
  assert.equal(fetches, 0);
  assert.equal(c.workdayCourseLink, undefined);
  dom.window.close();
});
test("week toggle keeps weekly classes and switches opposite-week sections", () => {
  const dom = new JSDOM('<div class="schedule-controls"><div id="pill"></div></div><div id="grid"></div>');
  globals(dom);
  const ui = {
    scheduleGrid: document.querySelector("#grid"),
    scheduleTermPill: document.querySelector("#pill"),
    scheduleControls: document.querySelector(".schedule-controls"),
    scheduleName: "Fall Plan",
  };
  const range = "2026-09-07 - 2026-12-15";
  const courses = [
    course({ code: "WEEKLY 101", meetingLines: [line("Mon", undefined, range)] }),
    course({
      code: "LABONE 201",
      isLab: true,
      meetingLines: [line("Mon (Alternate Weeks)", undefined, range)],
      meetingAnchors: ["2026-09-07"],
    }),
    course({
      code: "LABTWO 202",
      isLab: true,
      meetingLines: [line("Mon (Alternate Weeks)", undefined, range)],
      meetingAnchors: ["2026-09-14"],
    }),
    course({ code: "UNKNOWN 203", meetingLines: [] }),
  ];
  const before = JSON.stringify(courses);
  renderSchedule(ui, courses);
  assert.equal(document.querySelector("select"), null);
  assert.equal(ui.scheduleControls.querySelectorAll(".schedule-week-toggle").length, 1);
  assert.equal(ui.scheduleControls.querySelectorAll(".schedule-week-note").length, 1);
  assert.equal(ui.scheduleControls.querySelector(".schedule-week-toggle").nextElementSibling.textContent,
    "(Incase course sections are biweekly)");
  assert.equal(ui.scheduleGrid.querySelector(".schedule-week-toggle"), null);
  assert.equal(ui.scheduleTermPill.firstElementChild.textContent, "Fall Plan");
  assert.equal(ui.scheduleTermPill.lastElementChild.textContent, "Winter Term 1");
  assert.equal(document.querySelector(".schedule-unknown h3").textContent, "Meeting Times Unknown");
  const titles = () => [...document.querySelectorAll(".schedule-entry-title")].map((n) => n.textContent).join(" ");
  assert.match(titles(), /WEEKLY 101/);
  assert.match(titles(), /LABONE 201/);
  assert.ok(!titles().includes("LABTWO 202"));
  document.querySelector('[data-week="2"]').click();
  assert.equal(document.querySelector('[data-week="2"]').getAttribute("aria-pressed"), "true");
  assert.match(titles(), /WEEKLY 101/);
  assert.match(titles(), /LABTWO 202/);
  assert.ok(!titles().includes("LABONE 201"));
  assert.equal(ui.selectedScheduleWeek, 2);
  assert.equal(ui.scheduleControls.querySelectorAll(".schedule-week-toggle").length, 1);
  assert.equal(ui.scheduleControls.querySelectorAll(".schedule-week-note").length, 1);
  assert.equal(ui.scheduleControls.querySelector(".schedule-week-toggle").nextElementSibling.textContent,
    "(Incase course sections are biweekly)");
  assert.equal(ui.scheduleTermPill.lastElementChild.textContent, "Winter Term 1");
  document.querySelector(".schedule-time-toggle").click();
  assert.equal(document.querySelector('[data-week="2"]').getAttribute("aria-pressed"), "true");
  assert.equal(JSON.stringify(courses), before);
  dom.window.close();
});

test("grades show one number and a separate focusable five-year hover control", () => {
  const dom = new JSDOM('<div id="actions"><button id="average"></button></div>');
  globals(dom);
  const button = document.querySelector("#average");
  const text = gradeResultText({ latest: { average: 80 }, fiveYear: { average: 75.5 } });
  button.textContent = text.summary;
  renderGradeAverageHint(button, text.tooltip);
  assert.equal(button.textContent, "Average: 80.0%");
  const hint = button.nextElementSibling;
  assert.equal(hint.classList.contains("grade-average-hint"), true);
  assert.equal(hint.dataset.tooltip, "5-year average: 75.5%");
  assert.equal(hint.tabIndex, 0);
  assert.equal(hint.querySelector(".material-symbols-rounded").textContent, "info");
  renderGradeAverageHint(button, "5-year average: N/A");
  assert.equal(document.querySelectorAll(".grade-average-hint").length, 1);
  assert.equal(document.querySelector(".grade-result-details"), null);
  assert.equal(gradeResultText({ latest: null, fiveYear: { average: null } }).summary, "Average: N/A");
  dom.window.close();
});

const waitFor = async (check) => {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("UI did not reach expected state");
};
test("packaged content preserves saved sources, confirms overwrites and reports persistence status", async (t) => {
  const body = Array.from(
    { length: 5 },
    (_, i) => `<div data-automation-id="selectedItem_15194$${100 + i}"></div>`,
  ).join("");
  const dom = new JSDOM(`<html><head></head><body>${body}</body></html>`, {
    url: "https://example.myworkday.com/ubc/home.htmld",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  let data = {},
    failure = false,
    lastError = null,
    failCourse = false,
    signedIn = false,
    delayWrites = false,
    pendingWrite = null;
  const storageListeners = new Set();
  const calendarMessages = [];
  w.structuredClone = structuredClone;
  w.Response = Response;
  w.console = { ...console, log() {}, debug() {}, warn() {} };
  w.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      get lastError() {
        return lastError;
      },
      sendMessage(message, callback) {
        calendarMessages.push(message);
        if (message.type === "PREVIEW_GCAL")
          callback({
            ok: true,
            preview: {
              previewId: "fixture-preview",
              planName: "Complete plan",
              additions: 0,
              updates: 0,
              removals: 0,
              unchanged: 5,
              skipped: 0,
              skippedItems: [],
              legacy: 13,
              windows: ["2026-09-01 - 2026-12-15"],
            },
          });
        else if (message.type === "SYNC_GCAL")
          callback({
            ok: true,
            summary: { added: 0, updated: 0, removed: 0, unchanged: 5, failed: 0, skipped: 0, deleteFailed: 0 },
          });
        else callback({ ok: true, signedIn });
      },
    },
    storage: {
      onChanged: {
        addListener: (listener) => storageListeners.add(listener),
        removeListener: (listener) => storageListeners.delete(listener),
      },
      local: {
        get(keys, callback) {
          callback(structuredClone(data));
        },
        set(values, callback) {
          const finish = () => {
            lastError = failure ? { message: "QUOTA_BYTES exceeded" } : null;
            if (!failure) data = { ...data, ...structuredClone(values) };
            callback();
            lastError = null;
          };
          if (delayWrites) pendingWrite = finish;
          else finish();
        },
      },
    },
  };
  w.fetch = async (url) => {
    if (String(url).startsWith("chrome-extension:")) return asset(url);
    const id = String(url).match(/15194\$(\d+)/)?.[1];
    if (!id) throw new Error(`Unexpected URL ${url}`);
    if (failCourse && id === "102") return new Response("Unavailable", { status: 400 });
    const json = structuredClone(workdayJson);
    json.title.instances[0].text = `TEST_O ${id} - 001 - Course ${id}`;
    json.body.children[1].children[0].instances = [{ text: "N/A" }];
    json.body.children[1].children[1].instances = [{ text: "Laboratory" }];
    return new Response(JSON.stringify(json), { headers: { "Content-Type": "application/json" } });
  };
  w.eval(await readFile(new URL("dist/content.js", root), "utf8"));
  const shadow = () => w.document.getElementById("UBC Workday - Schedule Tool")?.shadowRoot;
  await waitFor(() => shadow()?.querySelectorAll(".course-card").length === 5);
  const s = shadow(),
    search = s.querySelector("#widget-search");
  assert.equal(s.querySelector("#course-schedule-heading").firstElementChild.textContent, "Working Schedule");
  assert.equal(s.querySelector("#schedule-term-pill").firstElementChild.textContent, "Working Schedule");
  assert.equal(s.querySelector("#course-schedule-heading").lastElementChild.textContent, "Multiple terms detected");
  assert.equal(s.querySelector("#schedule-term-pill").lastElementChild.textContent, "Multiple terms detected");
  const quickSave = s.querySelector("#widget-quick-save");
  const saveAsNew = s.querySelector("#widget-save-as-new");
  const assertStatus = (label, status) => {
    const chips = [...s.querySelectorAll(".schedule-status-chip")];
    assert.equal(chips.length, 2);
    for (const chip of chips) {
      assert.equal(chip.textContent, label);
      assert.equal(chip.dataset.status, status);
    }
  };
  assertStatus("Working - not saved", "working");
  assert.equal(quickSave.disabled, true);
  search.value = "Course 100";
  search.dispatchEvent(new w.Event("input"));
  await waitFor(() => s.querySelectorAll(".course-card").length === 1);
  s.querySelector("#widget-save-as-new").click();
  await waitFor(() => !s.querySelector("#schedule-save-modal").classList.contains("is-hidden"));
  s.querySelector("#schedule-modal-input").value = "Complete plan";
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => data.wdSavedSchedules?.length === 1);
  assert.equal(data.wdSavedSchedules[0].courses.length, 5);
  assertStatus("Saved Schedule", "saved");
  assert.equal(quickSave.disabled, false);
  const courseHeading = s.querySelector('[data-panel="course-list-panel"] .course-schedule-heading');
  assert.equal(courseHeading.firstElementChild.textContent, "Complete plan");
  assert.equal(courseHeading.lastElementChild.textContent, s.querySelector("#schedule-term-pill").lastElementChild.textContent);
  assert.equal(courseHeading.classList.contains("schedule-term-pill"), false);
  assert.equal(courseHeading.parentElement.className, "course-schedule-header");
  assert.equal(courseHeading.nextElementSibling.querySelectorAll("button").length, 2);
  assert.equal(s.querySelector("#widget-save-schedule"), null);
  s.querySelector(".schedule-saved-card").click();
  await waitFor(() => s.querySelectorAll(".course-card").length === 5);
  assert.equal(search.value, "");
  failure = true;
  s.querySelector("#widget-save-as-new").click();
  await waitFor(() => !s.querySelector("#schedule-save-modal").classList.contains("is-hidden"));
  s.querySelector("#schedule-modal-input").value = "Must not persist";
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => s.querySelector("#schedule-footer-notes").textContent.includes("QUOTA_BYTES"));
  assert.equal(data.wdSavedSchedules.length, 1);
  assert.equal(s.querySelectorAll(".schedule-saved-card").length, 1);
  // A partial refresh cannot replace the complete working schedule on cancel.
  search.value = "";
  search.dispatchEvent(new w.Event("input"));
  await waitFor(() => s.querySelectorAll(".course-card").length === 5);
  failCourse = true;
  s.querySelector("#widget-refresh").click();
  await waitFor(() => s.querySelector("#schedule-modal-title").textContent === "Incomplete import");
  assert.equal(s.querySelector("#schedule-loading-modal").classList.contains("is-hidden"), true);
  assert.equal(s.querySelectorAll(".course-card").length, 5);
  s.querySelector(".schedule-modal-cancel").click();
  await waitFor(() => s.querySelector("#schedule-modal-title").textContent === "Use incomplete schedule?");
  s.querySelector(".schedule-modal-cancel").click();
  assert.equal(s.querySelectorAll(".course-card").length, 5);
  // A no-op calendar sync still requires preview/confirmation; Cancel writes nothing.
  signedIn = true;
  s.querySelector('[data-export="gcal-sync"]').click();
  await waitFor(() => s.querySelector("#schedule-modal-title").textContent === "Confirm Google Calendar sync");
  assert.equal(calendarMessages.find((m) => m.type === "PREVIEW_GCAL").payload.courses.length, 5);
  assert.ok(!s.querySelector("#schedule-modal-message").textContent.includes("Dates:"));
  assert.match(s.querySelector("#schedule-modal-message").textContent, /Schedule Name: Complete plan/);
  assert.match(
    s.querySelector("#schedule-modal-message").textContent,
    /Adding: 0\nUpdating: 0\nRemoving: 0\nUnchanged: 5/,
  );
  assert.match(s.querySelector("#schedule-modal-message").textContent, /Skipped: None/);
  assert.ok(!s.querySelector("#schedule-modal-message").textContent.includes("older unscoped"));
  assert.match(s.querySelector("#schedule-modal-message").textContent, /\n\nHolidays and reading breaks/);
  assert.ok(
    s
      .querySelector("#schedule-modal-message")
      .textContent.includes("Holidays and reading breaks supplied by Workday are automatically excluded."),
  );
  assert.equal(calendarMessages.filter((m) => m.type === "SYNC_GCAL").length, 0);
  s.querySelector(".schedule-modal-cancel").click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calendarMessages.filter((m) => m.type === "SYNC_GCAL").length, 0);
  s.querySelector('[data-export="gcal-sync"]').click();
  await waitFor(() => !s.querySelector("#schedule-save-modal").classList.contains("is-hidden"));
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => calendarMessages.some((m) => m.type === "SYNC_GCAL"));
  assert.deepEqual(JSON.parse(JSON.stringify(calendarMessages.find((m) => m.type === "SYNC_GCAL").payload)), {
    previewId: "fixture-preview",
  });
  // Navigation preserves the working plan and leaves one extension host.
  w.history.pushState({}, "", "/ubc/other-page.htmld");
  w.document.body.appendChild(w.document.createElement("div"));
  const extensionHost = w.document.getElementById("UBC Workday - Schedule Tool");
  extensionHost.remove();
  await waitFor(() => extensionHost.isConnected);
  assert.ok(!s.querySelector("#schedule-footer-notes").textContent.includes("Workday page changed"));
  assert.equal(s.querySelectorAll(".course-card").length, 5);
  // Repeated execution must not duplicate shell/listeners after SPA activity.
  w.eval(await readFile(new URL("dist/content.js", root), "utf8"));
  assert.equal(w.document.querySelectorAll('[id="UBC Workday - Schedule Tool"]').length, 1);
  [...w.document.querySelectorAll('[data-automation-id^="selectedItem_15194$"]')].forEach((node) => node.remove());
  s.querySelector("#widget-refresh").click();
  await waitFor(() => s.querySelector("#schedule-loading-modal").classList.contains("is-hidden"));
  assert.ok(!s.querySelector("#schedule-footer-notes").textContent.includes("No supported course sections found"));
  assert.equal(s.querySelectorAll(".course-card").length, 5);
  // Editing keeps the source name and Quick Save available. Cancel changes nothing.
  failure = false;
  const originalId = data.wdSavedSchedules[0].id;
  const savedBeforeCancel = structuredClone(data.wdSavedSchedules);
  s.querySelector(".course-card__delete-button").click();
  assert.equal(s.querySelectorAll(".course-card").length, 4);
  assert.equal(courseHeading.firstElementChild.textContent, "Complete plan");
  assertStatus("Working - not saved", "working");
  assert.equal(quickSave.disabled, false);
  quickSave.click();
  assert.equal(s.querySelector("#schedule-modal-title").textContent, "Update saved schedule?");
  s.querySelector(".schedule-modal-cancel").click();
  await waitFor(() => !quickSave.disabled);
  assert.deepEqual(data.wdSavedSchedules, savedBeforeCancel);
  assert.equal(s.querySelectorAll(".course-card").length, 4);
  assertStatus("Working - not saved", "working");
  // A pending/failed overwrite must not show a saved state or lose its source.
  delayWrites = true;
  quickSave.click();
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => pendingWrite !== null);
  assertStatus("Working - not saved", "working");
  assert.equal(quickSave.disabled, true);
  failure = true;
  pendingWrite();
  pendingWrite = null;
  await waitFor(() => !quickSave.disabled);
  assert.deepEqual(data.wdSavedSchedules, savedBeforeCancel);
  assertStatus("Working - not saved", "working");
  assert.equal(courseHeading.firstElementChild.textContent, "Complete plan");
  failure = false;
  quickSave.click();
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => pendingWrite !== null);
  assertStatus("Working - not saved", "working");
  pendingWrite();
  pendingWrite = null;
  delayWrites = false;
  await waitFor(() => !quickSave.disabled);
  assertStatus("Saved Schedule", "saved");
  assert.equal(data.wdSavedSchedules.length, 1);
  assert.equal(data.wdSavedSchedules[0].id, originalId);
  assert.equal(data.wdSavedSchedules[0].name, "Complete plan");
  assert.equal(data.wdSavedSchedules[0].courses.length, 4);
  // Colour changes count as edits; reloading the saved plan discards those edits.
  s.querySelector('.course-card__color-option[data-color-index="8"]').click();
  assertStatus("Working - not saved", "working");
  assert.equal(quickSave.disabled, false);
  s.querySelector(".schedule-saved-card").click();
  assertStatus("Saved Schedule", "saved");
  s.querySelector(".course-sort-button").click();
  assertStatus("Saved Schedule", "saved");
  // Save As New rejects duplicate names without changing the working plan or saved source.
  s.querySelector(".course-card__delete-button").click();
  saveAsNew.click();
  s.querySelector("#schedule-modal-input").value = "Cancelled copy";
  s.querySelector(".schedule-modal-cancel").click();
  await waitFor(() => !saveAsNew.disabled);
  assert.equal(data.wdSavedSchedules.length, 1);
  assertStatus("Working - not saved", "working");
  assert.equal(quickSave.disabled, false);
  saveAsNew.click();
  const input = s.querySelector("#schedule-modal-input");
  const nameError = s.querySelector("#schedule-modal-error");
  const beforeDuplicateSave = structuredClone(data.wdSavedSchedules);
  for (const duplicate of ["Complete plan", "complete PLAN", "  Complete   plan  "]) {
    input.value = duplicate;
    input.dispatchEvent(new w.Event("input"));
    s.querySelector(".schedule-modal-confirm").click();
    assert.match(nameError.textContent, /already uses this name/);
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(s.querySelector("#schedule-save-modal").classList.contains("is-hidden"), false);
    assert.deepEqual(data.wdSavedSchedules, beforeDuplicateSave);
    assertStatus("Working - not saved", "working");
    assert.equal(courseHeading.firstElementChild.textContent, "Complete plan");
  }
  s.querySelector(".schedule-modal-cancel").click();
  await waitFor(() => !saveAsNew.disabled);
  assert.equal(quickSave.disabled, false);
  saveAsNew.click();
  assert.equal(nameError.textContent, "");
  input.value = "Copy plan";
  input.dispatchEvent(new w.Event("input"));
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => data.wdSavedSchedules.length === 2 && !saveAsNew.disabled);
  assertStatus("Saved Schedule", "saved");
  const newId = data.wdSavedSchedules[0].id;
  assert.notEqual(newId, originalId);
  assert.equal(data.wdSavedSchedules[0].courses.length, 3);
  assert.equal(data.wdSavedSchedules[1].courses.length, 4);
  // Rename and delete stay consistent in both headings/chips without losing working courses.
  s.querySelector(`[data-id="${newId}"] [data-action="rename"]`).click();
  const beforeDuplicateRename = structuredClone(data.wdSavedSchedules);
  input.value = "  COMPLETE   PLAN ";
  s.querySelector(".schedule-modal-confirm").click();
  assert.match(nameError.textContent, /already uses this name/);
  assert.deepEqual(data.wdSavedSchedules, beforeDuplicateRename);
  assert.equal(courseHeading.firstElementChild.textContent, "Copy plan");
  assertStatus("Saved Schedule", "saved");
  input.value = "COPY PLAN";
  input.dispatchEvent(new w.Event("input"));
  assert.equal(nameError.textContent, "");
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => courseHeading.firstElementChild.textContent === "COPY PLAN");
  s.querySelector(`[data-id="${newId}"] [data-action="rename"]`).click();
  s.querySelector("#schedule-modal-input").value = "Renamed plan";
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => courseHeading.firstElementChild.textContent === "Renamed plan");
  assertStatus("Saved Schedule", "saved");
  s.querySelector(`[data-id="${newId}"] [data-action="delete"]`).click();
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => quickSave.disabled);
  assertStatus("Working - not saved", "working");
  assert.equal(courseHeading.firstElementChild.textContent, "Working Schedule");
  assert.equal(s.querySelectorAll(".course-card").length, 3);
  // Deletion in another extension surface also detaches the source.
  s.querySelector(`[data-id="${originalId}"]`).click();
  assertStatus("Saved Schedule", "saved");
  for (let index = 0; index < 4; index++) s.querySelector(".course-card__delete-button").click();
  assertStatus("No courses added yet", "empty");
  assert.equal(quickSave.disabled, false);
  assert.equal(courseHeading.firstElementChild.textContent, "Complete plan");
  s.querySelector(`[data-id="${originalId}"]`).click();
  quickSave.click();
  data.wdSavedSchedules = [];
  for (const listener of storageListeners) await listener({ wdSavedSchedules: { newValue: [] } }, "local");
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => s.querySelector("#schedule-footer-notes").textContent.includes("no longer available"));
  assert.equal(data.wdSavedSchedules.length, 0);
  assert.equal(quickSave.disabled, true);
  assertStatus("Working - not saved", "working");
  assert.equal(courseHeading.firstElementChild.textContent, "Working Schedule");
  s.querySelector("#widget-clear").click();
  assertStatus("No courses added yet", "empty");
  assert.equal(quickSave.disabled, true);
  assert.equal(saveAsNew.disabled, true);
  assert.equal(courseHeading.firstElementChild.textContent, "Working Schedule");
  assert.equal(s.querySelector("#schedule-term-pill").firstElementChild.textContent, "Working Schedule");
  dom.window.close();
});

test("popup rename rejects an existing name and allows capitalization changes to its own name", async (t) => {
  const dom = new JSDOM(await readFile(new URL("src/popup.html", root), "utf8"), {
    url: "https://extension.test/popup.html", runScripts: "outside-only", pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  let data = { wdSavedSchedules: [
    { id: "one", name: "Fall Plan", courses: [course()], isFavorite: true },
    { id: "two", name: "Backup", courses: [course()] },
  ] };
  let writes = 0;
  w.chrome = { runtime: {}, storage: { local: {
    get(keys, callback) { callback(structuredClone(data)); },
    set(values, callback) { writes++; data = { ...data, ...structuredClone(values) }; callback(); },
  } } };
  w.eval(await readFile(new URL("dist/popup.js", root), "utf8"));
  await waitFor(() => w.document.querySelectorAll(".schedule-saved-card").length === 2);
  const before = structuredClone(data);
  w.prompt = () => " FALL   plan ";
  w.document.querySelector('[data-id="two"] [data-action="rename"]').click();
  await waitFor(() => w.document.querySelector("#popup-footer-alert").textContent.includes("already uses this name"));
  assert.deepEqual(data, before);
  assert.equal(writes, 0);
  w.prompt = () => "BACKUP";
  w.document.querySelector('[data-id="two"] [data-action="rename"]').click();
  await waitFor(() => data.wdSavedSchedules[1].name === "BACKUP");
  assert.equal(writes, 1);
  assert.equal(data.wdSavedSchedules[0].name, "Fall Plan");
});

test("grade buttons recover from a failed session request when clicked to retry", async (t) => {
  const dom = new JSDOM('<div id="list"></div>');
  t.after(() => dom.window.close());
  globals(dom);
  let failOnce = true;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    if (url === "https://ubcgrades.com/api/v3/yearsessions/UBCO") {
      if (failOnce) {
        failOnce = false;
        return new Response("Not found", { status: 404 });
      }
      return new Response(JSON.stringify(["2025W"]));
    }
    if (url === "https://ubcgrades.com/api/v3/grades/UBCO/2025W/RETRY/101")
      return new Response(JSON.stringify([{ section: "OVERALL", average: 80, reported: 100 }]));
    return new Response("Not found", { status: 404 });
  };
  const c = course({ code: "RETRY_O 101" });
  const ui = { tableBody: document.querySelector("#list") };
  renderCourseObjects(ui, [c]);
  const button = ui.tableBody.querySelector(".course-card__avg-button");
  await loadAverageForButton(button, getCourseAverageState(c));
  assert.match(button.textContent, /click to retry/);
  assert.equal(button.disabled, false);
  button.click();
  await waitFor(() => button.textContent.includes("80.0%"));
  assert.ok(!button.textContent.includes("network error"));
  assert.equal(button.textContent, "Average: 80.0%");
  assert.equal(ui.tableBody.querySelector(".grade-result-details"), null);
  assert.match(button.nextElementSibling.dataset.tooltip, /5-year average: 80.0%/);
  assert.equal(urls.filter((url) => url.includes("yearsessions")).length, 2);
});
