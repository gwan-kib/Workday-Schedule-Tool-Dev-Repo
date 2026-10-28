// lastError exists only during the callback, so inspect it before resolving.
export function storageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(`Could not read extension storage: ${error.message}`));
        else resolve(result || {});
      });
    } catch (error) {
      reject(error);
    }
  });
}
export function storageSet(values) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(`Could not save extension data: ${error.message}. Free some space and retry.`));
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}
