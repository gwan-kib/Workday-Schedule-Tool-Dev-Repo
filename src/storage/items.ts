import { storage } from "wxt/utils/storage";

import type { SavedSchedule } from "../lib/types";

const DEFAULT_COURSE_COLOR_ASSIGNMENTS = [1, 2, 3, 4, 5, 6, 7];

export const savedSchedulesItem = storage.defineItem<SavedSchedule[]>("local:wdSavedSchedules", {
  fallback: [],
});

export const preferredScheduleIdItem = storage.defineItem<string | null>("local:wdPreferredScheduleId", {
  fallback: null,
});

export const courseColorAssignmentsItem = storage.defineItem<number[]>("local:wdCourseColorAssignments", {
  fallback: [...DEFAULT_COURSE_COLOR_ASSIGNMENTS],
});

export const hoverTooltipEnabledItem = storage.defineItem<boolean>("local:wdHoverTooltipsEnabled", {
  fallback: true,
});
