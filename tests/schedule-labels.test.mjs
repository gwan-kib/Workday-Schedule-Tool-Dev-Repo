import test from "node:test";
import assert from "node:assert/strict";
import { scheduleTermLabel } from "../src/mainPanel/schedules/scheduleHeading.js";
import { syncPreviewText } from "../src/exportLogic/googleCalendar/syncPreviewText.js";
import { course, line } from "./fixtures/courses.mjs";

test("heading terms use metadata or all meeting ranges without changing scheduling data", () => {
  assert.equal(scheduleTermLabel([course()]), "Winter Term 1");
  assert.equal(
    scheduleTermLabel([course({ meetingLines: [line("Mon", undefined, "2027-01-01 - 2027-04-15")] })]),
    "Winter Term 2",
  );
  assert.equal(
    scheduleTermLabel([course({ meetingLines: [line("Mon", undefined, "2027-05-01 - 2027-06-15")] })]),
    "Summer Term 1",
  );
  assert.equal(
    scheduleTermLabel([course({ meetingLines: [line("Mon", undefined, "2027-07-01 - 2027-08-15")] })]),
    "Summer Term 2",
  );
  assert.equal(scheduleTermLabel([course({ term: "2026 Winter Session - Term 2" })]), "Winter Term 2");
  assert.equal(
    scheduleTermLabel([course({ meetingLines: [line(), line("Mon", undefined, "2027-01-01 - 2027-04-15")] })]),
    "Multiple terms detected",
  );
  assert.equal(scheduleTermLabel([]), "Term unavailable");
});

test("confirmation uses requested labels, names skipped items, and spaces the holiday sentence", () => {
  const preview = {
    planName: "Fall Plan",
    additions: 14,
    updates: 0,
    removals: 0,
    unchanged: 0,
    skipped: 1,
    skippedItems: ["TEST 202 001: No meeting times supplied."],
    legacy: 13,
  };
  const text = syncPreviewText(preview);
  assert.match(text, /^Target Calendar: Primary\n/);
  assert.match(text, /Schedule Name: Fall Plan/);
  assert.match(text, /Adding: 14\nUpdating: 0\nRemoving: 0\nUnchanged: 0/);
  assert.match(text, /Skipped:\n• TEST 202 001: No meeting times supplied\./);
  assert.ok(!text.includes("older unscoped"));
  assert.ok(!text.includes("Skipped meetings:"));
  assert.match(text, /\n\nHolidays and reading breaks supplied by Workday are automatically excluded\.$/);
  assert.match(syncPreviewText({ ...preview, skipped: 0, skippedItems: [] }), /Skipped: None/);
});
