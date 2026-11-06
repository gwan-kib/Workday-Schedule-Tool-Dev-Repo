import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSharedSchedule,
  decodeSharedLink,
  encodeSharedLink,
  MAX_SHARE_FILE,
  parseSharedSchedule,
  serializeSharedSchedule,
  sharedScheduleForImport,
  SHARE_PAGE,
  SHARE_PREFIX,
} from "../src/core/scheduleShare.js";
import { planScheduleImport } from "../src/core/scheduleBackup.js";
import { course } from "./fixtures/courses.mjs";

const block = {
  id: "private-stored-id", title: "Commute", category: "Travel", color: "#125678",
  startDate: "2026-09-08", endDate: "2026-12-15", days: ["Tue"],
  recurrence: "alternate", startMinutes: 600, endMinutes: 660, exceptions: ["2026-09-08"],
};

test("share links and files carry the preview fields and import as independent copies", async () => {
  const source = course({
    title: "Café 室",
    workdayCourseId: "workday-secret-id",
    workdayCourseLink: "https://workday.example/private",
    courseIndex: 8,
    accountToken: "secret-token",
    notes: "private notes",
  });
  const text = serializeSharedSchedule(createSharedSchedule([source]));
  for (const secret of ["workday-secret-id", "workday.example", "secret-token", "private notes", "courseIndex", block.title])
    assert.ok(!text.includes(secret));
  const link = await encodeSharedLink(text);
  assert.ok(link.startsWith(SHARE_PAGE + SHARE_PREFIX));
  const decoded = await decodeSharedLink(link);
  assert.equal(decoded.courses[0].title, "Café 室");
  assert.equal(decoded.courses[0].instructor, source.instructor);
  assert.match(decoded.courses[0].meetingLines[0], /Room: 101/);
  assert.deepEqual(decoded, parseSharedSchedule(text));

  const included = createSharedSchedule([source], [block]);
  assert.equal(included.personalBlocks[0].title, block.title);
  assert.notEqual(included.personalBlocks[0].id, block.id);
  const incoming = sharedScheduleForImport(included);
  const existing = [{ ...incoming, id: "existing", isFavorite: true }];
  const result = planScheduleImport(existing, incoming);
  assert.deepEqual(result.schedules[0], existing[0]);
  assert.equal(result.imported.name, "Shared schedule (1)");
  assert.notEqual(result.imported.personalBlocks[0].id, block.id);
  assert.match(result.imported.courses[0].meeting, /Room: 101/);
});

test("untrusted or oversized shares are rejected, and long links fall back to JSON", async () => {
  const large = Array.from({ length: 60 }, (_, index) => course({
    section_number: String(index),
    title: Array.from({ length: 3 }, (_, part) =>
      createHash("sha512").update(index + ":" + part).digest("hex")).join(""),
  }));
  const text = serializeSharedSchedule(createSharedSchedule(large));
  assert.equal(await encodeSharedLink(text), null);
  assert.equal(parseSharedSchedule(text).courses.length, 60);
  await assert.rejects(() => decodeSharedLink("https://example.test/" + SHARE_PREFIX + "AA"), /valid WST/);
  await assert.rejects(() => decodeSharedLink(SHARE_PAGE + SHARE_PREFIX + "AA"), /damaged/);
  assert.throws(() => parseSharedSchedule(text.replace('"version":1', '"version":99')), /from this extension/);
  assert.throws(() => parseSharedSchedule(" ".repeat(MAX_SHARE_FILE + 1)), /512 KB/);

  const expanded = await encodeSharedLink(" ".repeat(MAX_SHARE_FILE + 1));
  await assert.rejects(() => decodeSharedLink(expanded), /size limit/);
});
