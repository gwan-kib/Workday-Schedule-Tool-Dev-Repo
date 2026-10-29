import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { course, line } from "./fixtures/courses.mjs";
import { debugLog } from "../src/utilities/debugTool.js";
debugLog({ global: false });
let storage, events, writes, failPost, failPut, idCounter;
globalThis.chrome = {
  runtime: { getURL: (p) => `chrome-extension://test/${p}`, lastError: null },
  identity: {
    getAuthToken(options, callback) {
      callback("mock-token");
    },
    removeCachedAuthToken(options, callback) {
      callback();
    },
  },
  storage: {
    local: {
      get(keys, callback) {
        callback(structuredClone(storage));
      },
      set(values, callback) {
        storage = { ...storage, ...structuredClone(values) };
        callback();
      },
    },
  },
};
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || "GET",
    parsed = new URL(url);
  assert.equal(parsed.origin, "https://www.googleapis.com");
  assert.ok(parsed.pathname.startsWith("/calendar/v3/calendars/primary/events"));
  const id = parsed.pathname.split("/events/")[1];
  const respond = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
  if (method === "GET")
    return id
      ? respond(events.get(id) || {}, events.has(id) ? 200 : 404)
      : respond({
          items: [...events.values()].filter((e) => e.extendedProperties?.private?.wstSource === "workday-import"),
        });
  writes.push({ method, id });
  if (method === "POST") {
    const event = JSON.parse(options.body);
    if (failPost) return respond({}, 400);
    if (events.has(event.id)) return respond({}, 409);
    const result = { ...event, etag: `tag-${++idCounter}` };
    events.set(event.id, result);
    return respond(result);
  }
  if (method === "PUT") {
    if (failPut) return respond({}, 412);
    const old = events.get(id);
    if (!old) return respond({}, 404);
    if (options.headers["If-Match"] && options.headers["If-Match"] !== old.etag) return respond({}, 412);
    const result = { ...JSON.parse(options.body), id, etag: `tag-${++idCounter}` };
    events.set(id, result);
    return respond(result);
  }
  if (method === "DELETE") {
    events.delete(id);
    return respond(null, 204);
  }
  throw new Error(`Unexpected method ${method}`);
};
const { previewCoursesToCalendar: preview, syncCoursesToCalendar: sync } =
  await import("../src/exportLogic/googleCalendar/calendarIntegration.js");
beforeEach(() => {
  storage = { wstGoogleCalendarSignedIn: true };
  events = new Map();
  writes = [];
  failPost = false;
  failPut = false;
  idCounter = 0;
});
const plan = (id) => ({ planId: id, planName: `Plan ${id}` });

test("preview including no-op plans is read-only; one-use confirmation tokens gate writes", async () => {
  const p = await preview([course()], plan("A"));
  assert.equal(p.additions, 1);
  assert.equal(writes.length, 0);
  await assert.rejects(sync(true), /preview expired|preview.*changed/i);
  assert.equal(writes.length, 0);
  const result = await sync(p.previewId);
  assert.equal(result.added, 1);
  await assert.rejects(sync(p.previewId), /preview expired|preview.*changed/i);
  const again = await preview([course()], plan("A"));
  assert.equal(again.additions, 0);
  assert.equal(again.updates, 0);
  assert.equal(again.unchanged, 1);
  const before = writes.length;
  await sync(again.previewId);
  assert.equal(writes.length, before);
});
test("Keep Both isolates plan event sets and preserves unrelated/manual and legacy entries", async () => {
  events.set("manual", { id: "manual", summary: "Personal appointment" });
  events.set("legacy", { id: "legacy", extendedProperties: { private: { wstSource: "workday-import" } } });
  await sync((await preview([course()], plan("A"))).previewId);
  const b = await preview([course()], plan("B"));
  assert.equal(b.previousPlan.id, "A");
  assert.equal(b.legacy, 1);
  assert.equal(b.removals, 0);
  await sync(b.previewId);
  assert.equal(events.size, 4);
  assert.ok(events.has("manual"));
  assert.ok(events.has("legacy"));
  const a = await preview([course()], plan("A"));
  assert.equal(a.unchanged, 1);
  assert.equal(a.removals, 0);
});
test("Replace Previous removes only selected prior-plan events after successful upserts", async () => {
  await sync((await preview([course()], plan("A"))).previewId);
  events.set("manual", { id: "manual", summary: "Personal appointment" });
  const next = await preview([course({ code: "TEST 202" })], { ...plan("B"), replacePlanId: "A" });
  assert.equal(next.removals, 1);
  assert.equal(writes.filter((w) => w.method === "DELETE").length, 0);
  await sync(next.previewId);
  assert.equal(events.size, 2);
  assert.ok(events.has("manual"));
  assert.ok([...events.values()].some((e) => e.extendedProperties?.private?.wstPlan === "B"));
  assert.equal(writes.at(-1).method, "DELETE");
});
test("partial insert failure preserves all previous events and retry does not duplicate", async () => {
  await sync((await preview([course()], plan("A"))).previewId);
  const p = await preview([course({ code: "TEST 202" })], { ...plan("B"), replacePlanId: "A" });
  failPost = true;
  const failed = await sync(p.previewId);
  assert.equal(failed.failed, 1);
  assert.equal(failed.removed, 0);
  assert.equal(events.size, 1);
  assert.equal(writes.filter((w) => w.method === "DELETE").length, 0);
  failPost = false;
  const retry = await preview([course({ code: "TEST 202" })], { ...plan("B"), replacePlanId: "A" });
  const result = await sync(retry.previewId);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
  assert.equal(events.size, 1);
});
test("managed manual edits are overwritten, while failed updates suppress deletions", async () => {
  await sync((await preview([course(), course({ code: "TEST 202" })], plan("A"))).previewId);
  const first = [...events.values()][0];
  first.summary = "Manual edit";
  const p = await preview([course()], plan("A"));
  assert.equal(p.updates, 1);
  assert.equal(p.removals, 1);
  failPut = true;
  const failure = await sync(p.previewId);
  assert.equal(failure.failed, 1);
  assert.equal(failure.removed, 0);
  assert.equal(events.size, 2);
  failPut = false;
  const success = await sync((await preview([course()], plan("A"))).previewId);
  assert.equal(success.updated, 1);
  assert.equal(success.removed, 1);
  assert.ok(![...events.values()].some((e) => e.summary === "Manual edit"));
});
test("remote changes and expired previews require a refreshed confirmation", async () => {
  await sync((await preview([course()], plan("A"))).previewId);
  const p = await preview([course()], plan("A"));
  [...events.values()][0].summary = "Changed after preview";
  writes = [];
  await assert.rejects(sync(p.previewId), /changed since the preview/);
  assert.equal(writes.length, 0);
  const p2 = await preview([course()], plan("A"));
  storage.wstCalendarPreview.expiresAt = 0;
  await assert.rejects(sync(p2.previewId), /expired/);
  assert.equal(writes.length, 0);
});
test("incomplete meeting data defers destructive removals and previews skipped counts", async () => {
  await sync((await preview([course(), course({ code: "TEST 202" })], plan("A"))).previewId);
  const p = await preview([course(), course({ code: "TEST 202", meetingLines: ["TBA"] })], plan("A"));
  assert.equal(p.skipped, 1);
  assert.equal(p.skippedItems.length, 1);
  assert.match(p.skippedItems[0], /TEST 202 001/);
  assert.match(p.skippedItems[0], /missing or unsupported/);
  assert.equal(p.removals, 0);
  assert.equal(p.deferredRemovals, 1);
  await sync(p.previewId);
  assert.equal(events.size, 2);
});
test("stored previews survive background worker module recreation without storing auth tokens", async () => {
  const p = await preview([course()], plan("A"));
  assert.ok(!JSON.stringify(storage.wstCalendarPreview).includes("mock-token"));
  const fresh = await import(`../src/exportLogic/googleCalendar/calendarIntegration.js?worker-restart=${Date.now()}`);
  const result = await fresh.syncCoursesToCalendar(p.previewId);
  assert.equal(result.added, 1);
});
