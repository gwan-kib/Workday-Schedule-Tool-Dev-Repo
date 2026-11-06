import { queryProfRating, RMP_MESSAGE_TYPE } from "./api/rateMyProfessor/rmpApi.js";
import {
  CALENDAR_MESSAGE_TYPE,
  disconnectCalendar,
  getCalendarAuthState,
  signInCalendar,
  syncCoursesToCalendar,
  previewCoursesToCalendar,
} from "./exportLogic/googleCalendar/calendarIntegration.js";
import { debugFor, debugLog } from "./utilities/debugTool.js";

const debug = debugFor("background");
debugLog({ local: { background: false } });

// Handles background data fetch requests from content scripts. Input: runtime message. Output: async response payload.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== RMP_MESSAGE_TYPE) return undefined;

  void (async () => {
    try {
      const data = await queryProfRating(message?.payload || {});
      sendResponse({ ok: true, data });
    } catch (error) {
      debug.error("Failed to fetch professor rating", {
        sender: sender?.tab?.id || "unknown",
        error: String(error),
      });
      sendResponse({ ok: false, error: error?.message || "Failed to fetch professor rating" });
    }
  })();

  return true;
});

// Handles Google Calendar sync + disconnect requests from popup/content scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === CALENDAR_MESSAGE_TYPE.PREVIEW || message?.type === CALENDAR_MESSAGE_TYPE.SYNC) {
    void (async () => {
      try {
        const { courses, options, previewId } = message.payload || {};
        const authState = await getCalendarAuthState();
        if (!authState.signedIn) {
          sendResponse({ ok: false, error: "Go to Settings and sign into Google first." });
          return;
        }

        if (message.type === CALENDAR_MESSAGE_TYPE.PREVIEW)
          sendResponse({ ok: true, preview: await previewCoursesToCalendar(courses, options) });
        else sendResponse({ ok: true, summary: await syncCoursesToCalendar(previewId) });
      } catch (error) {
        debug.error("Calendar sync failed", {
          sender: sender?.tab?.id || "unknown",
          error: String(error),
        });
        sendResponse({ ok: false, error: error?.message || "Calendar sync failed" });
      }
    })();
    return true;
  }

  if (message?.type === CALENDAR_MESSAGE_TYPE.AUTH_STATE) {
    void (async () => {
      try {
        const result = await getCalendarAuthState();
        sendResponse({ ok: true, signedIn: result.signedIn });
      } catch (error) {
        debug.error("Calendar auth state check failed", { error: String(error) });
        sendResponse({ ok: false, error: error?.message || "Google auth state check failed" });
      }
    })();
    return true;
  }

  if (message?.type === CALENDAR_MESSAGE_TYPE.SIGN_IN) {
    void (async () => {
      try {
        const result = await signInCalendar();
        sendResponse({ ok: true, signedIn: result.signedIn });
      } catch (error) {
        debug.error("Calendar sign-in failed", { error: String(error) });
        sendResponse({ ok: false, error: error?.message || "Google sign-in failed" });
      }
    })();
    return true;
  }

  if (message?.type === CALENDAR_MESSAGE_TYPE.DISCONNECT) {
    void (async () => {
      try {
        const result = await disconnectCalendar();
        sendResponse({ ok: true, cleared: result.cleared });
      } catch (error) {
        debug.error("Calendar disconnect failed", { error: String(error) });
        sendResponse({ ok: false, error: error?.message || "Disconnect failed" });
      }
    })();
    return true;
  }

  return undefined;
});
