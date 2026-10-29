import { assignCourseColors } from "../mainPanel/settings/courseColorSettings.js";

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
};

// Normalize derived colors on copies so older saved snapshots compare fairly.
// Course order, filtering and timetable settings do not change saved content.
const courseFingerprint = (courses) => {
  const copy = JSON.parse(JSON.stringify(courses || []));
  assignCourseColors(copy);
  return copy.map((course) => {
    delete course.courseIndex;
    delete course.colorIndex;
    delete course.courseGroupKey;
    return JSON.stringify(stableValue(course));
  }).sort().join("\n");
};

export function getScheduleSaveState(state) {
  const saved = state.savedSchedules.find((schedule) => schedule.id === state.currentSavedScheduleId) || null;
  const status = !state.courses.length
    ? "empty"
    : saved && courseFingerprint(state.courses) === courseFingerprint(saved.courses)
      ? "saved"
      : "working";
  return {
    saved,
    status,
    label: { empty: "No courses added yet", saved: "Saved Schedule", working: "Working - not saved" }[status],
  };
}
