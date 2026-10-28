import { normalizeSchedule, stableId } from "../../core/meetings.js";
import { fetchReliable, createLimiter } from "../../utilities/network.js";
import { storageGet, storageSet } from "../../utilities/storage.js";
import { computeSyncPlan, tagPlanEvent, remoteSnapshot, eventFingerprint } from "./syncPlan.js";
import { debugFor, debugLog } from "../../utilities/debugTool.js";
import { buildEventsForCourse } from "./eventBuilder.js";

const debug = debugFor("calendarIntegration");
debugLog({ local: { calendarIntegration: false } });

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// Public message types used to bridge between popup/content scripts and the background worker.
// Identity APIs are used only from the background context; popup/content scripts call request* helpers.
export const CALENDAR_MESSAGE_TYPE = {
  SYNC: "SYNC_GCAL",
  PREVIEW: "PREVIEW_GCAL",
  AUTH_STATE: "AUTH_STATE_GCAL",
  SIGN_IN: "SIGN_IN_GCAL",
  DISCONNECT: "DISCONNECT_GCAL",
};

const GCAL_SIGNED_IN_STORAGE_KEY = "wstGoogleCalendarSignedIn";

// Identifies the current extension runtime from its browser-specific URL scheme.
// This stays local to the OAuth layer because shared WebExtension APIs work through chrome.* in Firefox.
const getExtensionBrowser = () => {
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return "unknown";

  try {
    const extensionUrl = chrome.runtime.getURL("");
    if (extensionUrl.startsWith("moz-extension://")) return "firefox";
    if (extensionUrl.startsWith("chrome-extension://")) return "chromium";
  } catch (error) {
    debug.warn({ id: "getExtensionBrowser.failed" }, "Could not identify extension browser", {
      error: String(error),
    });
  }

  return "unknown";
};

const getIdentityUnavailableMessage = () => {
  const browser = getExtensionBrowser();

  if (browser === "firefox") {
    return "Google Calendar sign-in is not available in this Firefox build yet.";
  }

  if (browser === "chromium") {
    return "Google Identity API is unavailable. Reload the extension from chrome://extensions and make sure the identity permission is enabled.";
  }

  return "Google Calendar sign-in is unavailable in this browser build.";
};

// Chrome authentication; Firefox remains ICS-only.
const fetchAuthToken = ({ interactive = true } = {}) =>
  new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.identity?.getAuthToken) {
      reject(new Error(getIdentityUnavailableMessage()));
      return;
    }

    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Auth failed"));
      } else if (!token) {
        reject(new Error("No auth token returned by the browser identity API"));
      } else {
        resolve(token);
      }
    });
  });

// Drops a cached token so a stale/expired one is not reused. Input: token string. Output: none.
const invalidateAuthToken = (token) =>
  new Promise((resolve) => {
    if (!token) return resolve();
    if (!chrome?.identity?.removeCachedAuthToken) return resolve();
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });

// Reads the extension-level Google sign-in state. Input: none. Output: boolean.
const loadStoredSignedInState = async () =>
  Boolean((await storageGet([GCAL_SIGNED_IN_STORAGE_KEY]))[GCAL_SIGNED_IN_STORAGE_KEY]);
const persistSignedInState = (signedIn) => storageSet({ [GCAL_SIGNED_IN_STORAGE_KEY]: Boolean(signedIn) });

const PREVIEW_KEY = "wstCalendarPreview";
const LAST_PLAN_KEY = "wstLastCalendarPlan";
let applying = false;

async function calendarRequest(token, path = "", { method = "GET", event, etag } = {}) {
  const response = await fetchReliable(
    `${CALENDAR_API}/calendars/primary/events${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(event ? { "Content-Type": "application/json" } : {}),
        ...(etag ? { "If-Match": etag } : {}),
      },
      ...(event ? { body: JSON.stringify(event) } : {}),
    },
    { retries: 2 },
  );
  return response.status === 204 ? null : response.json();
}
async function listImportedEvents(token) {
  const events = [];
  const pages = new Set();
  let pageToken;
  do {
    if (pages.has(pageToken) || pages.size >= 20)
      throw new Error("Calendar pagination could not be completed safely. No changes made.");
    pages.add(pageToken);
    const params = new URLSearchParams({
      privateExtendedProperty: "wstSource=workday-import",
      maxResults: "2500",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await calendarRequest(token, `?${params}`);
    if (!Array.isArray(data.items) && data.items != null)
      throw new Error("Google Calendar returned an unsupported response. No changes made.");
    events.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return events;
}
async function calendarToken() {
  if (getExtensionBrowser() === "firefox")
    throw new Error("Firefox supports .ics export only. Use Chrome for Google Calendar sync.");
  if (!(await getCalendarAuthState()).signedIn) throw new Error("Go to Settings and sign into Google first.");
  return fetchAuthToken({ interactive: false });
}
async function readCalendar(token) {
  try {
    return { token, events: await listImportedEvents(token) };
  } catch (error) {
    if (error.status !== 401) throw error;
    await invalidateAuthToken(token);
    token = await fetchAuthToken({ interactive: false });
    return { token, events: await listImportedEvents(token) };
  }
}

export async function previewCoursesToCalendar(courses, options = {}) {
  const { planId, planName = "Working schedule", replacePlanId = null } = options;
  if (!planId || !Array.isArray(courses) || !courses.length) throw new Error("Load a schedule before syncing.");
  const normalized = normalizeSchedule(courses);
  const desired = [
    ...new Map(
      courses
        .flatMap((c) => buildEventsForCourse(c))
        .map((e) => {
          const tagged = tagPlanEvent(e, planId);
          return [tagged.id, tagged];
        }),
    ).values(),
  ];
  if (!desired.length) throw new Error("No validated timed meetings to sync. See Meeting Times Unknown.");
  const { token, events } = await readCalendar(await calendarToken());
  const state = await storageGet([LAST_PLAN_KEY]);
  const previous = state[LAST_PLAN_KEY];
  const previousPlan =
    previous?.id !== planId && events.some((e) => e.extendedProperties?.private?.wstPlan === previous?.id)
      ? previous
      : null;
  if (replacePlanId && replacePlanId !== previousPlan?.id) throw new Error("The previous plan changed. Preview again.");
  const diff = computeSyncPlan(desired, events, { planId, replacePlanId, skipped: normalized.diagnostics.length });
  const previewId = crypto.randomUUID();
  const preview = {
    previewId,
    planId,
    planName,
    replacePlanId,
    desired,
    diff,
    snapshot: remoteSnapshot(events),
    authFingerprint: stableId(token),
    expiresAt: Date.now() + 10 * 60 * 1000,
    skipped: normalized.diagnostics.length,
  };
  // Persist the validated plan without tokens so MV3 suspension cannot silently
  // replace the user's confirmed preview with a newly computed operation.
  await storageSet({ [PREVIEW_KEY]: preview });
  return {
    previewId,
    planId,
    planName,
    previousPlan,
    calendar: "primary",
    additions: diff.additions.length,
    updates: diff.updates.length,
    removals: diff.removals.length,
    unchanged: diff.unchanged.length,
    skipped: preview.skipped,
    deferredRemovals: diff.deferredRemovals,
    legacy: diff.legacy,
    windows: [...new Set(normalized.meetings.map((m) => `${m.startDate} – ${m.endDate}`))],
    otherPlans: [
      ...new Set(events.map((e) => e.extendedProperties?.private?.wstPlan).filter((id) => id && id !== planId)),
    ].length,
  };
}

// A one-use preview token is required; passing courses or a boolean cannot write.
export async function syncCoursesToCalendar(previewId) {
  if (applying) throw new Error("A sync is already in progress. Wait, then preview again.");
  applying = true;
  try {
    const stored = await storageGet([PREVIEW_KEY]);
    const preview = stored[PREVIEW_KEY];
    if (!previewId || preview?.previewId !== previewId || preview.expiresAt < Date.now())
      throw new Error("The calendar preview expired or changed. Preview again.");
    const { token, events } = await readCalendar(await calendarToken());
    if (stableId(token) !== preview.authFingerprint)
      throw new Error("Google sign-in changed. Preview again before syncing.");
    if (remoteSnapshot(events) !== preview.snapshot)
      throw new Error("Google Calendar changed since the preview. Preview again before confirming.");
    await storageSet({ [PREVIEW_KEY]: null });
    const summary = {
      added: 0,
      updated: 0,
      removed: 0,
      failed: 0,
      deleteFailed: 0,
      unchanged: preview.diff.unchanged.length,
      skipped: preview.skipped,
      errors: [],
    };
    const limit = createLimiter(3);
    const writes = [
      ...preview.diff.additions.map((event) => ({ event, kind: "added" })),
      ...preview.diff.updates.map(({ old, event }) => ({ old, event, kind: "updated" })),
    ];
    await Promise.all(
      writes.map((operation) =>
        limit(async () => {
          try {
            if (operation.old) {
              const { id, ...event } = operation.event;
              // PUT intentionally restores extension-owned content after manual edits.
              await calendarRequest(token, `/${encodeURIComponent(operation.old.id)}`, {
                method: "PUT",
                event,
                etag: operation.old.etag,
              });
            } else {
              try {
                await calendarRequest(token, "", { method: "POST", event: operation.event });
              } catch (error) {
                // Deterministic IDs recover safely when a prior POST succeeded but
                // its response was lost. Never overwrite an unowned ID collision.
                if (error.status !== 409) throw error;
                const old = await calendarRequest(token, `/${operation.event.id}`);
                if (
                  old.extendedProperties?.private?.wstPlan !== preview.planId ||
                  old.extendedProperties?.private?.wstEvent !== operation.event.extendedProperties.private.wstEvent
                )
                  throw error;
                if (eventFingerprint(old) !== eventFingerprint(operation.event)) {
                  const { id, ...event } = operation.event;
                  await calendarRequest(token, `/${old.id}`, { method: "PUT", event, etag: old.etag });
                }
              }
            }
            summary[operation.kind]++;
          } catch (error) {
            summary.failed++;
            summary.errors.push(error.message);
          }
        }),
      ),
    );
    // Deletion is a second stage and is suppressed after ANY failed upsert.
    if (!summary.failed)
      await Promise.all(
        preview.diff.removals.map((old) =>
          limit(async () => {
            try {
              await calendarRequest(token, `/${encodeURIComponent(old.id)}`, { method: "DELETE", etag: old.etag });
              summary.removed++;
            } catch (error) {
              if (error.status === 404 || error.status === 410) summary.removed++;
              else {
                summary.deleteFailed++;
                summary.errors.push(error.message);
              }
            }
          }),
        ),
      );
    if (!summary.failed && !summary.deleteFailed)
      await storageSet({ [LAST_PLAN_KEY]: { id: preview.planId, name: preview.planName } });
    return summary;
  } finally {
    applying = false;
  }
}

// Reports whether the user has signed into Google from this extension.
//   Input: none. Output: { signedIn: boolean }.
export async function getCalendarAuthState() {
  return { signedIn: await loadStoredSignedInState() };
}

// Starts the interactive Google sign-in flow and records that this extension may sync.
//   Input: none. Output: { signedIn: boolean }.
export async function signInCalendar() {
  if (getExtensionBrowser() === "firefox")
    throw new Error("Firefox supports .ics export only. Use Chrome for Google Calendar sync.");
  await fetchAuthToken({ interactive: true });
  await persistSignedInState(true);
  return { signedIn: true };
}

// Clears the cached OAuth token so the next import re-prompts for permission.
// Useful if the user wants to switch Google accounts or revoke access locally.
//   Input: none. Output: { cleared: boolean }.
export async function disconnectCalendar() {
  await persistSignedInState(false);
  await storageSet({ [PREVIEW_KEY]: null });

  try {
    const token = await fetchAuthToken({ interactive: false });
    await invalidateAuthToken(token);
    debug.log({ id: "disconnectCalendar" }, "Cached calendar auth token cleared");
    return { cleared: true };
  } catch (error) {
    debug.log({ id: "disconnectCalendar.noop" }, "No cached token to clear:", error.message);
    return { cleared: false };
  }
}

// Builds a Google Calendar week-view URL focused on the earliest course start date,
// so the user lands on a week that actually contains the imported events.
//   Input: courses array. Output: URL string.
export function buildCalendarViewUrl(courses) {
  const earliest = (Array.isArray(courses) ? courses : [])
    .map((course) => course?.startDate)
    .filter(Boolean)
    .sort()[0];

  if (!earliest) return "https://calendar.google.com/calendar/u/0/r/week";

  const [y, m, d] = earliest.split("-").map((part) => Number.parseInt(part, 10));
  if (!y || !m || !d) return "https://calendar.google.com/calendar/u/0/r/week";

  return `https://calendar.google.com/calendar/u/0/r/week/${y}/${m}/${d}`;
}

// Generic message-passing helper, since all three request* helpers share the same plumbing.
const sendMessage = (type, payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || `Request '${type}' failed`));
        return;
      }
      resolve(response);
    });
  });

// Applies the previously validated and explicitly confirmed preview.
// Use from contexts without identity API access (popup/content).
//   Input: courses array, optional { calendarId, timeZone }.
//   Output: { removed, deleteFailed, added, failed, skipped, errors } (errors is an array of strings).
export async function requestPreviewCoursesToCalendar(courses, options = {}) {
  const response = await sendMessage(CALENDAR_MESSAGE_TYPE.PREVIEW, { courses, options });
  return response.preview;
}
export async function requestSyncCoursesToCalendar(previewId) {
  const response = await sendMessage(CALENDAR_MESSAGE_TYPE.SYNC, { previewId });
  return response.summary;
}

// Asks the background worker for the extension-level Google sign-in state.
//   Input: none. Output: { signedIn: boolean }.
export async function requestCalendarAuthState() {
  const response = await sendMessage(CALENDAR_MESSAGE_TYPE.AUTH_STATE, {});
  return { signedIn: Boolean(response.signedIn) };
}

// Asks the background worker to start the interactive Google sign-in flow.
//   Input: none. Output: { signedIn: boolean }.
export async function requestSignInCalendar() {
  const response = await sendMessage(CALENDAR_MESSAGE_TYPE.SIGN_IN, {});
  return { signedIn: Boolean(response.signedIn) };
}

// Asks the background worker to clear the cached OAuth token.
//   Input: none. Output: { cleared: boolean }.
export async function requestDisconnectCalendar() {
  const response = await sendMessage(CALENDAR_MESSAGE_TYPE.DISCONNECT, {});
  return { cleared: response.cleared };
}
