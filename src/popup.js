import {
  applyCourseColorAssignments,
  captureCourseColorPalettes,
  normalizeCourseColorAssignments,
} from "./mainPanel/courseColorSettings.js";
import { renderSchedule } from "./mainPanel/scheduleView.js";
import { formatScheduleMeta, getFavoriteSchedule, getPreferredSchedule, loadSavedSchedules } from "./mainPanel/scheduleStorage.js";

const ui = {
  title: document.querySelector("#popup-title"),
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

const popupState = {
  schedules: [],
  activeScheduleId: null,
  basePalettes: [],
};

function applySavedPalette(schedule) {
  if (!popupState.basePalettes.length) return;

  applyCourseColorAssignments(
    document.documentElement,
    popupState.basePalettes,
    normalizeCourseColorAssignments(schedule?.colorAssignments),
  );
}

function renderPicker() {
  if (!ui.select) return;

  ui.select.innerHTML = "";

  popupState.schedules.forEach((schedule) => {
    const option = document.createElement("option");
    option.value = schedule.id;
    option.textContent = schedule.isFavorite ? `${schedule.name} (Default)` : schedule.name;
    option.selected = schedule.id === popupState.activeScheduleId;
    ui.select.appendChild(option);
  });

  ui.pickerWrap?.classList.toggle("is-hidden", popupState.schedules.length <= 1);
}

function renderActiveSchedule() {
  const activeSchedule =
    popupState.schedules.find((schedule) => schedule.id === popupState.activeScheduleId) ||
    getPreferredSchedule(popupState.schedules);

  if (!activeSchedule) {
    ui.empty?.classList.remove("is-hidden");
    ui.content?.classList.add("is-hidden");
    ui.title.textContent = "Saved schedule";
    ui.status.textContent = "No saved schedules are available yet.";
    return;
  }

  popupState.activeScheduleId = activeSchedule.id;
  renderPicker();
  applySavedPalette(activeSchedule);
  renderSchedule(ui, activeSchedule.courses, null, "am/pm");

  const favoriteSchedule = getFavoriteSchedule(popupState.schedules);
  const isDefaultSchedule = favoriteSchedule?.id === activeSchedule.id;

  ui.empty?.classList.add("is-hidden");
  ui.content?.classList.remove("is-hidden");
  ui.title.textContent = activeSchedule.name;
  ui.meta.textContent = formatScheduleMeta(activeSchedule);
  ui.status.textContent = isDefaultSchedule
    ? "This is the schedule shown when you open the extension outside Workday."
    : favoriteSchedule
      ? "Previewing a different saved schedule."
      : "No default schedule is starred yet, so the newest saved schedule is shown.";
}

async function boot() {
  popupState.basePalettes = captureCourseColorPalettes(document.documentElement);
  popupState.schedules = await loadSavedSchedules();
  popupState.activeScheduleId = getPreferredSchedule(popupState.schedules)?.id || null;

  renderPicker();
  renderActiveSchedule();
}

ui.select?.addEventListener("change", (event) => {
  popupState.activeScheduleId = event.target.value;
  renderActiveSchedule();
});

window.addEventListener("resize", () => {
  if (!popupState.activeScheduleId) return;
  renderActiveSchedule();
});

void boot();
