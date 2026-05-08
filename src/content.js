import { on, debounce } from "./utilities/dom.js";
import { STATE } from "./core/state.js";
import { ensureMount } from "./utilities/shadowMount.js";
import { debugFor, debugLog } from "./utilities/debugTool.js";

import { extractCoursesData } from "./extraction/index.js";
import {
  extractWorkdayCourseIdFromElement,
  fetchCourseFromWorkdayId,
  fetchCourseFromWorkdayLink,
  validateWorkdayCourseLink,
  WRONG_COURSE_LINK_ERROR,
} from "./extraction/singleCourseImport.js";
import { setupRegistrationAverageButtons } from "./averageGrades/registrationAverageButtons.js";
import { exportICS } from "./exportLogic/exportIcs.js";
import {
  buildCalendarViewUrl,
  requestCalendarAuthState,
  requestDisconnectCalendar,
  requestSignInCalendar,
  requestSyncCoursesToCalendar,
} from "./googleCalendar/calendarIntegration.js";
import { loadMainPanel } from "./mainPanel/loadMainPanel.js";
import { createCourseColorController } from "./mainPanel/courseColorController.js";
import { initializeHoverTooltipController } from "./mainPanel/hoverTooltipController.js";
import { createPanelViewController } from "./mainPanel/panelViewController.js";
import { createScheduleModalController, createSchedulePickerController } from "./mainPanel/scheduleModals.js";
import { filterCourses, sortCourses, wireTableSorting } from "./mainPanel/courseViewSorting.js";
import { renderCourseObjects } from "./mainPanel/renderCourseObjects.js";
import { renderSchedule } from "./mainPanel/scheduleView.js";
import {
  canSaveMoreSchedules,
  createScheduleSnapshot,
  getMaxScheduleCount,
  loadSavedSchedules,
  persistSavedSchedules,
  renderSavedSchedules,
  togglePreferredSchedule,
} from "./mainPanel/scheduleStorage.js";

const debug = debugFor("content");
debugLog({ local: { content: false } });

// Bootstraps the content script UI and event wiring. Input: none. Output: none.
(() => {
  async function boot() {
    debug.log({ id: "boot.start" }, "Booting content script");

    // Mount the extension UI, then hand feature-specific responsibilities off to the
    // smaller controllers so this file mostly stays as the top-level coordinator.
    const shadowRoot = ensureMount();
    const ui = await loadMainPanel(shadowRoot);
    const courseColorController = await createCourseColorController(ui);
    await initializeHoverTooltipController(ui, STATE.view);
    const { setActiveView, toggleMainPanel } = createPanelViewController(ui, STATE.view);
    const { openScheduleModal } = createScheduleModalController(ui);
    const { openSchedulePickerModal } = createSchedulePickerController(ui);

    // Rebuild the visual views from shared STATE whenever schedule data or view settings change.
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

    // Render all main data-driven UI surfaces together so list/schedule views stay in sync.
    const renderAll = () => {
      if (STATE.sort?.key) sortCourses(STATE.sort.key);
      updateScheduleView();
      renderCourseObjects(ui, STATE.filtered, {
        hasLoadedSchedule: STATE.courses.length > 0,
        onRemoveCourse: removeCourseFromSchedule,
      });
    };

    // Extract the current page's schedule data from Workday, normalize it into STATE,
    // and preserve the current UI when requested.
    const loadCoursesFromPage = async ({ preserveExisting = false } = {}) => {
      debug.log({ id: "loadCoursesFromPage.start" }, "Loading courses from page", { preserveExisting });
      const extractedCourses = await extractCoursesData({
        selectSchedule: (options) =>
          openSchedulePickerModal({
            title: "Select a schedule",
            message: "Multiple schedule tables detected. Select the one you would like to load:",
            options,
          }),
      });

      if (extractedCourses === null) {
        debug.warn({ id: "loadCoursesFromPage.noCourses" }, "No courses were extracted", { preserveExisting });
        if (!preserveExisting) {
          STATE.courses = [];
          STATE.filtered = [];
          STATE.currentSavedScheduleId = null;
          STATE.currentScheduleName = null;
          renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
        }
        return false;
      }

      STATE.courses = extractedCourses;
      courseColorController.assignCourseColors(STATE.courses);
      STATE.currentSavedScheduleId = null;
      STATE.currentScheduleName = null;
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      filterCourses(ui.searchInput.value);
      debug.log({ id: "loadCoursesFromPage.complete" }, "Loaded courses from page", {
        courseCount: STATE.courses.length,
      });
      return true;
    };

    // Tab buttons only switch between the already-mounted views; they do not rebuild the UI shell.
    ui.viewTabs.forEach((button) => {
      on(button, "click", () => {
        setActiveView(button.dataset.panel);
        if (button.dataset.panel === "schedule-panel") updateScheduleView();
      });
    });

    // Export behaves like a small dropdown menu, so these handlers keep its open/close state in sync.
    const setExportOpen = (isOpen) => {
      if (!ui.exportDropdown || !ui.exportButton) return;
      debug.log({ id: "setExportOpen" }, "Setting export dropdown state", { isOpen });
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

    // These controls manage the live schedule currently loaded from the page.
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
      STATE.currentSavedScheduleId = null;
      STATE.currentScheduleName = null;
      ui.searchInput.value = "";
      renderAll();
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
    });

    // Posts a transient status message into the widget footer; auto-clears after a few seconds.
    let footerAlertTimeout = 0;
    const showFooterAlert = (text, { tone = "info", durationMs = 6000 } = {}) => {
      if (!ui.footerAlert) return;
      clearTimeout(footerAlertTimeout);
      ui.footerAlert.textContent = text;
      ui.footerAlert.classList.remove("is-hidden");
      ui.footerAlert.dataset.tone = tone;
      if (durationMs > 0) {
        footerAlertTimeout = setTimeout(() => {
          ui.footerAlert.classList.add("is-hidden");
          ui.footerAlert.textContent = "";
        }, durationMs);
      }
    };

    const getCourseIdentityKey = (course) =>
      (course?.workdayCourseId ? [`id:${course.workdayCourseId}`] : [course?.code, course?.section_number])
        .map((part) =>
          String(part || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase(),
        )
        .join("|");

    const addSingleCourseToSchedule = (course) => {
      if (!course?.code || !course?.section_number) {
        showFooterAlert("Could not add the course because its section details were incomplete.", { tone: "warn" });
        return false;
      }

      const courseKey = getCourseIdentityKey(course);
      if (STATE.courses.some((existing) => getCourseIdentityKey(existing) === courseKey)) {
        showFooterAlert(`${course.code} ${course.section_number} is already in the extension.`, { tone: "warn" });
        return false;
      }

      // Add the course through the same state path used by full schedule imports so rendering,
      // colors, conflict detection, search filtering, and exports stay consistent.
      STATE.courses = [...STATE.courses, course];
      courseColorController.assignCourseColors(STATE.courses);
      STATE.currentSavedScheduleId = null;
      STATE.currentScheduleName = null;
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      filterCourses(ui.searchInput.value);
      renderAll();
      showFooterAlert(`${course.code} ${course.section_number} added to the extension.`, { tone: "info" });
      return true;
    };

    const removeCourseFromSchedule = (course) => {
      const courseKey = getCourseIdentityKey(course);
      const initialCount = STATE.courses.length;
      let removed = false;

      STATE.courses = STATE.courses.filter((existing) => {
        if (existing === course && !removed) {
          removed = true;
          return false;
        }

        if (!removed && courseKey && getCourseIdentityKey(existing) === courseKey) {
          removed = true;
          return false;
        }

        return true;
      });

      if (STATE.courses.length === initialCount) return;

      STATE.currentSavedScheduleId = null;
      STATE.currentScheduleName = null;
      filterCourses(ui.searchInput.value);
      renderAll();
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      showFooterAlert(`${course.code || "Course"} ${course.section_number || ""} removed from the extension.`, {
        tone: "info",
      });
    };

    const getManualCourseImportFailureMessage = (error) => {
      const message = String(error?.message || error || "Unknown error");
      if (message === WRONG_COURSE_LINK_ERROR) return "Could not add course: Wrong course link";
      return `Could not add that course: ${message}`;
    };

    const importCourseFromRegistrationCard = async ({ row, link }) => {
      const courseId = extractWorkdayCourseIdFromElement(row);
        if (courseId) {
          try {
            const course = await fetchCourseFromWorkdayId(courseId);
            return addSingleCourseToSchedule(course);
          } catch (error) {
            debug.warn(
              { id: "registrationCourseImport.idFetchFailed" },
            "Could not fetch course by Workday ID",
              {
                courseId,
                error: String(error?.message || error),
              },
            );
            showFooterAlert("Could not load that course from Workday. Try again after opening the course details.", {
              tone: "warn",
            });
            return false;
          }
        }

        if (link) {
          try {
            const linkedCourse = await fetchCourseFromWorkdayLink(link);
            return addSingleCourseToSchedule(linkedCourse);
          } catch (error) {
            debug.warn(
              { id: "registrationCourseImport.linkFetchFailed" },
            "Could not fetch course by Workday link",
              {
                error: String(error?.message || error),
              },
            );
            showFooterAlert("Could not load that Workday course link.", { tone: "warn" });
            return false;
          }
        }

        showFooterAlert("Could not find a Workday course ID for that course card.", {
          tone: "warn",
        });
        return false;
    };

    const importCourseFromManualLink = async () => {
      const link = await openScheduleModal({
        title: "Add Course",
        message:
          "Paste the Workday course section link.\n(for Saved Schedules, it's the link in the section column)",
        confirmLabel: "Add Course",
        showInput: true,
        showCancel: true,
        inputLabel: "Course link",
        inputPlaceholder: "Paste Workday course URL here",
      });
      if (!link) return;

      const validation = validateWorkdayCourseLink(link);
      if (!validation.ok) {
        const message =
          validation.error === WRONG_COURSE_LINK_ERROR
            ? getManualCourseImportFailureMessage(validation.error)
            : validation.error;
        showFooterAlert(message, { tone: "warn" });
        return;
      }

      if (ui.addCourseButton) ui.addCourseButton.disabled = true;
      showFooterAlert("Loading course from Workday...", { tone: "info", durationMs: 0 });
      try {
        const course = await fetchCourseFromWorkdayLink(validation.url);
        addSingleCourseToSchedule(course);
      } catch (error) {
        debug.warn({ id: "manualCourseImport.failed" }, "Manual course import failed", error);
        showFooterAlert(getManualCourseImportFailureMessage(error), { tone: "warn" });
      } finally {
        if (ui.addCourseButton) ui.addCourseButton.disabled = false;
      }
    };

    on(ui.addCourseButton, "click", importCourseFromManualLink);

    let googleCalendarSignedIn = false;

    const renderGoogleAccountControls = () => {
      if (!ui.googleSignInButton || !ui.googleSignOutButton) return;

      if (googleCalendarSignedIn) {
        const checkIcon = document.createElement("span");
        checkIcon.className = "material-symbols-rounded";
        checkIcon.setAttribute("aria-hidden", "true");
        checkIcon.textContent = "check";
        ui.googleSignInButton.replaceChildren(document.createTextNode("Signed In"), checkIcon);
      } else {
        const loginIcon = document.createElement("span");
        loginIcon.className = "material-symbols-rounded";
        loginIcon.setAttribute("aria-hidden", "true");
        loginIcon.textContent = "login";
        ui.googleSignInButton.replaceChildren(document.createTextNode("Sign into Your Google Account"), loginIcon);
      }
      ui.googleSignInButton.disabled = googleCalendarSignedIn;
      ui.googleSignInButton.setAttribute("aria-pressed", String(googleCalendarSignedIn));
      ui.googleSignOutButton.classList.toggle("is-hidden", !googleCalendarSignedIn);
    };

    const refreshGoogleAccountState = async () => {
      const { signedIn } = await requestCalendarAuthState();
      googleCalendarSignedIn = signedIn;
      renderGoogleAccountControls();
      return signedIn;
    };

    const requireGoogleSignInForSync = async () => {
      let signedIn = false;
      try {
        signedIn = await refreshGoogleAccountState();
      } catch (error) {
        showFooterAlert(`Could not check Google sign-in: ${error.message}`, { tone: "warn" });
        return false;
      }

      if (signedIn) return true;

      showFooterAlert("Go to Settings and sign into Google first.", { tone: "warn" });
      return false;
    };

    const handleExport = async (type) => {
      debug.log({ id: "handleExport" }, "Handling export action", { type });
      if (type === "ics") return exportICS(STATE.currentScheduleName);

      if (type === "gcal-sync") {
        if (!(await requireGoogleSignInForSync())) return;

        if (!STATE.filtered?.length) {
          showFooterAlert("No courses to sync.", { tone: "warn" });
          return;
        }
        showFooterAlert("Syncing to Google Calendar…", { tone: "info", durationMs: 0 });
        try {
          const summary = await requestSyncCoursesToCalendar(STATE.filtered);
          const tone = summary.failed || summary.deleteFailed ? "warn" : "info";
          const parts = [`Synced ${summary.added} event(s) to Google Calendar`];
          if (summary.removed) parts.push(`replaced ${summary.removed} previous`);
          if (summary.failed) parts.push(`${summary.failed} failed`);
          if (summary.deleteFailed) parts.push(`${summary.deleteFailed} old not removed`);
          if (summary.skipped) parts.push(`${summary.skipped} unparseable line(s) skipped`);
          showFooterAlert(parts.join(" • "), { tone });

          if (summary.added > 0) {
            window.open(buildCalendarViewUrl(STATE.filtered), "_blank", "noopener");
          }
        } catch (error) {
          debug.error("Calendar sync failed", error);
          showFooterAlert(`Could not sync to Google Calendar: ${error.message}`, { tone: "warn" });
        }
      }
    };

    renderGoogleAccountControls();

    on(ui.googleSignInButton, "click", async () => {
      ui.googleSignInButton.disabled = true;
      ui.googleSignOutButton.disabled = true;
      try {
        const { signedIn } = await requestSignInCalendar();
        googleCalendarSignedIn = signedIn;
        renderGoogleAccountControls();
        showFooterAlert("Signed into Google.", { tone: "info" });
      } catch (error) {
        googleCalendarSignedIn = false;
        renderGoogleAccountControls();
        showFooterAlert(`Could not sign into Google: ${error.message}`, { tone: "warn" });
      } finally {
        ui.googleSignOutButton.disabled = false;
        if (!googleCalendarSignedIn) ui.googleSignInButton.disabled = false;
      }
    });

    on(ui.googleSignOutButton, "click", async () => {
      ui.googleSignInButton.disabled = true;
      ui.googleSignOutButton.disabled = true;
      try {
        await requestDisconnectCalendar();
        googleCalendarSignedIn = false;
        renderGoogleAccountControls();
        showFooterAlert("Signed out of Google.", { tone: "warn" });
      } catch (error) {
        await refreshGoogleAccountState().catch(() => {
          googleCalendarSignedIn = false;
          renderGoogleAccountControls();
        });
        showFooterAlert(`Could not sign out of Google: ${error.message}`, { tone: "warn" });
      } finally {
        ui.googleSignOutButton.disabled = false;
        if (!googleCalendarSignedIn) ui.googleSignInButton.disabled = false;
      }
    });

    on(ui.exportMenu, "click", async (event) => {
      const action = event.target.closest("[data-export]");
      if (!action) return;

      setExportOpen(false);
      await handleExport(action.dataset.export);
    });

    // Settings/help live inside the same shell as the main views, so this helper swaps
    // into those utility panels and back out to the last main panel when toggled again.
    const showUtilityPanel = (panelKey) => {
      debug.log({ id: "showUtilityPanel" }, "Showing utility panel", {
        panelKey,
        currentPanel: STATE.view.panel,
      });
      ui.mainPanel.classList.remove("is-hidden");
      ui.floatingButton.classList.remove("is-collapsed");

      if (STATE.view.panel === panelKey) {
        const backTo = STATE.view.lastMainPanel || "course-list-panel";
        setActiveView(backTo);
        if (backTo === "schedule-panel") updateScheduleView();
        return;
      }

      setActiveView(panelKey);
    };

    // Saved schedule actions persist snapshots of the currently filtered schedule and restore them later.
    on(ui.saveScheduleButton, "click", async () => {
      debug.log({ id: "saveSchedule.click" }, "Save schedule button clicked");
      if (!STATE.courses?.length) {
        showFooterAlert("No schedule loaded - load a schedule before saving it.", { tone: "warn" });
        return;
      }

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

      const snapshot = createScheduleSnapshot(name, STATE.filtered, courseColorController.getAssignments());
      if (!STATE.savedSchedules.length) snapshot.isFavorite = true;
      STATE.savedSchedules = [snapshot, ...STATE.savedSchedules];
      debug.log({ id: "saveSchedule.saved" }, "Saved schedule snapshot", {
        scheduleName: name,
        scheduleCount: STATE.savedSchedules.length,
      });

      await persistSavedSchedules(STATE.savedSchedules);
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);

      if (ui.savedDropdown) ui.savedDropdown.open = true;
    });

    on(ui.savedMenu, "click", async (event) => {
      const actionButton = event.target.closest("[data-action]");
      const card = event.target.closest(".schedule-saved-card");
      const scheduleId = card?.dataset.id;
      if (!scheduleId) return;

      const selected = STATE.savedSchedules.find((s) => s.id === scheduleId);
      if (!selected) return;

      if (actionButton?.dataset.action === "favorite") {
        event.stopPropagation();
        STATE.savedSchedules = togglePreferredSchedule(STATE.savedSchedules, scheduleId);
        await persistSavedSchedules(STATE.savedSchedules);
        renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
        if (ui.savedDropdown) ui.savedDropdown.open = true;
        return;
      }

      if (actionButton?.dataset.action === "delete") {
        event.stopPropagation();
        debug.log({ id: "savedMenu.delete" }, "Deleting saved schedule", { scheduleId, scheduleName: selected.name });
        const confirmed = await openScheduleModal({
          title: "Permanently Delete Schedule?",
          message: `This action will permanently delete "${selected.name}".`,
          confirmLabel: "Delete",
          showInput: false,
          showCancel: true,
        });
        if (!confirmed) return;

        STATE.savedSchedules = STATE.savedSchedules.filter((s) => s.id !== scheduleId);
        if (STATE.currentSavedScheduleId === scheduleId) STATE.currentSavedScheduleId = null;
        await persistSavedSchedules(STATE.savedSchedules);
        renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
        return;
      }

      STATE.currentSavedScheduleId = scheduleId;
      STATE.currentScheduleName = selected.name;
      debug.log({ id: "savedMenu.load" }, "Loading saved schedule", { scheduleId, scheduleName: selected.name });
      if (selected.colorAssignments) {
        await courseColorController.applyAndPersistCourseColors(selected.colorAssignments);
      }

      STATE.courses = [...selected.courses];
      courseColorController.assignCourseColors(STATE.courses);
      STATE.filtered = [...STATE.courses];
      ui.searchInput.value = "";

      renderAll();
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      setActiveView("course-list-panel");
      if (ui.savedDropdown) ui.savedDropdown.open = false;
    });

    on(ui.savedMenu, "keydown", (event) => {
      const card = event.target.closest(".schedule-saved-card");
      if (!card) return;

      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("[data-action]")) return;

      event.preventDefault();
      card.click();
    });

    // Settings/help buttons are thin wrappers around the shared panel-switching helper above.
    on(ui.settingsButton, "click", () => {
      showUtilityPanel("settings-panel");
    });

    on(ui.helpButton, "click", () => {
      showUtilityPanel("help-panel");
    });

    on(
      ui.searchInput,
      "input",
      debounce(() => {
        filterCourses(ui.searchInput.value);
        renderAll();
      }, 100),
    );

    // Initial startup restores saved state, loads the current page's schedule, and then
    // enables the extra page-level average buttons that live outside the panel UI.
    await refreshGoogleAccountState().catch((error) => {
      debug.warn({ id: "googleAuth.initialState" }, "Could not load Google sign-in state", error);
    });

    wireTableSorting(ui);

    STATE.savedSchedules = await loadSavedSchedules();
    debug.log({ id: "boot.savedSchedulesLoaded" }, "Loaded saved schedules", {
      scheduleCount: STATE.savedSchedules.length,
    });
    renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);

    await loadCoursesFromPage();

    renderAll();

    setActiveView(STATE.view.panel);
    const cleanupAverageButtons = setupRegistrationAverageButtons({ onAddCourse: importCourseFromRegistrationCard });
    if (typeof cleanupAverageButtons === "function") {
      debug.log({ id: "boot.averageButtonsReady" }, "Average button observer initialized");
      window.addEventListener("beforeunload", cleanupAverageButtons, { once: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
