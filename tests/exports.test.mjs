import test from "node:test";
import assert from "node:assert/strict";
import ICAL from "ical.js";
import { buildICSFile, foldIcsLine } from "../src/exportLogic/exportIcs.js";
import { buildEventsForCourse } from "../src/exportLogic/googleCalendar/eventBuilder.js";
import { course, line } from "./fixtures/courses.mjs";

const parse = (ics) => new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents("vevent");
test("independent iCalendar parser accepts escaped international text and folded recurrence", () => {
  const title = 'École, Engineering; \\ "<img onerror=alert(1)>" '.repeat(5);
  const ics = buildICSFile([course({ title })]);
  const events = parse(ics);
  assert.equal(events.length, 1);
  assert.ok(events[0].getFirstPropertyValue("summary").includes(title));
  assert.ok(events[0].getFirstPropertyValue("dtstamp"));
  assert.ok(ics.endsWith("\r\n"));
  for (const row of ics.split("\r\n")) assert.ok(Buffer.byteLength(row, "utf8") <= 75);
  assert.equal(foldIcsLine("SUMMARY:" + "🦄".repeat(50)).replace(/\r\n /g, ""), "SUMMARY:" + "🦄".repeat(50));
});
test("unchanged repeated exports retain the same logical UIDs", () => {
  const courses = [course(), course()];
  const a = parse(buildICSFile(courses, { now: new Date("2026-01-01Z") }));
  const b = parse(buildICSFile(courses, { now: new Date("2026-02-01Z") }));
  assert.equal(a.length, 1);
  assert.equal(a[0].getFirstPropertyValue("uid"), b[0].getFirstPropertyValue("uid"));
});
test("ICS and Google use identical occurrences across DST and verified exceptions", () => {
  const c = course({
    meetingLines: [line("Mon", "9:00 a.m. - 10:00 a.m.", "2026-10-19 - 2026-11-16")],
    meetingExceptions: [["2026-11-09"]],
  });
  const component = parse(buildICSFile([c]))[0];
  const event = new ICAL.Event(component);
  const iterator = event.iterator();
  const dates = [];
  for (let n; (n = iterator.next());) {
    dates.push(n.toJSDate().toISOString());
    if (dates.length > 10) break;
  }
  const google = buildEventsForCourse(c)[0];
  const googleDates = [
    google.start.dateTime,
    ...google.recurrence[0]
      .slice(6)
      .split(",")
      .map((d) =>
        ICAL.Time.fromString(
          `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`,
        )
          .toJSDate()
          .toISOString(),
      ),
  ];
  assert.deepEqual([...new Set(dates)], [...new Set(googleDates)]);
  assert.equal(new Set(dates).size, 4);
  assert.ok(dates.includes("2026-11-02T17:00:00.000Z"));
  assert.ok(!dates.includes("2026-11-09T17:00:00.000Z"));
});
test("unknown or invalid meetings never become fabricated exports", () => {
  assert.equal(parse(buildICSFile([course({ meetingLines: ["TBA"] })])).length, 0);
  assert.equal(buildEventsForCourse(course({ meetingLines: ["TBA"] })).length, 0);
});
