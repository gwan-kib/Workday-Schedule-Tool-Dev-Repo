import { on, debounce } from "./utilities/dom.js";
import { STATE } from "./core/state.js";
import { ensureMount } from "./utilities/shadowMount.js";

import { loadMainPanel } from "./mainPanel/loadMainPanel.js";
import { extractCoursesData } from "./extraction/index.js";
import { buildHeaderMaps, findWorkdayGrid } from "./extraction/grid.js";
import { createRowCellReader } from "./extraction/rowCellReader.js";

import { filterCourses, sortCourses, wireTableSorting } from "./mainPanel/courseViewSorting.js";
import { renderCourseObjects } from "./mainPanel/renderCourseObjects.js";
import { renderSchedule } from "./mainPanel/scheduleView.js";

import { exportICS } from "./exportLogic/exportIcs.js";

import {
  fetchSectionGradesWithFallback,
  parseCourseInfoFromPromptText,
  readTermCampus,
} from "./averageGrades/gradesApiCall.js";

import {
  canSaveMoreSchedules,
  createScheduleSnapshot,
  getMaxScheduleCount,
  loadSavedSchedules,
  persistSavedSchedules,
  renderSavedSchedules,
} from "./mainPanel/scheduleStorage.js";
import {
  applyCourseColorAssignments,
  captureCourseColorPalettes,
  COURSE_COLOR_COUNT,
  COURSE_COLOR_LABELS,
  DEFAULT_COURSE_COLOR_ASSIGNMENTS,
  loadCourseColorAssignments,
  normalizeCourseColorAssignments,
  persistCourseColorAssignments,
} from "./mainPanel/courseColorSettings.js";
import { loadHoverTooltipSetting, persistHoverTooltipSetting } from "./mainPanel/hoverTooltipSettings.js";

const MAX_COURSE_COLORS = 7;

// Assigns stable color indices to courses if missing. Input: courses array. Output: none.
const assignCourseColors = (courses) => {
  if (!Array.isArray(courses)) return;

  const getCourseKey = (course) => {
    if (!course) return "";
    const code = String(course.code || "")
      .trim()
      .toUpperCase();
    const title = String(course.title || "")
      .trim()
      .toUpperCase();
    if (code || title) return `${code}||${title}`;
    return String(course.section_number || "")
      .trim()
      .toUpperCase();
  };

  const isLecture = (course) => !(course?.isLab || course?.isSeminar || course?.isDiscussion);
  const hasValidColor = (course) =>
    Number.isInteger(course?.colorIndex) && course.colorIndex >= 1 && course.colorIndex <= MAX_COURSE_COLORS;

  let colorCursor = 0;
  const colorByKey = new Map();

  const nextColor = () => {
    colorCursor += 1;
    return ((colorCursor - 1) % MAX_COURSE_COLORS) + 1;
  };

  // First pass: assign base colors to lecture sections only (per course key).
  courses.forEach((course) => {
    if (!course) return;
    const key = getCourseKey(course);
    if (hasValidColor(course)) {
      if (key && !colorByKey.has(key)) colorByKey.set(key, course.colorIndex);
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

  // Second pass: apply lecture color to labs/seminars/discussions (or any remaining).
  courses.forEach((course) => {
    if (!course) return;
    if (hasValidColor(course)) {
      const key = getCourseKey(course);
      if (key && !colorByKey.has(key)) colorByKey.set(key, course.colorIndex);
      return;
    }
    const key = getCourseKey(course);
    if (key && colorByKey.has(key)) {
      course.colorIndex = colorByKey.get(key);
      return;
    }
    const colorIndex = nextColor();
    course.colorIndex = colorIndex;
    if (key) colorByKey.set(key, colorIndex);
  });
};

// Bootstraps the content script UI and event wiring. Input: none. Output: none.
(() => {
  async function boot() {
    const shadowRoot = ensureMount();
    const ui = await loadMainPanel(shadowRoot);

    const courseColorTarget = ui.root?.host || ui.mainPanel;
    const courseColorPalettes = captureCourseColorPalettes(courseColorTarget);
    let courseColorAssignments = await loadCourseColorAssignments();

    if (courseColorTarget && courseColorPalettes.length) {
      courseColorAssignments = normalizeCourseColorAssignments(courseColorAssignments);
      applyCourseColorAssignments(courseColorTarget, courseColorPalettes, courseColorAssignments);
    }

    const renderCourseColorSettings = () => {
      if (!ui.courseColorGrid || !courseColorPalettes.length) return;
      ui.courseColorGrid.innerHTML = "";

      const paletteById = new Map(courseColorPalettes.map((palette) => [palette.id, palette]));

      for (let index = 0; index < COURSE_COLOR_COUNT; index += 1) {
        const courseIndex = index + 1;
        const row = document.createElement("div");
        row.className = "course-color-row";

        const label = document.createElement("div");
        label.className = "course-color-label";
        label.textContent = `Course ${courseIndex}`;

        const control = document.createElement("div");
        control.className = "course-color-control";

        const select = document.createElement("select");
        select.className = "course-color-select";
        select.dataset.courseColor = String(courseIndex);

        courseColorPalettes.forEach((palette, paletteIndex) => {
          const option = document.createElement("option");
          option.value = String(palette.id);
          option.textContent = COURSE_COLOR_LABELS[paletteIndex] || palette.label || `Palette ${palette.id}`;
          if (palette.id === courseColorAssignments[index]) option.selected = true;
          select.appendChild(option);
        });

        const swatch = document.createElement("div");
        swatch.className = "course-color-swatch";

        const updateSwatch = (paletteId) => {
          const palette = paletteById.get(paletteId);
          if (!palette) return;
          swatch.style.background = palette.bg;
          swatch.style.borderColor = palette.border;
        };

        updateSwatch(courseColorAssignments[index]);

        on(select, "change", async () => {
          const paletteId = Number(select.value);
          courseColorAssignments[index] = paletteId;
          courseColorAssignments = normalizeCourseColorAssignments(courseColorAssignments);
          applyCourseColorAssignments(courseColorTarget, courseColorPalettes, courseColorAssignments);
          updateSwatch(paletteId);
          await persistCourseColorAssignments(courseColorAssignments);
        });

        control.appendChild(select);
        control.appendChild(swatch);
        row.appendChild(label);
        row.appendChild(control);
        ui.courseColorGrid.appendChild(row);
      }
    };

    const applyAndPersistCourseColors = async (assignments, { skipPersist = false } = {}) => {
      courseColorAssignments = normalizeCourseColorAssignments(assignments);
      applyCourseColorAssignments(courseColorTarget, courseColorPalettes, courseColorAssignments);
      renderCourseColorSettings();
      if (!skipPersist) await persistCourseColorAssignments(courseColorAssignments);
    };

    renderCourseColorSettings();

    if (ui.courseColorReset) {
      on(ui.courseColorReset, "click", async () => {
        await applyAndPersistCourseColors(DEFAULT_COURSE_COLOR_ASSIGNMENTS);
      });
    }

    const applyHoverTipsSetting = async (enabled, { skipPersist = false } = {}) => {
      const normalized = enabled !== false;
      STATE.view.hoverTipsEnabled = normalized;
      ui.mainPanel?.classList.toggle("is-hover-tooltips-off", !normalized);
      if (ui.hoverTipsToggle) ui.hoverTipsToggle.checked = normalized;
      if (!skipPersist) await persistHoverTooltipSetting(normalized);
    };

    const hoverTipsEnabled = await loadHoverTooltipSetting();
    await applyHoverTipsSetting(hoverTipsEnabled, { skipPersist: true });

    if (ui.hoverTipsToggle) {
      on(ui.hoverTipsToggle, "change", async () => {
        await applyHoverTipsSetting(ui.hoverTipsToggle.checked);
      });
    }

    const updateScheduleView = () => {
      renderSchedule(ui, STATE.filtered, STATE.view.semester, STATE.view.timeFormat);

      const toggleButton = ui.scheduleGrid?.querySelector(".schedule-time-toggle");
      if (toggleButton) {
        toggleButton.textContent = STATE.view.timeFormat === "am/pm" ? "AM/PM" : "24H";
        toggleButton.setAttribute("aria-pressed", String(STATE.view.timeFormat === "am/pm"));
        on(toggleButton, "click", () => {
          STATE.view.timeFormat = STATE.view.timeFormat === "am/pm" ? "24h" : "am/pm";
          updateScheduleView();
        });
      }
    };

    const renderAll = () => {
      if (STATE.sort?.key) sortCourses(STATE.sort.key);
      updateScheduleView();
      renderCourseObjects(ui, STATE.filtered);
    };

    const isMainPanel = (viewKey) => viewKey === STATE.view.panel;

    const setActiveView = (viewKey) => {
      if (isMainPanel(viewKey)) {
        STATE.view.lastMainPanel = viewKey;
      }
      STATE.view.panel = viewKey;

      ui.views.forEach((el) => el.classList.toggle("is-active", el.dataset.panel === viewKey));
      ui.viewTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.panel === viewKey));

      ui.mainPanel.classList.toggle("is-schedule-view", viewKey === "schedule-panel");
      ui.mainPanel.classList.toggle("is-settings-view", viewKey === "settings-panel");
      ui.mainPanel.classList.toggle("is-help-view", viewKey === "help-panel");
    };

    const syncFloatingButtonState = () => {
      ui.floatingButton.classList.toggle("is-collapsed", ui.mainPanel.classList.contains("is-hidden"));
    };

    const toggleMainPanel = () => {
      ui.mainPanel.classList.toggle("is-hidden");
      syncFloatingButtonState();
    };

    syncFloatingButtonState();

    let resolveScheduleModal = null;
    let resolveSchedulePickerModal = null;

    const closeScheduleModal = (value) => {
      if (!ui.saveModal) return;

      ui.saveModal.classList.add("is-hidden");
      ui.saveModal.setAttribute("aria-hidden", "true");

      if (resolveScheduleModal) {
        resolveScheduleModal(value);
        resolveScheduleModal = null;
      }
    };

    const openScheduleModal = ({ title, message, confirmLabel = "Save", showInput = true, showCancel = true }) => {
      if (!ui.saveModal) return Promise.resolve(null);

      ui.saveModalTitle.textContent = title;
      ui.saveModalMessage.textContent = message;
      ui.saveModalConfirm.textContent = confirmLabel;

      ui.saveModalField.classList.toggle("is-hidden", !showInput);
      ui.saveModalCancel.classList.toggle("is-hidden", !showCancel);

      ui.saveModalInput.value = "";
      ui.saveModalInput.classList.remove("is-invalid");

      ui.saveModal.classList.remove("is-hidden");
      ui.saveModal.setAttribute("aria-hidden", "false");

      if (showInput) ui.saveModalInput.focus();
      else ui.saveModalConfirm.focus();

      return new Promise((resolve) => {
        resolveScheduleModal = resolve;
      });
    };

    const closeSchedulePickerModal = (value) => {
      if (!ui.schedulePickerModal) return;

      ui.schedulePickerModal.classList.add("is-hidden");
      ui.schedulePickerModal.setAttribute("aria-hidden", "true");
      ui.schedulePickerList.innerHTML = "";

      if (resolveSchedulePickerModal) {
        resolveSchedulePickerModal(value);
        resolveSchedulePickerModal = null;
      }
    };

    const renderSchedulePickerOptions = (options) => {
      if (!ui.schedulePickerList) return;

      ui.schedulePickerList.innerHTML = "";

      options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "schedule-picker-option";
        button.dataset.scheduleId = option.id;

        const title = document.createElement("span");
        title.className = "schedule-picker-option-title";
        title.textContent = option.title;

        const meta = document.createElement("span");
        meta.className = "schedule-picker-option-meta";
        meta.textContent = `${option.courseCount} course${option.courseCount === 1 ? "" : "s"}`;

        const courses = document.createElement("span");
        courses.className = "schedule-picker-option-courses";
        courses.textContent = option.courseNames.length ? option.courseNames.join(", ") : "No course names detected";

        button.appendChild(title);
        button.appendChild(meta);
        button.appendChild(courses);
        ui.schedulePickerList.appendChild(button);
      });
    };

    const openSchedulePickerModal = ({
      title = "Choose a schedule",
      message = "Multiple schedule tables were found on this page. Choose which one to load.",
      options = [],
    }) => {
      if (!ui.schedulePickerModal || !ui.schedulePickerList) return Promise.resolve(options[0]?.id || null);

      ui.schedulePickerTitle.textContent = title;
      ui.schedulePickerMessage.textContent = message;
      renderSchedulePickerOptions(options);

      ui.schedulePickerModal.classList.remove("is-hidden");
      ui.schedulePickerModal.setAttribute("aria-hidden", "false");

      const firstOption = ui.schedulePickerList.querySelector(".schedule-picker-option");
      if (firstOption) firstOption.focus();
      else ui.schedulePickerCancel?.focus();

      return new Promise((resolve) => {
        resolveSchedulePickerModal = resolve;
      });
    };

    if (ui.saveModal) {
      on(ui.saveModal, "click", (event) => {
        if (event.target === ui.saveModal) return closeScheduleModal(null);

        const action = event.target.closest("[data-action]")?.dataset.action;
        if (!action) return;

        if (action === "close" || action === "cancel") return closeScheduleModal(null);

        if (action === "confirm") {
          const needsInput = !ui.saveModalField.classList.contains("is-hidden");
          if (needsInput) {
            const value = ui.saveModalInput.value.trim();
            if (!value) {
              ui.saveModalInput.classList.add("is-invalid");
              ui.saveModalInput.focus();
              return;
            }
            return closeScheduleModal(value);
          }
          return closeScheduleModal(true);
        }
      });

      on(ui.saveModalInput, "input", () => ui.saveModalInput.classList.remove("is-invalid"));
      on(ui.saveModalInput, "keydown", (event) => {
        if (event.key === "Enter") ui.saveModalConfirm.click();
      });

      on(document, "keydown", (event) => {
        if (event.key === "Escape" && !ui.saveModal.classList.contains("is-hidden")) closeScheduleModal(null);
      });
    }

    if (ui.schedulePickerModal) {
      on(ui.schedulePickerModal, "click", (event) => {
        if (event.target === ui.schedulePickerModal) return closeSchedulePickerModal(null);

        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "close" || action === "cancel") return closeSchedulePickerModal(null);

        const option = event.target.closest("[data-schedule-id]");
        if (option) return closeSchedulePickerModal(option.dataset.scheduleId);
      });

      on(document, "keydown", (event) => {
        if (event.key === "Escape" && !ui.schedulePickerModal.classList.contains("is-hidden")) {
          closeSchedulePickerModal(null);
        }
      });
    }

    const loadCoursesFromPage = async ({ preserveExisting = false } = {}) => {
      const extractedCourses = await extractCoursesData({
        selectSchedule: (options) =>
          openSchedulePickerModal({
            title: "Select a schedule",
            message: "Multiple schedule tables detected. Select the one you would like to load:",
            options,
          }),
      });

      if (extractedCourses === null) {
        if (!preserveExisting) {
          STATE.courses = [];
          STATE.filtered = [];
          STATE.currentScheduleName = null;
        }
        return false;
      }

      STATE.courses = extractedCourses;
      assignCourseColors(STATE.courses);
      STATE.currentScheduleName = null;
      filterCourses(ui.searchInput.value);
      return true;
    };

    ui.viewTabs.forEach((button) => {
      on(button, "click", () => {
        setActiveView(button.dataset.panel);
        if (button.dataset.panel === "schedule-panel") updateScheduleView();
      });
    });

    on(ui.floatingButton, "click", toggleMainPanel);

    const setExportOpen = (isOpen) => {
      if (!ui.exportDropdown || !ui.exportButton) return;
      ui.exportDropdown.classList.toggle("is-open", isOpen);
      ui.exportButton.setAttribute("aria-expanded", String(isOpen));
    };

    on(ui.exportButton, "click", () => {
      const isOpen = ui.exportDropdown.classList.contains("is-open");
      setExportOpen(!isOpen);
    });

    on(document, "click", (event) => {
      const path = event.composedPath ? event.composedPath() : [];

      if (ui.exportDropdown?.classList.contains("is-open") && !path.includes(ui.exportDropdown)) {
        setExportOpen(false);
      }

      if (ui.savedDropdown?.open && !path.includes(ui.savedDropdown)) {
        ui.savedDropdown.open = false;
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "TOGGLE_WIDGET") toggleMainPanel();
    });

    on(ui.refreshButton, "click", async () => {
      ui.refreshButton.classList.remove("rotate");
      void ui.refreshButton.offsetWidth;
      ui.refreshButton.classList.add("rotate");

      const loaded = await loadCoursesFromPage({ preserveExisting: true });
      if (loaded) renderAll();
    });

    on(ui.clearButton, "click", () => {
      STATE.courses = [];
      STATE.filtered = [];
      STATE.currentScheduleName = null;
      ui.searchInput.value = "";
      renderAll();
    });

    const handleExport = async (type) => {
      if (type === "ics") exportICS(STATE.currentScheduleName);
    };

    on(ui.exportMenu, "click", async (event) => {
      const action = event.target.closest("[data-export]");
      if (!action) return;

      setExportOpen(false);
      await handleExport(action.dataset.export);
    });

    on(ui.saveScheduleButton, "click", async () => {
      if (!canSaveMoreSchedules(STATE.savedSchedules)) {
        await openScheduleModal({
          title: "Schedule limit reached",
          message: `You can only save up to ${getMaxScheduleCount()} schedules. Delete one to save another.`,
          confirmLabel: "Got it",
          showInput: false,
          showCancel: false,
        });
        return;
      }

      const name = await openScheduleModal({
        title: "Save schedule",
        message: "Name this schedule so you can find it later.",
        confirmLabel: "Save",
        showInput: true,
        showCancel: true,
      });

      if (!name) return;

      const snapshot = createScheduleSnapshot(name, STATE.filtered, courseColorAssignments);
      STATE.savedSchedules = [snapshot, ...STATE.savedSchedules];

      await persistSavedSchedules(STATE.savedSchedules);
      renderSavedSchedules(ui, STATE.savedSchedules);

      if (ui.savedDropdown) ui.savedDropdown.open = true;
    });

    on(ui.savedMenu, "click", async (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;

      const card = actionButton.closest(".schedule-saved-card");
      const scheduleId = card?.dataset.id;
      if (!scheduleId) return;

      const selected = STATE.savedSchedules.find((s) => s.id === scheduleId);
      if (!selected) return;

      if (actionButton.dataset.action === "delete") {
        const confirmed = await openScheduleModal({
          title: "Permanently Delete Schedule?",
          message: `This action will permanently delete "${selected.name}".`,
          confirmLabel: "Delete",
          showInput: false,
          showCancel: true,
        });
        if (!confirmed) return;

        STATE.savedSchedules = STATE.savedSchedules.filter((s) => s.id !== scheduleId);
        await persistSavedSchedules(STATE.savedSchedules);
        renderSavedSchedules(ui, STATE.savedSchedules);
        return;
      }

      STATE.currentScheduleName = selected.name;
      if (selected.colorAssignments && courseColorPalettes.length) {
        await applyAndPersistCourseColors(selected.colorAssignments);
      }

      STATE.courses = [...selected.courses];
      assignCourseColors(STATE.courses);
      STATE.filtered = [...selected.courses];
      ui.searchInput.value = "";

      renderAll();
      setActiveView("course-list-panel");
      if (ui.savedDropdown) ui.savedDropdown.open = false;
    });

    on(ui.settingsButton, "click", () => {
      ui.mainPanel.classList.remove("is-hidden");
      ui.floatingButton.classList.remove("is-collapsed");
      if (STATE.view.panel === "settings-panel") {
        const backTo = STATE.view.lastMainPanel || "course-list-panel";
        setActiveView(backTo);
        if (backTo === "schedule-panel") updateScheduleView();
        return;
      }
      setActiveView("settings-panel");
    });

    on(ui.helpButton, "click", () => {
      ui.mainPanel.classList.remove("is-hidden");
      ui.floatingButton.classList.remove("is-collapsed");
      if (STATE.view.panel === "help-panel") {
        const backTo = STATE.view.lastMainPanel || "course-list-panel";
        setActiveView(backTo);
        if (backTo === "schedule-panel") updateScheduleView();
        return;
      }
      setActiveView("help-panel");
    });

    on(
      ui.searchInput,
      "input",
      debounce(() => {
        filterCourses(ui.searchInput.value);
        renderAll();
      }, 100),
    );

    wireTableSorting(ui);

    STATE.savedSchedules = await loadSavedSchedules();
    renderSavedSchedules(ui, STATE.savedSchedules);

    await loadCoursesFromPage();

    renderAll();

    setActiveView(STATE.view.panel);

    let termCampus = readTermCampus();

    const extractAverage = (data) => {
      if (!data) return null;
      if (Array.isArray(data)) {
        for (const item of data) {
          const avg = extractAverage(item);
          if (avg != null) return avg;
        }
        return null;
      }
      if (typeof data !== "object") return null;
      const direct =
        data.average ?? data.avg ?? data.average_grade ?? data.averagePercent ?? data.avgPercent ?? data.mean ?? null;
      if (typeof direct === "number") return direct;
      if (typeof direct === "string" && direct.trim()) return direct.trim();

      const nested = data?.grades?.average ?? data?.grades?.avg ?? data?.summary?.average ?? data?.summary?.avg ?? null;
      if (typeof nested === "number") return nested;
      if (typeof nested === "string" && nested.trim()) return nested.trim();

      return null;
    };

    const buildAverageLabel = (average) => {
      if (average == null) return "Average:\nN/A";
      if (typeof average === "number") return `Average:\n${average.toFixed(1)}%`;
      return `Average:\n${average}%`;
    };

    const hasValidAverage = (data) => extractAverage(data) != null;
    const lectureLike = (text) => /\blecture\b/i.test(String(text || ""));
    const labLike = (text) => /\b(laboratory)\b/i.test(String(text || ""));
    const seminarLike = (text) => /\bseminar\b/i.test(String(text || ""));
    const discussionLike = (text) => /\bdiscussion\b/i.test(String(text || ""));
    const isLectureFormat = (text) =>
      lectureLike(text) && !labLike(text) && !seminarLike(text) && !discussionLike(text);
    const registrationRowSelector = "tr, [role='row'], .wd-GridRow, .grid-row";

    let registrationGridContext = null;

    const getRegistrationGridContext = () => {
      if (registrationGridContext?.root?.isConnected) return registrationGridContext;

      const grid = findWorkdayGrid();
      if (!grid?.root) return null;

      registrationGridContext = {
        root: grid.root,
        headerMaps: buildHeaderMaps(grid.root),
      };

      return registrationGridContext;
    };

    const shouldShowAverageButtonForRegistration = (headerWrapper) => {
      const row = headerWrapper?.closest?.(registrationRowSelector);
      if (!row) return false;

      const gridContext = getRegistrationGridContext();
      if (gridContext?.root?.contains(row)) {
        const { readCellTextByHeader } = createRowCellReader(row, gridContext.headerMaps);
        const instructionalFormat = readCellTextByHeader("instructionalFormat");
        if (instructionalFormat) return isLectureFormat(instructionalFormat);
      }

      return isLectureFormat(row.innerText || headerWrapper.innerText || "");
    };

    const createAverageButton = (courseInfo) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "registration__avg-button";
      button.textContent = "Class Average\n(past 5 years)";

      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (button.dataset.loading === "true") return;
        button.dataset.loading = "true";
        button.textContent = "loading...";
        button.disabled = true;

        termCampus = readTermCampus() || termCampus;
        if (!termCampus) {
          button.textContent = "Average:\nunavailable";
          button.disabled = false;
          button.dataset.loading = "false";
          return;
        }

        try {
          const data = await fetchSectionGradesWithFallback(
            {
              campus: termCampus.campus,
              yearsession: termCampus.yearsession,
              subject: courseInfo.subject,
              course: courseInfo.course,
              section: courseInfo.section,
            },
            { isValid: hasValidAverage },
          );

          if (!data) {
            button.textContent = "Average:\nunavailable";
          } else {
            const avg = extractAverage(data);
            button.textContent = buildAverageLabel(avg);
          }
        } catch (error) {
          button.textContent = "Average:\nunavailable";
        } finally {
          button.disabled = false;
          button.dataset.loading = "false";
        }
      });

      return button;
    };

    const ensureAverageButton = (headerWrapper) => {
      if (!headerWrapper || !(headerWrapper instanceof Element)) return;
      if (headerWrapper.previousElementSibling?.classList?.contains("registration__avg-button")) {
        return;
      }

      if (!shouldShowAverageButtonForRegistration(headerWrapper)) return;

      const parentElement = headerWrapper.parentElement;
      if (parentElement) {
        parentElement.style.display = "flex";
        parentElement.style.alignItems = "center";
      }

      const promptOption = headerWrapper.querySelector?.('[data-automation-id="promptOption"]') || headerWrapper;
      const str =
        promptOption.getAttribute?.("data-automation-label") ||
        promptOption.getAttribute?.("title") ||
        promptOption.getAttribute?.("aria-label") ||
        promptOption.textContent ||
        "";

      const courseInfo = parseCourseInfoFromPromptText(str);
      if (!courseInfo) return;

      const button = createAverageButton(courseInfo);
      headerWrapper.parentNode?.insertBefore(button, headerWrapper);
    };

    const averageButtonSelector = "div.WHPF.WFPF, div.WHMF.WFMF";

    const handleAverageButtonNodes = (node) => {
      if (!(node instanceof Element)) return;
      if (node.matches?.(averageButtonSelector)) {
        ensureAverageButton(node);
      }
      const matches = node.querySelectorAll?.(averageButtonSelector) || [];
      matches.forEach((el) => ensureAverageButton(el));
    };

    const avgButtonObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type !== "childList" || mutation.addedNodes.length === 0) return;
        mutation.addedNodes.forEach((node) => handleAverageButtonNodes(node));
      });
    });

    avgButtonObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("beforeunload", () => {
      avgButtonObserver.disconnect();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
