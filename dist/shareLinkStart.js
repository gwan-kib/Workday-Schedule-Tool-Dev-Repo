// The fragment is not sent with the HTTP request. Remove it from the Workday
// address at document start and pass it to the panel in the isolated world.
(() => {
  const capture = () => {
    const { origin, pathname, hash, search } = location;
    if (origin !== "https://wd10.myworkday.com" || pathname !== "/ubc/home.htmld" ||
      !hash.startsWith("#wst-share-v1=")) return;

    const url = origin + pathname + hash;
    const link = url.length <= 4096 ? url : "";
    history.replaceState(history.state, "", pathname + search);
    if (globalThis.wstOpenShare) globalThis.wstOpenShare(link);
    else globalThis.wstIncomingShare = link;
  };
  capture();
  addEventListener("hashchange", capture);
})();
