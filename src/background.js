import { queryProfRating, RMP_MESSAGE_TYPE } from "./rateMyProfessor/rmpApi.js";
import {
  CALENDAR_MESSAGE_TYPE,
  disconnectCalendar,
  syncCoursesToCalendar,
} from "./googleCalendar/calendarIntegration.js";
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
  if (message?.type === CALENDAR_MESSAGE_TYPE.SYNC) {
    void (async () => {
      try {
        const { courses, options } = message.payload || {};
        const summary = await syncCoursesToCalendar(courses, options);
        // Errors are Error objects which don't survive structured cloning intact — flatten to strings.
        sendResponse({
          ok: true,
          summary: {
            removed: summary.removed,
            deleteFailed: summary.deleteFailed,
            added: summary.added,
            failed: summary.failed,
            skipped: summary.skipped,
            errors: summary.errors.map((err) => err?.message || String(err)),
          },
        });
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
