import { debugFor } from "./debug";

const debug = debugFor("dom");

export function $$(root: ParentNode, selector: string): Element[] {
  const result = Array.from(root.querySelectorAll(selector));
  debug.log({ id: "dom.queryAll" }, "Querying multiple elements", { selector, count: result.length });
  return result;
}

export function debounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, ms = 300) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: TArgs) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}
