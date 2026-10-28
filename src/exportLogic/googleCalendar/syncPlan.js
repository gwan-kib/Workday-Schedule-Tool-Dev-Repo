import { stableId } from "../../core/meetings.js";

export function calendarEventContent(event) {
  const time = (value) => ({
    dateTime: value?.dateTime ? new Date(value.dateTime).toISOString() : null,
    timeZone: value?.timeZone || "America/Vancouver",
  });
  return {
    summary: event.summary || "",
    description: event.description || "",
    location: event.location || "",
    colorId: event.colorId || "",
    start: time(event.start),
    end: time(event.end),
    recurrence: [...(event.recurrence || [])].sort(),
  };
}
export const eventFingerprint = (event) => JSON.stringify(calendarEventContent(event));
export function tagPlanEvent(event, planId) {
  const key = event.extendedProperties.private.wstEvent;
  return {
    ...event,
    id: stableId(`${planId}|${key}`),
    extendedProperties: { private: { ...event.extendedProperties.private, wstPlan: planId } },
  };
}
export function computeSyncPlan(desired, existing, { planId, replacePlanId = null, skipped = 0 } = {}) {
  if (!planId) throw new Error("A schedule identity is required.");
  const owned = existing.filter((e) => e.extendedProperties?.private?.wstSource === "workday-import");
  const current = owned.filter((e) => e.extendedProperties.private.wstPlan === planId);
  const byKey = new Map(current.map((e) => [e.extendedProperties.private.wstEvent, e]));
  const desiredKeys = new Set(desired.map((e) => e.extendedProperties.private.wstEvent));
  const additions = [],
    updates = [],
    unchanged = [];
  for (const event of desired) {
    const old = byKey.get(event.extendedProperties.private.wstEvent);
    if (!old) additions.push(event);
    else if (eventFingerprint(old) !== eventFingerprint(event)) updates.push({ old, event });
    else unchanged.push(old);
  }
  const removals = owned.filter(
    (e) =>
      (e.extendedProperties.private.wstPlan === planId && !desiredKeys.has(e.extendedProperties.private.wstEvent)) ||
      (replacePlanId && replacePlanId !== planId && e.extendedProperties.private.wstPlan === replacePlanId),
  );
  return {
    additions,
    updates,
    unchanged,
    removals: skipped ? [] : removals,
    deferredRemovals: skipped ? removals.length : 0,
    legacy: owned.filter((e) => !e.extendedProperties.private.wstPlan).length,
  };
}

export function remoteSnapshot(events) {
  return stableId(
    JSON.stringify(
      events
        .map((e) => [e.id, e.etag || "", e.extendedProperties?.private, eventFingerprint(e)])
        .sort((a, b) => a[0].localeCompare(b[0])),
    ),
  );
}
