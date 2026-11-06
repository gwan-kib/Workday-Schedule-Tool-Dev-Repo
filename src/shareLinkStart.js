// The fragment is not sent with the HTTP request. Remove it from the Workday
// address at document start. The inbox keeps it through a sign-in redirect.
(() => {
  const capture = () => {
    const { origin, pathname, hash, search } = location;
    const landing = ["/ubc/d/home.htmld", "/ubc/home.htmld", "/ubc/d/gateway.htmld"];
    if (origin !== "https://wd10.myworkday.com" || !landing.includes(pathname) ||
      !hash.startsWith("#wst-share-v1=")) return;

    const home = pathname === "/ubc/home.htmld" ? pathname : "/ubc/d/home.htmld";
    const url = origin + home + hash;
    const link = url.length <= 4096 ? url : "";
    history.replaceState(history.state, "", pathname + search);
    if (globalThis.wstOpenShare) globalThis.wstOpenShare(link);
    else {
      globalThis.wstIncomingShare = link;
      chrome.runtime.sendMessage({ type: "WST_CAPTURE_SHARE", link }, () => {
        void chrome.runtime.lastError;
      });
    }
  };
  capture();
  addEventListener("hashchange", capture);
})();
