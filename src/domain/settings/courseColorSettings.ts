import { courseDataSchema, savedScheduleSchema } from "../../lib/schemas";
import { debugFor } from "../../lib/debug";
import type { CourseColorPalette, CourseData, SavedSchedule } from "../../lib/types";
import { courseColorAssignmentsItem, preferredScheduleIdItem, savedSchedulesItem } from "../../storage/items";

const debug = debugFor("courseColorSettings");

export const COURSE_COLOR_COUNT = 7;
export const COURSE_COLOR_LABELS = ["Red", "Orange", "Purple", "Blue", "Yellow", "Green", "Teal"] as const;
export const DEFAULT_COURSE_COLOR_ASSIGNMENTS = Array.from({ length: COURSE_COLOR_COUNT }, (_, i) => i + 1);
export const MAX_SCHEDULES = 10;

const isValidPaletteId = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= COURSE_COLOR_COUNT;

export function normalizeCourseColorAssignments(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_COURSE_COLOR_ASSIGNMENTS];

  return DEFAULT_COURSE_COLOR_ASSIGNMENTS.map((fallback, index) => {
    const candidate = Number(value[index]);
    return isValidPaletteId(candidate) ? candidate : fallback;
  });
}

export function assignCourseColors(courses: CourseData[]): void {
  const getCourseKey = (course: CourseData): string => {
    const code = course.code.trim().toUpperCase();
    const title = course.title.trim().toUpperCase();
    if (code || title) return `${code}||${title}`;
    return course.section_number.trim().toUpperCase();
  };

  const isLecture = (course: CourseData) => !(course.isLab || course.isSeminar || course.isDiscussion);
  const hasValidColor = (course: CourseData) =>
    Number.isInteger(course.colorIndex) &&
    Number(course.colorIndex) >= 1 &&
    Number(course.colorIndex) <= COURSE_COLOR_COUNT;

  let colorCursor = 0;
  const colorByKey = new Map<string, number>();

  const nextColor = () => {
    colorCursor += 1;
    return ((colorCursor - 1) % COURSE_COLOR_COUNT) + 1;
  };

  courses.forEach((course) => {
    const key = getCourseKey(course);
    if (hasValidColor(course)) {
      if (key && !colorByKey.has(key) && course.colorIndex) colorByKey.set(key, course.colorIndex);
      return;
    }

    if (!isLecture(course)) return;

    if (key && colorByKey.has(key)) {
      course.colorIndex = colorByKey.get(key);
      return;
    }

    const colorIndex = nextColor();
    course.colorIndex = colorIndex;
    if (key) colorByKey.set(key, colorIndex);
  });

  courses.forEach((course) => {
    if (hasValidColor(course)) return;

    const key = getCourseKey(course);
    if (key && colorByKey.has(key)) {
      course.colorIndex = colorByKey.get(key);
      return;
    }

    const colorIndex = nextColor();
    course.colorIndex = colorIndex;
    if (key) colorByKey.set(key, colorIndex);
  });
}

export async function loadCourseColorAssignments(): Promise<number[]> {
  return normalizeCourseColorAssignments(await courseColorAssignmentsItem.getValue());
}

export async function persistCourseColorAssignments(assignments: number[]): Promise<void> {
  await courseColorAssignmentsItem.setValue(normalizeCourseColorAssignments(assignments));
}

export function captureCourseColorPalettes(target: Element | null): CourseColorPalette[] {
  if (!target) return [];

  const styles = getComputedStyle(target);
  const read = (name: string) => styles.getPropertyValue(name).trim();

  return DEFAULT_COURSE_COLOR_ASSIGNMENTS.map((id, index) => ({
    id,
    label: COURSE_COLOR_LABELS[index],
    bg: read(`--course-color-${id}-bg`),
    border: read(`--course-color-${id}-border`),
    chip: read(`--course-color-${id}-chip`),
    subBg: read(`--course-color-${id}-sub-bg`),
    subChip: read(`--course-color-${id}-sub-chip`),
  }));
}

export function applyCourseColorAssignments(
  target: HTMLElement | Element | null,
  palettes: CourseColorPalette[],
  assignments: number[],
): void {
  if (!target || palettes.length < COURSE_COLOR_COUNT) return;

  const normalized = normalizeCourseColorAssignments(assignments);
  const styleTarget = target instanceof HTMLElement ? target.style : (target as HTMLElement).style;

  normalized.forEach((paletteId, index) => {
    const courseIndex = index + 1;
    const palette = palettes[paletteId - 1];
    if (!palette) return;

    styleTarget.setProperty(`--course-color-${courseIndex}-bg`, palette.bg);
    styleTarget.setProperty(`--course-color-${courseIndex}-border`, palette.border);
    styleTarget.setProperty(`--course-color-${courseIndex}-chip`, palette.chip);
    styleTarget.setProperty(`--course-color-${courseIndex}-sub-bg`, palette.subBg);
    styleTarget.setProperty(`--course-color-${courseIndex}-sub-chip`, palette.subChip);
  });
}

function sanitizeSchedules(schedules: unknown): SavedSchedule[] {
  if (!Array.isArray(schedules)) return [];

  return schedules
    .map((schedule) => {
      const result = savedScheduleSchema.safeParse(schedule);
      return result.success ? result.data : null;
    })
    .filter((schedule): schedule is SavedSchedule => schedule !== null);
}

function normalizeSchedules(schedules: SavedSchedule[], preferredId: string | null = null): SavedSchedule[] {
  let favoriteAssigned = false;

  return sanitizeSchedules(schedules).map((schedule) => {
    const shouldFavorite =
      !favoriteAssigned && Boolean(schedule.id) && (schedule.isFavorite || schedule.id === preferredId);

    if (shouldFavorite) favoriteAssigned = true;

    return {
      ...schedule,
      isFavorite: shouldFavorite,
      courses: schedule.courses
        .map((course) => courseDataSchema.safeParse(course))
        .filter((course): course is { success: true; data: CourseData } => course.success)
        .map((course) => course.data),
    };
  });
}

export async function loadSavedSchedules(): Promise<SavedSchedule[]> {
  const [schedules, preferredId] = await Promise.all([
    savedSchedulesItem.getValue(),
    preferredScheduleIdItem.getValue(),
  ]);

  return normalizeSchedules(schedules, preferredId);
}

export async function persistSavedSchedules(schedules: SavedSchedule[]): Promise<void> {
  const normalized = normalizeSchedules(schedules);
  const preferredScheduleId = normalized.find((schedule) => schedule.isFavorite)?.id ?? null;

  await Promise.all([
    savedSchedulesItem.setValue(normalized),
    preferredScheduleIdItem.setValue(preferredScheduleId),
  ]);
}

export function createScheduleSnapshot(
  name: string,
  courses: CourseData[],
  colorAssignments: number[] | null,
): SavedSchedule {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    name: name || "Untitled",
    savedAt: new Date().toISOString(),
    courses: courses.map((course) => courseDataSchema.parse(course)),
    colorAssignments: Array.isArray(colorAssignments) ? [...colorAssignments] : null,
    isFavorite: false,
  };
}

export function getFavoriteSchedule(schedules: SavedSchedule[]): SavedSchedule | null {
  return schedules.find((schedule) => schedule.isFavorite) ?? null;
}

export function getPreferredSchedule(schedules: SavedSchedule[]): SavedSchedule | null {
  return getFavoriteSchedule(schedules) ?? schedules[0] ?? null;
}

export function togglePreferredSchedule(schedules: SavedSchedule[], scheduleId: string): SavedSchedule[] {
  const favoriteId = getFavoriteSchedule(schedules)?.id ?? null;
  const nextPreferredId = favoriteId === scheduleId ? null : scheduleId;

  return schedules.map((schedule) => ({
    ...schedule,
    isFavorite: Boolean(nextPreferredId) && schedule.id === nextPreferredId,
  }));
}

export function formatScheduleMeta(schedule: SavedSchedule): string {
  const count = schedule.courses.length;
  const savedDate = new Date(schedule.savedAt);
  const dateLabel = Number.isNaN(savedDate.getTime())
    ? schedule.savedAt
    : savedDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return `${count} courses | Saved ${dateLabel}`;
}

export function canSaveMoreSchedules(schedules: SavedSchedule[]): boolean {
  return schedules.length < MAX_SCHEDULES;
}

export function debugCourseColorAssignments(assignments: number[]): void {
  debug.log({ id: "courseColorSettings.assignments" }, "Current course color assignments", assignments);
}
