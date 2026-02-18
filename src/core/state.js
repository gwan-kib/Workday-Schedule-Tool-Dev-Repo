import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("state");

export const STATE = {
  courses: [],

  filtered: [],

  savedSchedules: [],

  currentScheduleName: null,

  sort: { key: null, dir: 1 },

  view: {
    panel: "list",
    semester: "first",
  },

  // Sets the full courses list. Input: array of courses. Output: none.
  setCourses(newCourses) {
    this.courses = newCourses;
    debug.log("Courses updated:", newCourses);
  },

  // Sets the filtered courses list. Input: array of courses. Output: none.
  setFiltered(filteredCourses) {
    this.filtered = filteredCourses;
    debug.log("Filtered courses updated:", filteredCourses);
  },

  // Sets saved schedules list. Input: array of schedules. Output: none.
  setSavedSchedules(saved) {
    this.savedSchedules = saved;
    debug.log("Saved schedules updated:", saved);
  },

  // Sets the sorting state. Input: sort state object. Output: none.
  setSort(sortState) {
    this.sort = sortState;
    debug.log("Sorting state updated:", sortState);
  },

  // Sets the view state. Input: view state object. Output: none.
  setView(viewState) {
    this.view = viewState;
    debug.log("View state updated:", viewState);
  },
};
