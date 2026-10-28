import { createScheduleStore, selectVisibleCourses } from "../../core/scheduleStore.js";
import { $$, on } from "../../utilities/dom.js";
import { STATE } from "../../core/state.js";
import { reorderCourseObjects } from "./renderCourseObjects.js";
import { debugFor, debugLog } from "../../utilities/debugTool.js";

const debug = debugFor("mainPanelInteractions");
debugLog({ local: { mainPanelInteractions: false } });
const SORTABLE_KEYS = new Set(["title", "meeting", "instructionalFormat"]);

const store = createScheduleStore(STATE);
export function filterCourses(query) {
  store.filter(query);
}
export function applyCourseSort() {
  STATE.filtered = selectVisibleCourses(STATE);
}
export function sortCourses(key) {
  if (SORTABLE_KEYS.has(key)) store.sort(key);
}

// Wires sorting handlers to sort buttons. Input: ui object. Output: none.
export function wireTableSorting(ui) {
  const headCells = $$(ui.tableHead, "[data-key]");

  headCells.forEach((th) => {
    on(th, "click", () => {
      const key = th.getAttribute("data-key");
      sortCourses(key);
      reorderCourseObjects(ui, STATE.filtered);

      headCells.forEach((h) => h.classList.remove("sorted-asc", "sorted-desc"));
      if (STATE.sort.key) th.classList.add(STATE.sort.dir === 1 ? "sorted-asc" : "sorted-desc");

      debug.log({ id: "wireTableSorting.click" }, "Sorted via list controls", { key, dir: STATE.sort.dir });
    });
  });
}
