import { on, debounce } from "./utilities/dom.js";
import { STATE } from "./core/state.js";
import { ensureMount } from "./utilities/shadowMount.js";

import { loadMainPanel } from "./mainPanel/loadMainPanel.js";
import { extractCoursesData } from "./extraction/index.js";

import { filterCourses, sortCourses, wireTableSorting } from "./mainPanel/mainPanelInteractions.js";
import { renderCourseRows } from "./mainPanel/renderCourseRows.js";
import { renderSchedule } from "./mainPanel/scheduleView.js";

import { exportICS } from "./exportLogic/exportIcs.js";

import {
  attachCourseHoverListener,
  fetchSectionGradesWithFallback,
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

(() => {
  console.log("[WD] content script loaded");

  async function boot() {
    const shadowRoot = ensureMount();
    const ui = await loadMainPanel(shadowRoot);

    // ---------------------------
    // Helpers
    // ---------------------------
    const updateScheduleView = () => {
      renderSchedule(ui, STATE.filtered, STATE.view.semester);
    };

    const renderAll = () => {
      sortCourses(STATE.sort.key || "code");
      renderCourseRows(ui, STATE.filtered);
      updateScheduleView();
    };

    const setActiveView = (viewKey) => {
      STATE.view.panel = viewKey;

      ui.views.forEach((el) => el.classList.toggle("is-active", el.dataset.panel === viewKey));
      ui.viewTabs.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.panel === viewKey));

      ui.mainPanel.classList.toggle("is-schedule-view", viewKey === "schedule");
      ui.mainPanel.classList.toggle("is-settings-view", viewKey === "settings");
      ui.mainPanel.classList.toggle("is-help-view", viewKey === "help");
    };

    const syncFloatingButtonState = () => {
      ui.floatingButton.classList.toggle("is-collapsed", ui.mainPanel.classList.contains("is-hidden"));
    };

    const toggleMainPanel = () => {
      ui.mainPanel.classList.toggle("is-hidden");
      syncFloatingButtonState();
    };

    syncFloatingButtonState();

    // ---------------------------
    // Modal (Save Schedule)
    // ---------------------------
    let resolveScheduleModal = null;

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

    // ---------------------------
    // Views + semester toggles
    // ---------------------------
    ui.viewTabs.forEach((btn) => {
      on(btn, "click", () => {
        setActiveView(btn.dataset.panel);
        if (btn.dataset.panel === "schedule") updateScheduleView();
      });
    });

    ui.semesterButtons.forEach((btn) => {
      on(btn, "click", () => {
        STATE.view.semester = btn.dataset.semester;

        ui.semesterButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.semester === STATE.view.semester));
        updateScheduleView();
      });
    });

    on(ui.floatingButton, "click", toggleMainPanel);

    // ---------------------------
    // Dropdowns (export + saved)
    // ---------------------------
    const setExportOpen = (isOpen) => {
      if (!ui.exportDropdown || !ui.exportButton) return;
      ui.exportDropdown.classList.toggle("is-open", isOpen);
      ui.exportButton.setAttribute("aria-expanded", String(isOpen));
    };

    on(ui.exportButton, "click", () => {
      const isOpen = ui.exportDropdown.classList.contains("is-open");
      setExportOpen(!isOpen);
    });

    // Single click-outside handler (closes both export + saved dropdowns)
    on(document, "click", (event) => {
      const path = event.composedPath ? event.composedPath() : [];

      // Export dropdown: class-based
      if (ui.exportDropdown?.classList.contains("is-open") && !path.includes(ui.exportDropdown)) {
        setExportOpen(false);
      }

      // Saved dropdown: <details open>
      if (ui.savedDropdown?.open && !path.includes(ui.savedDropdown)) {
        ui.savedDropdown.open = false;
      }
    });

    // ---------------------------
    // Messages
    // ---------------------------
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "TOGGLE_WIDGET") toggleMainPanel();
    });

    // ---------------------------
    // Refresh (re-extract)
    // ---------------------------
    on(ui.refreshButton, "click", async () => {
      ui.refreshButton.classList.remove("rotate"); // reset if clicked fast
      void ui.refreshButton.offsetWidth; // force reflow
      ui.refreshButton.classList.add("rotate");

      STATE.courses = await extractCoursesData();
      STATE.currentScheduleName = null; // reset schedule name on refresh
      filterCourses(ui.searchInput.value);
      renderAll();
    });

    // ---------------------------
    // Export actions
    // ---------------------------
    const handleExport = async (type) => {
      if (type === "ics") exportICS(STATE.currentScheduleName);
    };

    on(ui.exportMenu, "click", async (event) => {
      const action = event.target.closest("[data-export]");
      if (!action) return;

      setExportOpen(false);
      await handleExport(action.dataset.export);
    });

    // ---------------------------
    // Save schedules
    // ---------------------------
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

      const snapshot = createScheduleSnapshot(name, STATE.filtered);
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

      // Load
      STATE.currentScheduleName = selected.name;
      STATE.courses = [...selected.courses];
      STATE.filtered = [...selected.courses];
      ui.searchInput.value = "";

      renderAll();
      setActiveView("schedule");
      if (ui.savedDropdown) ui.savedDropdown.open = false;
    });

    // ---------------------------
    // Settings/help shortcuts
    // ---------------------------
    on(ui.settingsButton, "click", () => {
      ui.mainPanel.classList.remove("is-hidden");
      ui.floatingButton.classList.remove("is-collapsed");
      setActiveView("settings");
    });

    on(ui.helpButton, "click", () => {
      ui.mainPanel.classList.remove("is-hidden");
      ui.floatingButton.classList.remove("is-collapsed");
      setActiveView("help");
    });

    // ---------------------------
    // Search filter
    // ---------------------------
    on(
      ui.searchInput,
      "input",
      debounce(() => {
        filterCourses(ui.searchInput.value);
        renderAll();
      }, 100),
    );

    wireTableSorting(ui);

    // ---------------------------
    // Initial load
    // ---------------------------
    STATE.savedSchedules = await loadSavedSchedules();
    renderSavedSchedules(ui, STATE.savedSchedules);

    STATE.courses = await extractCoursesData();
    STATE.filtered = [...STATE.courses];

    STATE.sort = STATE.sort || { key: "code", dir: 1 };
    sortCourses("code");

    renderCourseRows(ui, STATE.filtered);
    updateScheduleView();

    setActiveView(STATE.view.panel);

    // ---------------------------
    // Hover averages (UBC Grades)
    // ---------------------------
    const hoverTooltip = document.createElement("div");
    hoverTooltip.id = "wd-average-grade-tooltip";
    hoverTooltip.style.position = "fixed";
    hoverTooltip.style.zIndex = "999999";
    hoverTooltip.style.pointerEvents = "none";
    hoverTooltip.style.background = "rgba(20, 20, 20, 0.92)";
    hoverTooltip.style.color = "#fff";
    hoverTooltip.style.padding = "6px 8px";
    hoverTooltip.style.borderRadius = "6px";
    hoverTooltip.style.fontSize = "12px";
    hoverTooltip.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    hoverTooltip.style.maxWidth = "260px";
    hoverTooltip.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.18)";
    hoverTooltip.style.opacity = "0";
    hoverTooltip.style.transition = "opacity 120ms ease";
    document.body.appendChild(hoverTooltip);

    let termCampus = readTermCampus();
    let lastKey = null;
    let activeAbort = null;

    const setTooltip = (text) => {
      hoverTooltip.textContent = text;
      hoverTooltip.style.opacity = "1";
    };

    const hideTooltip = () => {
      hoverTooltip.style.opacity = "0";
      hoverTooltip.textContent = "";
    };

    const updateTooltipPosition = (event) => {
      const offset = 14;
      const x = Math.min(window.innerWidth - 20, event.clientX + offset);
      const y = Math.min(window.innerHeight - 20, event.clientY + offset);
      hoverTooltip.style.left = `${x}px`;
      hoverTooltip.style.top = `${y}px`;
    };

    const extractAverage = (data) => {
      if (!data || typeof data !== "object") return null;
      const direct =
        data.average ??
        data.avg ??
        data.average_grade ??
        data.averagePercent ??
        data.avgPercent ??
        data.mean ??
        null;
      if (typeof direct === "number") return direct;
      if (typeof direct === "string" && direct.trim()) return direct.trim();

      const nested =
        data?.grades?.average ??
        data?.grades?.avg ??
        data?.summary?.average ??
        data?.summary?.avg ??
        null;
      if (typeof nested === "number") return nested;
      if (typeof nested === "string" && nested.trim()) return nested.trim();

      return null;
    };

    const buildAverageLabel = (average) => {
      if (average == null) return "Average: N/A";
      if (typeof average === "number") return `Average: ${average.toFixed(1)}`;
      return `Average: ${average}`;
    };

    const cleanupHover = attachCourseHoverListener({
      onCourse: async ({ subject, course, section }) => {
        termCampus = termCampus || readTermCampus();
        if (!termCampus) return;

        const key = [termCampus.campus, termCampus.yearsession, subject, course, section].join("|");
        if (key === lastKey) return;
        lastKey = key;

        if (activeAbort) activeAbort.abort();
        activeAbort = new AbortController();

        setTooltip("Average: loading...");

        try {
          const data = await fetchSectionGradesWithFallback(
            {
              campus: termCampus.campus,
              yearsession: termCampus.yearsession,
              subject,
              course,
              section,
            },
            { signal: activeAbort.signal },
          );

          const avg = extractAverage(data);
          setTooltip(buildAverageLabel(avg));
        } catch (error) {
          if (error?.name === "AbortError") return;
          setTooltip("Average: unavailable");
        }
      },
    });

    on(document, "mousemove", updateTooltipPosition);
    on(document, "mouseout", (event) => {
      const leaving = event.target?.closest?.('[data-automation-id="promptOption"]');
      if (leaving) hideTooltip();
    });

    window.addEventListener("beforeunload", () => {
      cleanupHover();
      hideTooltip();
      hoverTooltip.remove();
      if (activeAbort) activeAbort.abort();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
