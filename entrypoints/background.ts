import { defineBackground } from "wxt/utils/define-background";

import { queryProfRating, RMP_MESSAGE_TYPE } from "../src/domain/rmp/rmpApi";
import { debugFor } from "../src/lib/debug";

const debug = debugFor("background");
type RmpRuntimeMessage = {
  type?: string;
  payload?: {
    profName?: string;
    campus?: string;
  };
};

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: RmpRuntimeMessage, sender, sendResponse) => {
    if (message?.type !== RMP_MESSAGE_TYPE) return undefined;

    void (async () => {
      try {
        const data = await queryProfRating(message?.payload || {});
        sendResponse({ ok: true, data });
      } catch (error) {
        debug.error({ id: "background.fetchProfRatingFailed" }, "Failed to fetch professor rating", {
          sender: sender?.tab?.id || "unknown",
          error: String(error),
        });
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to fetch professor rating",
        });
      }
    })();

    return true;
  });
});
