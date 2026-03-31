import { create } from "zustand";

import { applyFilterAndSort } from "../domain/courseList/courseViewSorting";
import { assignCourseColors } from "../domain/settings/courseColorSettings";
import type {
  ContentBootstrapState,
  CourseData,
  MainPanelKey,
  PanelKey,
  SavedSchedule,
  SortableKey,
} from "../lib/types";

function buildDefaultState(): ContentBootstrapState {
  return {
    courses: [],
    filteredCourses: [],
    savedSchedules: [],
    currentSavedScheduleId: null,
    currentScheduleName: null,
    searchQuery: "",
    sort: { key: null, dir: 1 },
    view: {
      panel: "course-list-panel",
      lastMainPanel: "course-list-panel",
      semester: null,
      timeFormat: "am/pm",
      hoverTipsEnabled: true,
      isPanelOpen: true,
    },
  };
}

function recomputeFiltered(courses: CourseData[], searchQuery: string, sort: ContentBootstrapState["sort"]) {
  return applyFilterAndSort(courses, searchQuery, sort);
}

type ContentStore = ContentBootstrapState & {
  setCourses: (courses: CourseData[]) => void;
  clearCourses: () => void;
  setSavedSchedules: (schedules: SavedSchedule[]) => void;
  setSearchQuery: (searchQuery: string) => void;
  toggleSort: (key: SortableKey) => void;
  setPanel: (panel: PanelKey) => void;
  showUtilityPanel: (panel: Exclude<PanelKey, MainPanelKey>) => void;
  togglePanelOpen: () => void;
  setTimeFormat: (timeFormat: ContentBootstrapState["view"]["timeFormat"]) => void;
  setHoverTipsEnabled: (hoverTipsEnabled: boolean) => void;
  setCurrentSchedule: (scheduleId: string | null, scheduleName: string | null) => void;
  loadSavedSchedule: (schedule: SavedSchedule) => void;
};

export const useContentStore = create<ContentStore>((set) => ({
  ...buildDefaultState(),

  setCourses: (courses) =>
    set((state) => {
      const nextCourses = courses.map((course) => ({ ...course }));
      assignCourseColors(nextCourses);

      return {
        courses: nextCourses,
        filteredCourses: recomputeFiltered(nextCourses, state.searchQuery, state.sort),
        currentSavedScheduleId: null,
        currentScheduleName: null,
      };
    }),

  clearCourses: () =>
    set((state) => ({
      courses: [],
      filteredCourses: [],
      searchQuery: "",
      currentSavedScheduleId: null,
      currentScheduleName: null,
      sort: { key: null, dir: 1 },
      view: {
        ...state.view,
        panel: state.view.lastMainPanel,
      },
    })),

  setSavedSchedules: (savedSchedules) => set({ savedSchedules }),

  setSearchQuery: (searchQuery) =>
    set((state) => ({
      searchQuery,
      filteredCourses: recomputeFiltered(state.courses, searchQuery, state.sort),
    })),

  toggleSort: (key) =>
    set((state) => {
      const isSameKey = state.sort.key === key;
      const isDesc = isSameKey && state.sort.dir === -1;

      if (isDesc) {
        const clearedSort = { key: null, dir: 1 as const };
        return {
          sort: clearedSort,
          filteredCourses: recomputeFiltered(state.courses, state.searchQuery, clearedSort),
        };
      }

      const nextSort = {
        key,
        dir: state.sort.key === key ? (state.sort.dir === 1 ? -1 : 1) : 1,
      } as const;

      return {
        sort: nextSort,
        filteredCourses: recomputeFiltered(state.courses, state.searchQuery, nextSort),
      };
    }),

  setPanel: (panel) =>
    set((state) => ({
      view: {
        ...state.view,
        panel,
        lastMainPanel:
          panel === "course-list-panel" || panel === "schedule-panel" ? panel : state.view.lastMainPanel,
      },
    })),

  showUtilityPanel: (panel) =>
    set((state) => {
      if (state.view.panel === panel) {
        return {
          view: {
            ...state.view,
            panel: state.view.lastMainPanel,
          },
        };
      }

      return {
        view: {
          ...state.view,
          panel,
        },
      };
    }),

  togglePanelOpen: () =>
    set((state) => ({
      view: {
        ...state.view,
        isPanelOpen: !state.view.isPanelOpen,
      },
    })),

  setTimeFormat: (timeFormat) =>
    set((state) => ({
      view: {
        ...state.view,
        timeFormat,
      },
    })),

  setHoverTipsEnabled: (hoverTipsEnabled) =>
    set((state) => ({
      view: {
        ...state.view,
        hoverTipsEnabled,
      },
    })),

  setCurrentSchedule: (currentSavedScheduleId, currentScheduleName) =>
    set({
      currentSavedScheduleId,
      currentScheduleName,
    }),

  loadSavedSchedule: (schedule) =>
    set((state) => {
      const nextCourses = schedule.courses.map((course) => ({ ...course }));
      assignCourseColors(nextCourses);

      return {
        courses: nextCourses,
        filteredCourses: [...nextCourses],
        searchQuery: "",
        sort: { key: null, dir: 1 },
        currentSavedScheduleId: schedule.id,
        currentScheduleName: schedule.name,
        view: {
          ...state.view,
          panel: "course-list-panel",
          lastMainPanel: "course-list-panel",
        },
      };
    }),
}));
