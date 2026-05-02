import { debugFor, debugLog } from "../utilities/debugTool.js";
import { buildEventsForCourse } from "./eventBuilder.js";

const debug = debugFor("calendarIntegration");
debugLog({ local: { calendarIntegration: false } });

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_TIMEZONE = "America/Vancouver";

// NOTE: chrome.identity is unavailable inside content scripts. Callers must invoke
// addCoursesToCalendar from an extension context with chrome.identity access
// (background service worker, popup, or options page) — usually via chrome.runtime.sendMessage.

// Wraps chrome.identity.getAuthToken in a Promise. Input: { interactive }. Output: token string.
const fetchAuthToken = ({ interactive = true } = {}) =>
  new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Auth failed"));
      } else if (!token) {
        reject(new Error("No auth token returned by Chrome Identity API"));
      } else {
        resolve(token);
      }
    });
  });

// Drops a cached token so a stale/expired one is not reused. Input: token string. Output: none.
const invalidateAuthToken = (token) =>
  new Promise((resolve) => {
    if (!token) return resolve();
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });

// POSTs one event to a calendar. Input: token, calendarId, event. Output: response body or throws Error with .status.
const insertEvent = async (token, calendarId, event) => {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (response.ok) return response.json();

  const body = await response.text().catch(() => "");
  const error = new Error(`Calendar API error ${response.status}: ${body || response.statusText}`);
  error.status = response.status;
  throw error;
};

// Imports a list of Workday courses into the user's Google Calendar as recurring events.
//   Input: courses array (shape from extractCoursesData), optional { calendarId, timeZone }.
//   Output: { added, failed, skipped, errors } summary.
export async function addCoursesToCalendar(courses, options = {}) {
  const calendarId = options.calendarId || "primary";
  const timeZone = options.timeZone || DEFAULT_TIMEZONE;

  if (!Array.isArray(courses) || !courses.length) {
    debug.warn("No courses provided");
    return { added: 0, failed: 0, skipped: 0, errors: [] };
  }

  const events = courses.flatMap((course) => buildEventsForCourse(course, { timeZone }));
  const meetingLineCount = courses.reduce(
    (total, course) => total + (Array.isArray(course?.meetingLines) ? course.meetingLines.length : 0),
    0,
  );
  const skipped = Math.max(0, meetingLineCount - events.length);

  debug.log(
    { id: "addCoursesToCalendar.events" },
    `Built ${events.length} event(s) from ${courses.length} course(s); skipped ${skipped} unparseable line(s)`,
  );

  if (!events.length) {
    return { added: 0, failed: 0, skipped, errors: [] };
  }

  let token = await fetchAuthToken({ interactive: true });

  // Single retry on 401: invalidate stale token and re-acquire interactively.
  const insertWithRetry = async (event) => {
    try {
      return await insertEvent(token, calendarId, event);
    } catch (error) {
      if (error.status !== 401) throw error;
      debug.warn({ id: "insert.retry" }, "Token rejected, refreshing once");
      await invalidateAuthToken(token);
      token = await fetchAuthToken({ interactive: true });
      return insertEvent(token, calendarId, event);
    }
  };

  const results = await Promise.allSettled(events.map(insertWithRetry));

  const summary = {
    added: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    skipped,
    errors: results.filter((r) => r.status === "rejected").map((r) => r.reason),
  };

  debug.log({ id: "addCoursesToCalendar.summary" }, summary);
  return summary;
}

// Clears the cached OAuth token so the next import re-prompts for permission.
// Useful if the user wants to switch Google accounts or revoke access locally.
//   Input: none. Output: { cleared: boolean }.
export async function disconnectCalendar() {
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
