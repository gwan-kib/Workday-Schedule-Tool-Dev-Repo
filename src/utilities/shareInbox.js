import { isSharePage, shareLinkToken, workdaySharePath } from "../core/scheduleShare.js";

const CAPTURE_SHARE = "WST_CAPTURE_SHARE";
const READ_SHARE = "WST_READ_SHARE";
const DISMISS_SHARE = "WST_DISMISS_SHARE";
const INBOX_PREFIX = "wstIncomingShare:";
const TTL_MS = 10 * 60 * 1000;

function requestInbox(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }
        resolve(typeof response?.link === "string" ? response.link : undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

export function readPendingShare() {
  return requestInbox({ type: READ_SHARE });
}

export function dismissPendingShare(link) {
  return requestInbox({ type: DISMISS_SHARE, link });
}

export function registerShareInbox() {
  const session = (globalThis.browser ?? chrome).storage.session;
  if (!session) return;

  // Workday can replace its document more than once while loading. Keep the
  // preview available for the same tab until the recipient closes or saves it.
  const pending = new Map();
  function ordered(tabId, operation) {
    const work = (pending.get(tabId) || Promise.resolve()).catch(() => {}).then(operation);
    pending.set(tabId, work);
    const forget = () => {
      if (pending.get(tabId) === work) pending.delete(tabId);
    };
    void work.then(forget, forget);
    return work;
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    const type = message?.type;
    if (type !== CAPTURE_SHARE && type !== READ_SHARE && type !== DISMISS_SHARE) return undefined;
    const tabId = sender.tab?.id;
    const allowedPage = type === CAPTURE_SHARE ? workdaySharePath(sender.url) : isSharePage(sender.url);
    if (!Number.isInteger(tabId) || tabId < 0 || sender.frameId !== 0 || !allowedPage)
      return undefined;
    const key = INBOX_PREFIX + tabId;
    const result = ordered(tabId, async () => {
      if (message.type === CAPTURE_SHARE) {
        if (!shareLinkToken(message.link)) {
          await session.remove(key);
          return {};
        }
        await session.set({ [key]: { link: message.link, until: Date.now() + TTL_MS } });
        return {};
      }
      const record = (await session.get(key))[key];
      if (!record) return {};
      if (record.until <= Date.now() || (type === DISMISS_SHARE && record.link === message.link)) {
        await session.remove(key);
        return {};
      }
      return type === READ_SHARE ? { link: record.link } : {};
    });
    void result.then(respond, () => respond({}));
    return true;
  });

  chrome.tabs.onRemoved.addListener(tabId => {
    void ordered(tabId, () => session.remove(INBOX_PREFIX + tabId)).catch(() => {});
  });
}
