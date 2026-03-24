import { queryProfRating, RMP_MESSAGE_TYPE } from "./rateMyProfessor/rmpApi.js";
import { debugFor, debugLog } from "./utilities/debugTool.js";

const debug = debugFor("background");
debugLog({ local: { background: false } });
const WORKDAY_URL_PATTERN = /^https:\/\/[^/]+\.myworkday\.com\//i;
const POPUP_PATH = "dist/popup.html";

// Returns whether the tab is a Workday page. Input: chrome tab object. Output: boolean.
function isWorkdayTab(tab) {
  return typeof tab?.url === "string" && WORKDAY_URL_PATTERN.test(tab.url);
}

// Applies the correct action popup for a tab. Input: chrome tab object. Output: promise.
async function syncActionPopupForTab(tab) {
  if (!tab?.id) return;

  const popup = isWorkdayTab(tab) ? "" : POPUP_PATH;
  await chrome.action.setPopup({ tabId: tab.id, popup });
}

// Loads the active tab and syncs the action popup state. Input: none. Output: promise.
async function syncActiveTabPopup() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await syncActionPopupForTab(activeTab);
}

chrome.runtime.onInstalled.addListener(() => {
  void syncActiveTabPopup();
});

chrome.runtime.onStartup.addListener(() => {
  void syncActiveTabPopup();
});

chrome.tabs.onActivated.addListener(() => {
  void syncActiveTabPopup();
});

chrome.windows.onFocusChanged.addListener(() => {
  void syncActiveTabPopup();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!("status" in changeInfo) && !("url" in changeInfo)) return;
  void syncActionPopupForTab(tab);
});

void syncActiveTabPopup();

// Handles action button clicks by sending a toggle message to the active tab. Input: Chrome tab object. Output: none.
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id || !isWorkdayTab(tab)) return;

  debug.log("Action button clicked, sending message to tab:", { tabId: tab.id });

  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_WIDGET" }, () => {
    if (chrome.runtime.lastError) {
      debug.error("Error sending message to tab:", chrome.runtime.lastError);
    } else {
      debug.log("Message successfully sent to toggle widget.");
    }
  });
});

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
