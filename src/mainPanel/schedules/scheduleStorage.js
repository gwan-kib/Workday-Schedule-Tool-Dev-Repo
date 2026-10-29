import { storageGet, storageSet } from "../../utilities/storage.js";
import { debugFor, debugLog } from "../../utilities/debugTool.js";
const debug = debugFor("scheduleStorage");
debugLog({ local: { scheduleStorage: false } });

const STORAGE_KEY = "wdSavedSchedules";
const PREFERRED_SCHEDULE_KEY = "wdPreferredScheduleId";
const MAX_SCHEDULES = 10;

const scheduleNameKey = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
const DUPLICATE_NAME_MESSAGE = "A saved schedule already uses this name. Choose a different name.";

export function getScheduleNameError(name, schedules, excludeId = null) {
  const key = scheduleNameKey(name);
  if (!key) return "Schedule name cannot be empty.";
  return schedules.some((schedule) => schedule.id !== excludeId && scheduleNameKey(schedule.name) === key)
    ? DUPLICATE_NAME_MESSAGE
    : null;
}

// Deep-clones courses for storage. Input: array of courses. Output: cloned array.
const cloneCourses = (courses) => {
  if (typeof structuredClone === "function") return structuredClone(courses);
  return JSON.parse(JSON.stringify(courses || []));
};

// Sanitizes schedule objects for storage. Input: array of schedules. Output: sanitized array.
const sanitizeSchedules = (schedules) => {
  if (
    !Array.isArray(schedules) ||
    schedules.some(
      (s) =>
        !s ||
        typeof s.id !== "string" ||
        !s.id ||
        typeof s.name !== "string" ||
        !Array.isArray(s.courses) ||
        s.courses.some((c) => !c || typeof c !== "object" || typeof c.code !== "string"),
    )
  ) {
    throw new Error(
      "Saved schedule data is damaged or unsupported. Existing data was preserved; restore a backup or report this error before saving again.",
    );
  }
  return schedules
    .filter((s) => s)
    .map((s) => ({
      id: s.id,
      name: s.name || "Untitled",
      savedAt: s.savedAt || new Date().toISOString(),
      courses: Array.isArray(s.courses) ? s.courses : [],
      colorAssignments: Array.isArray(s.colorAssignments) ? s.colorAssignments : null,
      isFavorite: Boolean(s.isFavorite),
    }));
};

// Normalizes saved schedules so only one preferred schedule exists. Input: schedules array and optional preferred id. Output: normalized array.
const normalizeSchedules = (schedules, preferredId = null) => {
  const sanitized = sanitizeSchedules(schedules);
  let favoriteAssigned = false;

  return sanitized.map((schedule) => {
    const shouldFavorite =
      !favoriteAssigned && Boolean(schedule.id) && (schedule.isFavorite || schedule.id === preferredId);

    if (shouldFavorite) favoriteAssigned = true;

    return {
      ...schedule,
      isFavorite: shouldFavorite,
    };
  });
};

const useChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

// Loads saved schedules from storage. Input: none. Output: array of schedules.
export async function loadSavedSchedules() {
  let result;
  if (useChromeStorage) result = await storageGet([STORAGE_KEY, PREFERRED_SCHEDULE_KEY, "wdScheduleSchemaVersion"]);
  else {
    const raw = localStorage.getItem(STORAGE_KEY);
    result = {
      [STORAGE_KEY]: raw ? JSON.parse(raw) : [],
      [PREFERRED_SCHEDULE_KEY]: localStorage.getItem(PREFERRED_SCHEDULE_KEY),
    };
  }
  if (result.wdScheduleSchemaVersion != null && result.wdScheduleSchemaVersion !== 1)
    throw new Error("Unsupported saved schedule version. Update the extension before editing saved data.");
  // Legacy arrays are version 0. Migration adds metadata on the next successful
  // write; reading never rewrites or discards the original data.
  return normalizeSchedules(result[STORAGE_KEY] ?? [], result[PREFERRED_SCHEDULE_KEY] || null);
}

export async function persistSavedSchedules(schedules) {
  const sanitized = normalizeSchedules(schedules);
  const names = new Map();
  for (const schedule of sanitized) {
    const key = scheduleNameKey(schedule.name);
    if (!names.has(key)) names.set(key, []);
    names.get(key).push(schedule);
  }
  const duplicates = [...names.values()].filter((group) => group.length > 1).flat();
  if (duplicates.length) {
    // Preserve old duplicate records so users can rename them one at a time.
    // No new record or rename may introduce an additional name collision.
    const existing = await loadSavedSchedules();
    if (duplicates.some((schedule) => !existing.some((previous) =>
      previous.id === schedule.id && scheduleNameKey(previous.name) === scheduleNameKey(schedule.name),
    ))) throw new Error(DUPLICATE_NAME_MESSAGE);
  }
  const preferredScheduleId = sanitized.find((schedule) => schedule.isFavorite)?.id || null;
  if (useChromeStorage) {
    await storageSet({
      [STORAGE_KEY]: sanitized,
      [PREFERRED_SCHEDULE_KEY]: preferredScheduleId,
      wdScheduleSchemaVersion: 1,
    });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    if (preferredScheduleId) localStorage.setItem(PREFERRED_SCHEDULE_KEY, preferredScheduleId);
    else localStorage.removeItem(PREFERRED_SCHEDULE_KEY);
  }
}

// Creates a snapshot object for a schedule. Input: name string, courses array. Output: schedule object.
export function createScheduleSnapshot(name, courses, colorAssignments) {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    name: name || "Untitled",
    savedAt: new Date().toISOString(),
    courses: cloneCourses(courses || []),
    colorAssignments: Array.isArray(colorAssignments) ? [...colorAssignments] : null,
    isFavorite: false,
  };
}

// Returns the explicitly starred schedule if one exists. Input: schedules array. Output: schedule or null.
export function getFavoriteSchedule(schedules) {
  return normalizeSchedules(schedules).find((schedule) => schedule.isFavorite) || null;
}

// Returns the schedule to use by default. Input: schedules array. Output: schedule or null.
export function getPreferredSchedule(schedules) {
  const normalized = normalizeSchedules(schedules);
  return normalized.find((schedule) => schedule.isFavorite) || normalized[0] || null;
}

// Toggles the preferred schedule flag while keeping at most one favorite. Input: schedules array and schedule id. Output: normalized schedules array.
export function togglePreferredSchedule(schedules, scheduleId) {
  const favoriteId = getFavoriteSchedule(schedules)?.id || null;
  const nextPreferredId = favoriteId === scheduleId ? null : scheduleId;
  return sanitizeSchedules(schedules).map((schedule) => ({
    ...schedule,
    isFavorite: Boolean(nextPreferredId) && schedule.id === nextPreferredId,
  }));
}

// Formats display text for a schedule meta line. Input: schedule object. Output: string.
export function formatScheduleMeta(schedule) {
  const count = schedule.courses?.length || 0;
  const savedDate = new Date(schedule.savedAt);

  const dateLabel = Number.isNaN(savedDate.getTime())
    ? schedule.savedAt
    : savedDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return `${count} courses | Saved ${dateLabel}`;
}

// Renders saved schedule cards into the UI. Input: ui object, schedules array, and optional active schedule id. Output: none.
export function renderSavedSchedules(ui, schedules, activeScheduleId = null) {
  if (!ui.savedMenu) return;

  ui.savedMenu.innerHTML = "";

  if (!schedules.length) {
    const empty = document.createElement("div");
    empty.className = "schedule-saved-empty";
    empty.textContent = "No saved schedules yet.";
    ui.savedMenu.appendChild(empty);
    return;
  }

  normalizeSchedules(schedules).forEach((schedule) => {
    const card = document.createElement("div");
    card.className = `schedule-saved-card${schedule.id === activeScheduleId ? " is-active" : ""}`;
    card.dataset.id = schedule.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const header = document.createElement("div");
    header.className = "schedule-saved-card-header";

    const info = document.createElement("div");

    const title = document.createElement("div");
    title.className = "schedule-saved-title";
    title.textContent = schedule.name;

    const titleRow = document.createElement("div");
    titleRow.className = "schedule-saved-title-row";
    titleRow.appendChild(title);

    if (schedule.isFavorite) {
      const badge = document.createElement("span");
      badge.className = "schedule-saved-badge";
      badge.textContent = "Favorite";
      titleRow.appendChild(badge);
    }

    const meta = document.createElement("div");
    meta.className = "schedule-saved-meta";
    meta.textContent = formatScheduleMeta(schedule);

    info.appendChild(titleRow);
    info.appendChild(meta);
    header.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "schedule-saved-actions";

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = `schedule-saved-action star wd-hover-tooltip${schedule.isFavorite ? " is-favorite" : ""}`;
    favoriteButton.dataset.action = "favorite";
    const favoriteLabel = schedule.isFavorite ? "Unstar schedule" : "Star schedule";
    favoriteButton.dataset.tooltip = favoriteLabel;
    favoriteButton.setAttribute("aria-label", favoriteLabel);
    favoriteButton.setAttribute("aria-pressed", String(schedule.isFavorite));

    const favoriteIcon = document.createElement("span");
    favoriteIcon.className = "material-symbols-rounded";
    favoriteIcon.setAttribute("aria-hidden", "true");
    favoriteIcon.textContent = "star";
    favoriteButton.appendChild(favoriteIcon);

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "schedule-saved-action rename wd-hover-tooltip";
    renameButton.dataset.action = "rename";
    renameButton.dataset.tooltip = "Rename schedule";
    renameButton.setAttribute("aria-label", "Rename schedule");

    const renameIcon = document.createElement("span");
    renameIcon.className = "material-symbols-rounded";
    renameIcon.setAttribute("aria-hidden", "true");
    renameIcon.textContent = "edit";
    renameButton.appendChild(renameIcon);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "schedule-saved-action delete wd-hover-tooltip";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.tooltip = "Delete schedule";
    deleteButton.setAttribute("aria-label", "Delete schedule");

    const deleteIcon = document.createElement("span");
    deleteIcon.className = "material-symbols-rounded";
    deleteIcon.setAttribute("aria-hidden", "true");
    deleteIcon.textContent = "delete";
    deleteButton.appendChild(deleteIcon);

    actions.appendChild(favoriteButton);
    actions.appendChild(renameButton);
    actions.appendChild(deleteButton);

    card.appendChild(header);
    card.appendChild(actions);

    ui.savedMenu.appendChild(card);
  });

  debug.log({ id: "renderSavedSchedules.done" }, "Rendered saved schedules", schedules);
}

// Returns whether another schedule can be saved. Input: schedules array. Output: boolean.
export function canSaveMoreSchedules(schedules) {
  return (schedules?.length || 0) < MAX_SCHEDULES;
}

// Returns the maximum schedule count. Input: none. Output: number.
export function getMaxScheduleCount() {
  return MAX_SCHEDULES;
}
