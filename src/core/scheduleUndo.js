import { courseIdentity, stableId } from "./meetings.js";
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const workingKeys = ["courses", "currentSavedScheduleId", "currentScheduleName", "syncPlanId", "syncPlanName"];
const working = (state) => Object.fromEntries(workingKeys.map((key) => [key, structuredClone(state[key] ?? (key === "courses" ? [] : null))]));

export function captureScheduleChange(state) {
  return { working: working(state), saved: structuredClone(state.savedSchedules) };
}

function changeEntry(before, after, label) {
  const ids = new Set([...before.saved, ...after.saved].map((s) => s.id));
  const saved = [...ids].flatMap((id) => {
    const a = before.saved.find((s) => s.id === id), b = after.saved.find((s) => s.id === id);
    return (!a || !b || !equal(a.courses, b.courses))
      ? [{ id, before: a, after: b, index: before.saved.findIndex((s) => s.id === id) }]
      : [];
  });
  const hasWorking = !equal(before.working.courses, after.working.courses) ||
    before.working.currentSavedScheduleId !== after.working.currentSavedScheduleId;
  return saved.length || hasWorking
    ? structuredClone({ before: before.working, saved, hasWorking, label })
    : null;
}

// History belongs to the current Workday tab. Saved inverses affect only the
// records changed by that action, preserving other plans and later metadata.
export function createScheduleUndoHistory(limit = 50) {
  const entries = [], redos = [];
  return {
    get canUndo() { return entries.length > 0; },
    get label() { return entries.at(-1)?.label || ""; },
    get canRedo() { return redos.length > 0; },
    get redoLabel() { return redos.at(-1)?.label || ""; },
    record(before, after, label) {
      const entry = changeEntry(before, after, label);
      if (!entry) return false;
      entries.push(entry);
      redos.length = 0;
      if (entries.length > limit) entries.shift();
      return true;
    },
    plan(state, direction = "undo") {
      const entry = (direction === "redo" ? redos : entries).at(-1);
      if (!entry) return null;
      const action = direction === "redo" ? "Redo" : "Undo";
      let savedSchedules = structuredClone(state.savedSchedules);
      // Validate every affected record before applying any inverse.
      for (const change of entry.saved) {
        const latest = savedSchedules.find((s) => s.id === change.id);
        if (change.after && (!latest || !equal(latest.courses, change.after.courses)))
          throw new Error(`This saved schedule changed in another window. ${action} was not applied.`);
        if (!change.after && latest)
          throw new Error(`This schedule already exists. ${action} was not applied.`);
      }
      for (const change of entry.saved) {
        if (!change.before) {
          savedSchedules = savedSchedules.filter((s) => s.id !== change.id);
        } else if (change.after) {
          savedSchedules = savedSchedules.map((s) => s.id === change.id
            ? { ...s, courses: structuredClone(change.before.courses), savedAt: change.before.savedAt, colorAssignments: change.before.colorAssignments }
            : s);
        } else {
          const restored = structuredClone(change.before);
          const nameKey = (name) => String(name).trim().replace(/\s+/g, " ").toLowerCase();
          const names = new Set(savedSchedules.map((s) => nameKey(s.name)));
          let suffix = 1;
          while (names.has(nameKey(restored.name))) {
            const tail = ` (${suffix++})`;
            restored.name = change.before.name.slice(0, 200 - tail.length) + tail;
          }
          if (savedSchedules.some((s) => s.isFavorite)) restored.isFavorite = false;
          savedSchedules.splice(Math.max(0, Math.min(change.index, savedSchedules.length)), 0, restored);
        }
      }
      if (savedSchedules.length > 10)
        throw new Error(`Remove a saved schedule to make room before ${action.toLowerCase()} restores this schedule (limit: 10).`);
      const restored = entry.hasWorking ? structuredClone(entry.before) : null;
      // Color-only edits are not history actions; keep them on courses that
      // still exist instead of reverting an unrelated choice with Undo.
      restored?.courses.forEach((course) => {
        const current = state.courses.find((item) => courseIdentity(item) === courseIdentity(course)) ||
          (course.courseGroupKey && state.courses.find((item) => item.courseGroupKey === course.courseGroupKey));
        if (!current) return;
        if (current.manualColorIndex == null) delete course.manualColorIndex;
        else course.manualColorIndex = current.manualColorIndex;
      });
      if (restored?.currentSavedScheduleId) {
        const source = savedSchedules.find((s) => s.id === restored.currentSavedScheduleId);
        restored.currentSavedScheduleId = source?.id || null;
        restored.currentScheduleName = source?.name || null;
        if (source) { restored.syncPlanId = source.id; restored.syncPlanName = source.name; }
        else {
          restored.syncPlanId = stableId(`working|${restored.courses.map(courseIdentity).sort().join("|")}`);
          restored.syncPlanName = "Working Schedule";
        }
      }
      const reverse = changeEntry(captureScheduleChange(state), {
        working: restored || working(state), saved: savedSchedules,
      }, entry.label);
      return { savedSchedules, working: restored, savedChanged: Boolean(entry.saved.length), label: entry.label, token: entry, direction, reverse };
    },
    commit(plan) {
      const source = plan.direction === "redo" ? redos : entries;
      const destination = plan.direction === "redo" ? entries : redos;
      if (source.at(-1) !== plan.token) throw new Error("The schedule changed while restoring history. Try again.");
      source.pop();
      if (plan.reverse) destination.push(plan.reverse);
      if (destination.length > limit) destination.shift();
    },
  };
}
