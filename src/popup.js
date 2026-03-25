import {
  applyCourseColorAssignments,
  captureCourseColorPalettes,
  normalizeCourseColorAssignments,
} from "./mainPanel/courseColorSettings.js";
import { renderSchedule } from "./mainPanel/scheduleView.js";
import { formatScheduleMeta, getFavoriteSchedule, getPreferredSchedule, loadSavedSchedules } from "./mainPanel/scheduleStorage.js";

// Cache the popup's small set of DOM nodes once so render helpers can stay focused on state updates.
const ui = {
  status: document.querySelector("#popup-status"),
  empty: document.querySelector("#popup-empty"),
  content: document.querySelector("#popup-content"),
  pickerWrap: document.querySelector("#popup-picker-wrap"),
  select: document.querySelector("#popup-select"),
  meta: document.querySelector("#popup-meta"),
  scheduleGrid: document.querySelector("#popup-schedule-grid"),
  scheduleTermPill: document.querySelector("#popup-term-pill"),
  footerAlert: document.querySelector("#popup-footer-alert"),
};

// Popup state mirrors the saved schedules in storage plus the schedule currently being previewed.
const popupState = {
  schedules: [],
  activeScheduleId: null,
  basePalettes: [],
};
let scheduledRenderFrame = 0;

// Reapplies the stored course color palette so the popup preview matches the main extension view.
function applySavedPalette(schedule) {
  if (!popupState.basePalettes.length) return;

  applyCourseColorAssignments(
    document.documentElement,
    popupState.basePalettes,
    normalizeCourseColorAssignments(schedule?.colorAssignments),
  );
}

function cancelScheduledRender() {
  if (!scheduledRenderFrame) return;
  cancelAnimationFrame(scheduledRenderFrame);
  scheduledRenderFrame = 0;
}

// The schedule renderer depends on live element measurements, so defer until the popup is visible.
function queueVisibleScheduleRender(schedule) {
  cancelScheduledRender();

  scheduledRenderFrame = requestAnimationFrame(() => {
    scheduledRenderFrame = requestAnimationFrame(() => {
      scheduledRenderFrame = 0;
      renderSchedule(ui, schedule?.courses, null, "am/pm");
    });
  });
}

// The picker only appears when more than one saved schedule exists, and it labels the default schedule clearly.
function renderPicker() {
  if (!ui.select) return;

  ui.select.innerHTML = "";

  popupState.schedules.forEach((schedule) => {
    const option = document.createElement("option");
    option.value = schedule.id;
    option.textContent = schedule.isFavorite ? `${schedule.name} (Favorite)` : schedule.name;
    option.selected = schedule.id === popupState.activeScheduleId;
    ui.select.appendChild(option);
  });

  ui.pickerWrap?.classList.toggle("is-hidden", popupState.schedules.length <= 1);
}

// Renders the active saved schedule preview, falling back to the preferred schedule when needed.
function renderActiveSchedule() {
  const activeSchedule =
    popupState.schedules.find((schedule) => schedule.id === popupState.activeScheduleId) ||
    getPreferredSchedule(popupState.schedules);

  if (!activeSchedule) {
    cancelScheduledRender();
    ui.empty?.classList.remove("is-hidden");
    ui.content?.classList.add("is-hidden");
    ui.status?.classList.remove("is-hidden");
    return;
  }

  popupState.activeScheduleId = activeSchedule.id;
  renderPicker();
  applySavedPalette(activeSchedule);

  const favoriteSchedule = getFavoriteSchedule(popupState.schedules);
  const isDefaultSchedule = favoriteSchedule?.id === activeSchedule.id;

  ui.empty?.classList.add("is-hidden");
  ui.content?.classList.remove("is-hidden");
  ui.status?.classList.add("is-hidden");
  ui.meta.textContent = formatScheduleMeta(activeSchedule);
  ui.status.textContent = isDefaultSchedule
    ? "This is the schedule shown when you open the extension outside Workday."
    : favoriteSchedule
      ? "Previewing a different saved schedule."
      : "No default schedule is starred yet, so the newest saved schedule is shown.";

  queueVisibleScheduleRender(activeSchedule);
}

// Startup restores saved schedules from storage, captures the base theme palette, and draws the initial preview.
async function boot() {
  popupState.basePalettes = captureCourseColorPalettes(document.documentElement);
  popupState.schedules = await loadSavedSchedules();
  popupState.activeScheduleId = getPreferredSchedule(popupState.schedules)?.id || null;

  renderPicker();
  renderActiveSchedule();
}

// Switching the picker updates which saved schedule is previewed in-place.
ui.select?.addEventListener("change", (event) => {
  popupState.activeScheduleId = event.target.value;
  renderActiveSchedule();
});

// The schedule grid uses measured layout, so rerender on resize to keep the preview aligned.
window.addEventListener("resize", () => {
  if (!popupState.activeScheduleId) return;
  renderActiveSchedule();
});

void boot();
