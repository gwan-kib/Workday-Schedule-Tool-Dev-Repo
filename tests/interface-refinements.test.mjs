import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { course, line } from "./fixtures/courses.mjs";
import { scheduleStatistics } from "../src/core/planner.js";
import { renderPlannerOverview } from "../src/mainPanel/schedules/plannerOverview.js";
import {
  courseDetailLines,
  timetablePages,
} from "../src/exportLogic/exportTimetable.js";
import { renderCourseObjects } from "../src/mainPanel/courses/renderCourseObjects.js";
import { mountPlanner } from "../src/mainPanel/schedules/plannerController.js";

test("overview uses an uninterrupted week, combines split ranges and rounds to whole hours", () => {
  const c = course({
    meetingLines: [
      line("Mon Wed Fri", "9:00 a.m. - 10:30 a.m.", "2026-09-09 - 2026-11-06"),
      line("Mon Wed Fri", "9:00 a.m. - 10:30 a.m.", "2026-11-18 - 2026-12-09"),
    ],
    meetingExceptions: [["2026-09-11"], ["2026-11-20"]],
  });
  const before = JSON.stringify(c),
    stats = scheduleStatistics([c]);
  assert.deepEqual(
    stats.weeks.map((w) => w.hours),
    [5, 5],
  );
  assert.equal(stats.weeks[0].busiestDay, "Monday");
  assert.equal(JSON.stringify(c), before);
});

test("Week 1/2 statistics differ only for alternate-week meetings, with full day names", () => {
  const dates = "2026-09-07 - 2026-10-18";
  const c = course({
    meetingLines: [
      line("Mon", "9:00 a.m. - 10:00 a.m.", dates),
      line("Fri (Alternate Weeks)", "9:00 a.m. - 12:00 p.m.", dates),
    ],
    meetingAnchors: [null, "2026-09-11"],
  });
  const stats = scheduleStatistics([c]);
  assert.deepEqual(
    stats.weeks.map((w) => w.hours),
    [4, 1],
  );
  assert.deepEqual(
    stats.weeks.map((w) => w.busiestDay),
    ["Friday", "Monday"],
  );
});

test('a short partial teaching range still counts every day in the weekly pattern', () => {
  const c = course({meetingLines:[line('Mon Wed Fri','9:00 a.m. - 10:30 a.m.','2026-09-09 - 2026-09-11')]});
  assert.deepEqual(scheduleStatistics([c]).weeks.map(week=>week.hours),[5,5]);
});

test("overview exposes only two metrics and omits duplicate weekly values and old explanations", () => {
  const dom = new JSDOM('<div id="host"></div>');
  globalThis.document = dom.window.document;
  const host = document.querySelector("#host");
  renderPlannerOverview(host, [course()]);
  assert.equal(host.querySelector("summary").textContent, "Schedule overview");
  assert.deepEqual(
    [...host.querySelectorAll("dt")].map((n) => n.textContent),
    ["Scheduled hours/week", "Busiest day"],
  );
  assert.equal(host.querySelector("p"), null);
  assert.ok(!host.textContent.includes("Week 1:"));
  assert.ok(!host.textContent.includes("conflicting pair"));
  host.replaceChildren();
  renderPlannerOverview(host, [
    course({
      meetingLines: [
        line(
          "Fri (Alternate Weeks)",
          "9:00 a.m. - 12:00 p.m.",
          "2026-09-07 - 2026-10-18",
        ),
      ],
      meetingAnchors: ["2026-09-11"],
    }),
  ]);
  assert.match(host.textContent, /Week 1: 3 · Week 2: 0/);
  dom.window.close();
});

test("PNG model contains only the matching timetable; PDF has precisely two unnumbered pages", () => {
  const c = course({
    code: "DATA_O 311",
    section_number: "101",
    title: "Machine Learning",
    instructor: "Irene Vrbik",
    meetingLines: [
      "UBCO | Library (LIB) | Floor: 3 | Room: 317 | Tue Thu | 11:00 a.m. - 12:30 p.m. | 2026-09-08 - 2026-11-05",
      "UBCO | Library (LIB) | Floor: 3 | Room: 317 | Tue Thu | 11:00 a.m. - 12:30 p.m. | 2026-11-17 - 2026-12-08",
    ],
  });
  const result = timetablePages([c]);
  assert.equal(result.pages.length, 2);
  assert.match(result.scheduleSvg, /DATA_O 311 101/);
  assert.match(result.scheduleSvg, /11:00 AM - 12:30 PM/);
  assert.match(result.scheduleSvg, /#3b45a4/);
  assert.ok(!result.scheduleSvg.includes("[1]"));
  assert.ok(!result.scheduleSvg.includes("Instructor:"));
  assert.ok(!result.pages[0].includes("Irene Vrbik"));
  assert.ok(result.pages[1].includes("Irene Vrbik"));
  const details = courseDetailLines(c).join("\n");
  assert.match(details, /Building: Library \(LIB\).*Floor: 3.*Room: 317/);
  assert.match(details, /Meeting Days: Tuesday, Thursday/);
  assert.match(details, /Meeting Time: 11:00 a.m. - 12:30 p.m./);
  assert.equal((details.match(/Building:/g) || []).length, 1);
  assert.equal(
    (result.scheduleSvg.match(/class="schedule-entry"/g) || []).length,
    2,
  );
});

test("Import/Export has distinct backup and restore actions; Help is an accessible icon", async () => {
  const html = await readFile(
    new URL("../src/panel.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html);
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const root = document.body,
    menu = root.querySelector("#widget-export-menu");
  assert.equal(
    root.querySelector("#widget-export-button .text").textContent,
    "Import / Export",
  );
  assert.equal(root.querySelector(".help .text"), null);
  assert.equal(root.querySelector(".help").getAttribute("aria-label"), "Help");
  const courses = [course()],
    state = { courses, savedSchedules: [] };
  const ui = {
    root,
    scheduleGrid: root.querySelector("#schedule-grid"),
    exportMenu: menu,
    exportDropdown: root.querySelector("#widget-export"),
    exportButton: root.querySelector("#widget-export-button"),
    tableBody: root.querySelector("#course-list"),
  };
  mountPlanner(ui, {
    getState: () => state,
    saveSchedules: async () => {},
    onRestored: async () => {},
  });
  renderCourseObjects(ui, courses);
  assert.equal(root.querySelector(".planner-swap-button"), null);
  assert.ok(!root.textContent.includes("Undo section swap"));
  assert.ok(
    ![...root.querySelectorAll(".planner-toolbar button")].some((b) =>
      b.textContent.includes("Backup"),
    ),
  );
  menu.querySelector('[data-planner-action="backup"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(
    root.querySelector("dialog").getAttribute("aria-label"),
    "Back up schedules",
  );
  assert.equal(root.querySelector("dialog input[type=file]"), null);
  [...root.querySelectorAll("dialog button")]
    .find((b) => b.textContent === "Close")
    .click();
  menu.querySelector('[data-planner-action="restore"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(
    root.querySelector("dialog").getAttribute("aria-label"),
    "Restore schedules",
  );
  assert.ok(root.querySelector("dialog input[type=file]"));
  dom.window.close();
});
