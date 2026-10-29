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
test("unknown meetings and date-window switching remain available in the shared renderer", () => {
  const dom = new JSDOM('<div id="grid"></div>');
  globals(dom);
  const ui = { scheduleGrid: document.querySelector("#grid") };
  renderSchedule(ui, [
    course({ meetingLines: [] }),
    course({
      code: "OTHER 102",
      meetingLines: [line(), line("Sat", "7:00 a.m. - 8:00 a.m.", "2027-01-01 - 2027-04-15")],
    }),
  ]);
  assert.equal(document.querySelector(".schedule-unknown h3").textContent, "Meeting Times Unknown");
  const select = document.querySelector("select");
  assert.equal(select.options.length, 3);
  select.value = "2027-01-01/2027-04-15";
  select.dispatchEvent(new dom.window.Event("change"));
  assert.equal(document.querySelectorAll('.schedule-day-head[data-day="Sat"]').length, 1);
  assert.equal(ui.selectedMeetingWindow, "2027-01-01/2027-04-15");
  dom.window.close();
});

const waitFor = async (check) => {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("UI did not reach expected state");
};
test("packaged content saves all five courses after search and reports failed writes", async (t) => {
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
    signedIn = false;
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
      local: {
        get(keys, callback) {
          callback(structuredClone(data));
        },
        set(values, callback) {
          lastError = failure ? { message: "QUOTA_BYTES exceeded" } : null;
          if (!failure) data = { ...data, ...structuredClone(values) };
          callback();
          lastError = null;
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
  search.value = "Course 100";
  search.dispatchEvent(new w.Event("input"));
  await waitFor(() => s.querySelectorAll(".course-card").length === 1);
  s.querySelector("#widget-save-schedule").click();
  await waitFor(() => !s.querySelector("#schedule-save-modal").classList.contains("is-hidden"));
  s.querySelector("#schedule-modal-input").value = "Complete plan";
  s.querySelector(".schedule-modal-confirm").click();
  await waitFor(() => data.wdSavedSchedules?.length === 1);
  assert.equal(data.wdSavedSchedules[0].courses.length, 5);
  s.querySelector(".schedule-saved-card").click();
  await waitFor(() => s.querySelectorAll(".course-card").length === 5);
  assert.equal(search.value, "");
  failure = true;
  s.querySelector("#widget-save-schedule").click();
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
  await waitFor(() => s.querySelector("#schedule-footer-notes").textContent.includes("Workday page changed"));
  // Repeated execution must not duplicate shell/listeners after SPA activity.
  w.eval(await readFile(new URL("dist/content.js", root), "utf8"));
  assert.equal(w.document.querySelectorAll('[id="UBC Workday - Schedule Tool"]').length, 1);
  dom.window.close();
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
  assert.match(ui.tableBody.querySelector(".grade-result-details").textContent, /Samples: latest 100/);
  assert.equal(urls.filter((url) => url.includes("yearsessions")).length, 2);
});
