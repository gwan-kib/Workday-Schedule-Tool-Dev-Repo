import { shareLinkToken, isShareLanding } from "../core/scheduleShare.js";

const CAPTURE_SHARE = "WST_CAPTURE_SHARE";
const TAKE_SHARE = "WST_TAKE_SHARE";
const INBOX_PREFIX = "wstIncomingShare:";
const TTL_MS = 10 * 60 * 1000;

export function takePendingShare() {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: TAKE_SHARE }, response => {
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

export function registerShareInbox() {
  const session = (globalThis.browser ?? chrome).storage.session;
  if (!session) return;

  // A landing page can redirect immediately to sign-in. Keep capture and
  // consumption ordered per tab, even when the first document is gone.
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
    if (message?.type !== CAPTURE_SHARE && message?.type !== TAKE_SHARE) return undefined;
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId) || tabId < 0 || sender.frameId !== 0 ||
      !isShareLanding(sender.url)) return undefined;
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
      if (record) await session.remove(key);
      return { link: record?.until > Date.now() ? record.link : undefined };
    });
    void result.then(respond, () => respond({}));
    return true;
  });

  chrome.tabs.onRemoved.addListener(tabId => {
    void ordered(tabId, () => session.remove(INBOX_PREFIX + tabId)).catch(() => {});
  });
}
