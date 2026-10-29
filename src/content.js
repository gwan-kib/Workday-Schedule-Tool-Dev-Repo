import { openScheduleNotes } from "./mainPanel/schedules/scheduleNotes.js";
import { mountPlanner } from "./mainPanel/schedules/plannerController.js";
import { storageGet, storageSet } from "./utilities/storage.js";
import { getScheduleSaveState } from "./core/scheduleSaveState.js";
import { renderScheduleHeading } from "./mainPanel/schedules/scheduleHeading.js";
import { syncPreviewText } from "./exportLogic/googleCalendar/syncPreviewText.js";
import { hydrateCourseLookups } from "./mainPanel/courses/courseLookupController.js";
import { courseIdentity, stableId } from "./core/meetings.js";
import { createScheduleStore } from "./core/scheduleStore.js";
import { captureScheduleChange, createScheduleUndoHistory } from "./core/scheduleUndo.js";
import { on as attachEvent, debounce } from "./utilities/dom.js";
import { STATE } from "./core/state.js";
import { ensureMount } from "./utilities/shadowMount.js";
import { debugFor, debugLog } from "./utilities/debugTool.js";
import { extractCoursesData } from "./extraction/extractCourses.js";
import {
  extractWorkdayCourseIdFromElement,
  fetchCourseFromWorkdayId,
  fetchCourseFromWorkdayLink,
  validateWorkdayCourseLink,
  WRONG_COURSE_LINK_ERROR,
} from "./extraction/singleCourseImport.js";
import { setupRegistrationAverageButtons } from "./api/averageGrades/registrationAverageButtons.js";
import { exportICS } from "./exportLogic/exportIcs.js";
import {
  requestCalendarAuthState,
  requestDisconnectCalendar,
  requestSignInCalendar,
  requestSyncCoursesToCalendar,
  requestPreviewCoursesToCalendar,
} from "./exportLogic/googleCalendar/calendarIntegration.js";
import { loadMainPanel } from "./mainPanel/shell/loadMainPanel.js";
import { createFooterNoteController } from "./mainPanel/shell/footerNoteController.js";
import { createCourseColorController } from "./mainPanel/settings/courseColorController.js";
import { initializeHoverTooltipController } from "./mainPanel/settings/hoverTooltipController.js";
import { createPanelViewController } from "./mainPanel/shell/panelViewController.js";
import { createScheduleModalController } from "./mainPanel/schedules/scheduleModals.js";
import { filterCourses, applyCourseSort, wireTableSorting } from "./mainPanel/courses/courseViewSorting.js";
import { renderCourseObjects } from "./mainPanel/courses/renderCourseObjects.js";
import { renderSchedule } from "./mainPanel/schedules/scheduleView.js";
import {
  canSaveMoreSchedules,
  createScheduleSnapshot,
  getMaxScheduleCount,
  getScheduleNameError,
  loadSavedSchedules,
  persistSavedSchedules,
  renderSavedSchedules,
  togglePreferredSchedule,
} from "./mainPanel/schedules/scheduleStorage.js";
const debug = debugFor("content");
debugLog({ local: { content: false } });
// Bootstraps the content script UI and event wiring. Input: none. Output: none.
(() => {
  async function boot() {
    debug.log({ id: "boot.start" }, "Booting content script");
    // Mount the extension UI, then hand feature-specific responsibilities off to the
    // smaller controllers so this file mostly stays as the top-level coordinator.
    const shadowRoot = ensureMount();
    if (shadowRoot.host.dataset.wstBooted) return;
    shadowRoot.host.dataset.wstBooted = "true";
    const ui = await loadMainPanel(shadowRoot);
    ui.footerNotes = createFooterNoteController(ui.footerAlert);
    const store = createScheduleStore(STATE);
    let storageReady = false;
    let saveInProgress = false;
    let undoInProgress = false;
    let undoNoticeId = null;
    const undoHistory = createScheduleUndoHistory();
    const renderUndoState = () => {
      ui.undoButton.disabled = undoInProgress || saveInProgress || ui.loadingModal?.classList.contains("is-open") || !undoHistory.canUndo;
      ui.undoButton.dataset.tooltip = undoHistory.canUndo ? `Undo: ${undoHistory.label}` : "Undo";
      ui.redoButton.disabled = undoInProgress || saveInProgress || ui.loadingModal?.classList.contains("is-open") || !undoHistory.canRedo;
      ui.redoButton.dataset.tooltip = undoHistory.canRedo ? `Redo: ${undoHistory.redoLabel}` : "Redo";
    };
    const recordChange = (before, label) => {
      undoHistory.record(before, captureScheduleChange(STATE), label);
      renderUndoState();
    };
    const on = (el, type, handler, options) =>
      attachEvent(
        el,
        type,
        (...args) => {
          try {
            Promise.resolve(handler(...args)).catch(showActionError);
          } catch (error) {
            showActionError(error);
          }
        },
        options,
      );
    const showActionError = (error) =>
      ui.footerNotes.showTemporary(error.message || "Action failed. Please retry.", {
        tone: "warn",
        durationMs: 10000,
      });
    const updateSavedSchedules = async (next) => {
      if (!storageReady)
        throw new Error(
          "Saved data could not be loaded. Reload the extension and retry before changing saved schedules.",
        );
      await persistSavedSchedules(next);
      STATE.savedSchedules = next;
    };
    const courseColorController = await createCourseColorController(ui);
    await initializeHoverTooltipController(ui, STATE.view);
    const { setActiveView, toggleMainPanel } = createPanelViewController(ui, STATE.view);
    const { openScheduleModal } = createScheduleModalController(ui);
    // Rebuild the visual views from shared STATE whenever schedule data or view settings change.
    const renderSaveState = () => {
      const saveState = getScheduleSaveState(STATE);
      ui.scheduleStatusChips.forEach((chip) => {
        chip.textContent = saveState.label;
        chip.dataset.status = saveState.status;
      });
      ui.quickSaveButton.disabled = saveInProgress || !storageReady || !saveState.saved;
      ui.saveAsNewButton.disabled = saveInProgress || !storageReady || !STATE.courses.length;
      renderUndoState();
      return saveState;
    };
    const updateScheduleView = () => {
      const { saved } = renderSaveState();
      ui.scheduleName = saved?.name || "Working Schedule";
      renderScheduleHeading(ui.courseScheduleHeading, ui.scheduleName, STATE.courses);
      renderSchedule(ui, STATE.courses, STATE.view.semester, STATE.view.timeFormat);
      ui.onTimeFormatChange = (next) => {
        STATE.view.timeFormat = next;
        void storageSet({ wdTimeFormat: next }).catch(showActionError);
      };
    };
    // Render all main data-driven UI surfaces together so list/schedule views stay in sync.
    const renderAll = () => {
      applyCourseSort();
      updateScheduleView();
      renderCourseObjects(ui, STATE.filtered, {
        hasLoadedSchedule: STATE.courses.length > 0,
        onRemoveCourse: removeCourseFromSchedule,
        onChangeCourseColor: changeCourseGroupColor,
        courseColorPalettes: courseColorController.getPalettes(),
        allCourses: STATE.courses,
      });
      hydrateCourseLookups(ui, STATE.filtered);
    };
    const loadingOverlayStack = [];
    const renderLoadingOverlay = () => {
      if (!ui.loadingModal) return;
      const active = loadingOverlayStack[loadingOverlayStack.length - 1];
      if (active) {
        if (ui.loadingText) ui.loadingText.textContent = active.message;
        ui.loadingModal.classList.remove("is-hidden");
        ui.loadingModal.classList.add("is-open");
        ui.loadingModal.setAttribute("aria-hidden", "false");
        renderUndoState();
        return;
      }
      ui.loadingModal.classList.add("is-hidden");
      ui.loadingModal.classList.remove("is-open");
      ui.loadingModal.setAttribute("aria-hidden", "true");
      renderUndoState();
    };
    const showLoadingOverlay = (message = "Loading...") => {
      const token = Symbol("loading-overlay");
      loadingOverlayStack.push({ token, message });
      renderLoadingOverlay();
      return () => {
        const index = loadingOverlayStack.findIndex((entry) => entry.token === token);
        if (index >= 0) loadingOverlayStack.splice(index, 1);
        renderLoadingOverlay();
      };
    };
    // Extract the current page's schedule data from Workday, normalize it into STATE,
    // and preserve the current UI when requested.
    const loadCoursesFromPage = async ({ preserveExisting = false } = {}) => {
      debug.log({ id: "loadCoursesFromPage.start" }, "Loading courses from page", { preserveExisting });
      let closeLoadingOverlay = showLoadingOverlay(preserveExisting ? "Searching page for courses..." : "Loading schedule...");
      try {
        let result = await extractCoursesData();
        closeLoadingOverlay();
        if (["unsupported", "logged-out"].includes(result.status)) {
          if (result.status === "logged-out")
            ui.footerNotes.setPersistent(
              "import-status",
              "Sign into Workday, open your course schedule, then refresh.",
              { tone: "warn" },
            );
          else ui.footerNotes.removePersistent("import-status");
          return false;
        }
        const accumulated = [...result.courses];
        while (result.failures.length) {
          const retry = await openScheduleModal({
            title: "Incomplete import",
            message: `${accumulated.length} of ${result.requestedCount} course sections loaded. ${result.failures.length} failed. Your working schedule has been preserved. Retry failed sections?`,
            confirmLabel: "Retry failed sections",
            showCancel: true,
            showInput: false,
          });
          if (!retry) {
            if (!accumulated.length) return false;
            const accept = await openScheduleModal({
              title: "Use incomplete schedule?",
              message: `${accumulated.length} section(s) loaded; ${result.failures.length} are missing. This replaces the current working schedule only if you accept.`,
              confirmLabel: "Use incomplete schedule",
              showCancel: true,
              showInput: false,
            });
            if (!accept) return false;
            ui.footerNotes.setPersistent(
              "import-status",
              `Incomplete import: ${result.failures.length} section(s) missing. Search page to retry.`,
              { tone: "warn" },
            );
            break;
          }
          closeLoadingOverlay = showLoadingOverlay("Retrying failed course sections...");
          const retryResult = await extractCoursesData({ entries: result.failures });
          closeLoadingOverlay();
          accumulated.push(...retryResult.courses);
          result = { ...retryResult, requestedCount: result.requestedCount };
        }
        if (!result.failures.length) ui.footerNotes.removePersistent("import-status");
        if (result.status === "empty" && STATE.courses.length) {
          const acceptEmpty = await openScheduleModal({
            title: "Empty Workday schedule",
            message: "Workday shows no rows. Clear the extension working schedule? Saved schedules are preserved.",
            confirmLabel: "Use empty schedule",
            showInput: false,
            showCancel: true,
          });
          if (!acceptEmpty) return false;
        }
        const before = preserveExisting ? captureScheduleChange(STATE) : null;
        store.load(accumulated);
        STATE.syncPlanId = stableId(`working|${accumulated.map(courseIdentity).sort().join("|")}`);
        STATE.syncPlanName = "Working Schedule";
        courseColorController.assignCourseColors(STATE.courses);
        STATE.currentSavedScheduleId = null;
        STATE.currentScheduleName = null;
        renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
        filterCourses(ui.searchInput.value);
        if (before) recordChange(before, "Search page for courses");
        debug.log({ id: "loadCoursesFromPage.complete" }, "Loaded courses from page", {
          courseCount: STATE.courses.length,
        });
        return true;
      } finally {
        closeLoadingOverlay();
      }
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
    const exportItems = () => [...ui.exportMenu.querySelectorAll('[role="menuitem"]')].filter((item) => !item.disabled && item.getAttribute("aria-disabled") !== "true");
    on(ui.exportButton, "keydown", (event) => {
      if (event.key === "Escape") { setExportOpen(false); return; }
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      setExportOpen(true);
      const items = exportItems();
      (event.key === "ArrowDown" ? items[0] : items.at(-1))?.focus();
    });
    on(ui.exportMenu, "keydown", (event) => {
      const items = exportItems(), index = items.indexOf(event.target.closest('[role="menuitem"]'));
      if (event.key === "Escape") {
        event.preventDefault(); setExportOpen(false); ui.exportButton.focus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === "Tab") {
        event.preventDefault(); setExportOpen(false);
        (event.shiftKey ? ui.exportButton : ui.helpButton)?.focus();
      }
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
      if (undoInProgress) return;
      const loaded = await loadCoursesFromPage({ preserveExisting: true });
      if (loaded) renderAll();
    });
    on(ui.clearButton, "click", () => {
      if (undoInProgress) return;
      const before = captureScheduleChange(STATE);
      store.load([]);
      STATE.syncPlanId = crypto.randomUUID();
      STATE.syncPlanName = "Working Schedule";
      STATE.currentSavedScheduleId = null;
      STATE.currentScheduleName = null;
      ui.searchInput.value = "";
      filterCourses("");
      renderAll();
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      recordChange(before, "Clear courses");
    });
    const restoreHistory = async (direction) => {
      const isRedo = direction === "redo";
      if (undoInProgress || saveInProgress || !(isRedo ? undoHistory.canRedo : undoHistory.canUndo)) return;
      const plan = undoHistory.plan(STATE, direction);
      undoInProgress = true;
      renderUndoState();
      const closeLoading = showLoadingOverlay(isRedo ? "Redoing schedule change..." : "Undoing schedule change...");
      try {
        if (plan.savedChanged) await updateSavedSchedules(plan.savedSchedules);
        if (plan.working) {
          const { courses, ...source } = plan.working;
          Object.assign(STATE, source);
          store.load(courses);
          courseColorController.assignCourseColors(STATE.courses);
        }
        undoHistory.commit(plan);
        filterCourses(ui.searchInput.value);
        renderAll();
        renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
        if (undoNoticeId) ui.footerNotes.removeTemporary(undoNoticeId);
        undoNoticeId = showFooterAlert(`${isRedo ? "Redone" : "Undone"}: ${plan.label}.`, { tone: "success" });
      } finally {
        undoInProgress = false;
        closeLoading();
        renderUndoState();
      }
    };
    on(ui.undoButton, "click", () => restoreHistory("undo"));
    on(ui.redoButton, "click", () => restoreHistory("redo"));
    // Posts a transient status message into the widget footer without disturbing persistent notes.
    const showFooterAlert = (text, { tone = "info", durationMs = 4000 } = {}) => {
      return ui.footerNotes?.showTemporary(text, { tone, durationMs });
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
      if (undoInProgress) return false;
      if (!course?.code || !course?.section_number) {
        showFooterAlert("Could not add the course because its section details were incomplete.", { tone: "warn" });
        return false;
      }
      const courseKey = getCourseIdentityKey(course);
      if (STATE.courses.some((existing) => getCourseIdentityKey(existing) === courseKey)) {
        showFooterAlert(`${course.code} ${course.section_number} is already in the extension.`, { tone: "info" });
        return false;
      }
      // Add the course through the same state path used by full schedule imports so rendering,
      // colors, conflict detection, search filtering, and exports stay consistent.
      const before = captureScheduleChange(STATE);
      store.add(course);
      STATE.syncPlanId ||= crypto.randomUUID();
      courseColorController.assignCourseColors(STATE.courses);
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      filterCourses(ui.searchInput.value);
      renderAll();
      recordChange(before, `Add ${course.code} ${course.section_number}`);
      showFooterAlert(`${course.code} ${course.section_number} added to the extension.`, { tone: "success" });
      return true;
    };
    const removeCourseFromSchedule = (course) => {
      if (undoInProgress) return;
      const before = captureScheduleChange(STATE);
      const initialCount = STATE.courses.length;
      store.remove(course);
      if (STATE.courses.length === initialCount) return;
      filterCourses(ui.searchInput.value);
      renderAll();
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      recordChange(before, `Remove ${course.code || "course"} ${course.section_number || ""}`.trim());
      showFooterAlert(`${course.code || "Course"} ${course.section_number || ""} removed from the extension.`, {
        tone: "warn",
      });
    };
    const changeCourseGroupColor = (course, colorIndex) => {
      const changed = courseColorController.assignManualCourseGroupColor(STATE.courses, course, colorIndex);
      if (!changed) return;
      courseColorController.assignCourseColors(STATE.courses);
      filterCourses(ui.searchInput.value);
      renderAll();
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
    };
    const getManualCourseImportFailureMessage = (error) => {
      const message = String(error?.message || error || "Unknown error");
      if (message === WRONG_COURSE_LINK_ERROR) return "Could not add course: Wrong course link";
      return `Could not add that course: ${message}`;
    };
    const importCourseFromRegistrationCard = async ({ row, link }) => {
      const courseId = extractWorkdayCourseIdFromElement(row);
      if (courseId) {
        const closeLoadingOverlay = showLoadingOverlay("Loading course from Workday...");
        try {
          const course = await fetchCourseFromWorkdayId(courseId);
          return addSingleCourseToSchedule(course);
        } catch (error) {
          debug.warn({ id: "registrationCourseImport.idFetchFailed" }, "Could not fetch course by Workday ID", {
            courseId,
            error: String(error?.message || error),
          });
          showFooterAlert("Could not load that course from Workday. Try again after opening the course details.", {
            tone: "warn",
          });
          return false;
        } finally {
          closeLoadingOverlay();
        }
      }
      if (link) {
        const closeLoadingOverlay = showLoadingOverlay("Loading course from Workday...");
        try {
          const linkedCourse = await fetchCourseFromWorkdayLink(link);
          return addSingleCourseToSchedule(linkedCourse);
        } catch (error) {
          debug.warn({ id: "registrationCourseImport.linkFetchFailed" }, "Could not fetch course by Workday link", {
            error: String(error?.message || error),
          });
          showFooterAlert("Could not load that Workday course link.", { tone: "warn" });
          return false;
        } finally {
          closeLoadingOverlay();
        }
      }
      showFooterAlert("Could not find a Workday course ID for that course card.", {
        tone: "warn",
      });
      return false;
    };
    const importCourseFromManualLink = async () => {
      const link = await openScheduleModal({
        title: "Add A Course",
        message: "Paste the Workday course section link.\n(for Saved Schedules, it's the link in the section column)",
        confirmLabel: "Add A Course",
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
      const loadingNoteId = showFooterAlert("Loading course from Workday...", { tone: "info", durationMs: 0 });
      const closeLoadingOverlay = showLoadingOverlay("Loading course from Workday...");
      try {
        const course = await fetchCourseFromWorkdayLink(validation.url);
        addSingleCourseToSchedule(course);
      } catch (error) {
        debug.warn({ id: "manualCourseImport.failed" }, "Manual course import failed", error);
        showFooterAlert(getManualCourseImportFailureMessage(error), { tone: "warn" });
      } finally {
        closeLoadingOverlay();
        ui.footerNotes?.removeTemporary(loadingNoteId);
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
      if (type === "ics") {
        const result = exportICS(STATE.currentScheduleName);
        showFooterAlert(
          `Exported ${result.exported} meeting(s); ${result.skipped} unknown/invalid meeting(s) skipped. Only verified Workday exceptions are excluded; other holidays and breaks are not inferred.`,
          { tone: result.skipped ? "warn" : "info", durationMs: 10000 },
        );
        return;
      }
      if (type === "gcal-sync") {
        if (!(await requireGoogleSignInForSync())) return;
        if (!STATE.courses?.length) {
          showFooterAlert("No courses to sync.", { tone: "warn" });
          return;
        }
        if (ui.googleSyncButton.disabled) return;
        ui.googleSyncButton.disabled = true;
        const courses = store.snapshot();
        const fingerprint = JSON.stringify(courses);
        const options = {
          planId:
            STATE.syncPlanId ||
            STATE.currentSavedScheduleId ||
            stableId(`working|${courses.map(courseIdentity).sort().join("|")}`),
          planName: STATE.currentScheduleName || STATE.syncPlanName || "Working Schedule",
        };
        let closeLoading = showLoadingOverlay("Preparing Google Calendar preview...");
        try {
          let preview = await requestPreviewCoursesToCalendar(courses, options);
          closeLoading();
          if (preview.previousPlan) {
            const choice = await openScheduleModal({
              title: "Sync a different plan",
              message: `The last selected plan is "${preview.previousPlan.name}". Keep Both preserves it; Replace Previous removes only its managed events. Keeping overlapping plans may create overlapping calendar entries.`,
              confirmLabel: "Continue to preview",
              showInput: false,
              showCancel: true,
              choices: [
                { value: "keep", label: "Keep Both" },
                { value: "replace", label: "Replace Previous" },
              ],
            });
            if (!choice) return;
            if (choice === "replace") {
              closeLoading = showLoadingOverlay("Preparing replacement preview...");
              preview = await requestPreviewCoursesToCalendar(courses, {
                ...options,
                replacePlanId: preview.previousPlan.id,
              });
              closeLoading();
            }
          }
          const confirmed = await openScheduleModal({
            title: "Confirm Google Calendar sync",
            confirmLabel: "Confirm sync",
            showInput: false,
            showCancel: true,
            message: syncPreviewText(preview),
          });
          if (!confirmed) return;
          if (
            fingerprint !== JSON.stringify(store.snapshot()) ||
            options.planId !==
              (STATE.syncPlanId ||
                STATE.currentSavedScheduleId ||
                stableId(`working|${STATE.courses.map(courseIdentity).sort().join("|")}`))
          )
            throw new Error("The working schedule changed. Open a fresh preview before syncing.");
          closeLoading = showLoadingOverlay("Applying confirmed Google Calendar changes...");
          const summary = await requestSyncCoursesToCalendar(preview.previewId);
          const parts = [
            `Google Calendar: ${summary.added} added, ${summary.updated} updated, ${summary.removed} removed, ${summary.unchanged} unchanged`,
          ];
          if (summary.failed) parts.push(`${summary.failed} failed; old events preserved. Preview again to retry`);
          if (summary.deleteFailed) parts.push(`${summary.deleteFailed} removals failed. Preview again to retry`);
          if (summary.skipped) parts.push(`${summary.skipped} meetings skipped`);
          showFooterAlert(parts.join(" • "), {
            tone: summary.failed || summary.deleteFailed || summary.skipped ? "warn" : "info",
            durationMs: 10000,
          });
        } catch (error) {
          showFooterAlert(`Could not sync to Google Calendar: ${error.message}`, { tone: "warn", durationMs: 10000 });
        } finally {
          closeLoading();
          ui.googleSyncButton.disabled = false;
        }
      }
    };
    renderGoogleAccountControls();
    on(ui.googleSignInButton, "click", async () => {
      ui.googleSignInButton.disabled = true;
      ui.googleSignOutButton.disabled = true;
      const closeLoadingOverlay = showLoadingOverlay("Signing into Google...");
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
        closeLoadingOverlay();
        ui.googleSignOutButton.disabled = false;
        if (!googleCalendarSignedIn) ui.googleSignInButton.disabled = false;
      }
    });
    on(ui.googleSignOutButton, "click", async () => {
      ui.googleSignInButton.disabled = true;
      ui.googleSignOutButton.disabled = true;
      const closeLoadingOverlay = showLoadingOverlay("Signing out of Google...");
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
        closeLoadingOverlay();
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
    // Keep the source ID through edits; replace it only after a successful Save As New.
    const runSave = async (action) => {
      if (saveInProgress || undoInProgress) return;
      saveInProgress = true;
      renderSaveState();
      try {
        await action();
      } finally {
        saveInProgress = false;
        updateScheduleView();
      }
    };
    on(ui.quickSaveButton, "click", () => runSave(async () => {
      const { saved } = getScheduleSaveState(STATE);
      if (!saved) return;
      const confirmed = await openScheduleModal({
        title: "Update saved schedule?",
        message: `Replace the saved courses in "${saved.name}" with your current schedule?`,
        confirmLabel: "Update",
        showInput: false,
        showCancel: true,
      });
      if (!confirmed) return;
      // A deleted source must never be recreated by an outstanding confirmation.
      const current = getScheduleSaveState(STATE).saved;
      if (current?.id !== saved.id)
        throw new Error("This saved schedule is no longer available. Use Save As New.");
      const snapshot = { ...current, courses: store.snapshot(), savedAt: new Date().toISOString() };
      const before = captureScheduleChange(STATE);
      await updateSavedSchedules(STATE.savedSchedules.map((schedule) =>
        schedule.id === snapshot.id ? snapshot : schedule,
      ));
      STATE.currentScheduleName = snapshot.name;
      STATE.syncPlanName = snapshot.name;
      recordChange(before, `Update saved schedule "${snapshot.name}"`);
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      showFooterAlert(`Updated "${snapshot.name}".`, { tone: "success" });
    }));
    on(ui.saveAsNewButton, "click", () => runSave(async () => {
      if (!STATE.courses.length) return;
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
        title: "Save As New",
        message: "Name this schedule so you can find it later.",
        confirmLabel: "Save",
        showInput: true,
        showCancel: true,
        validateInput: (value) => getScheduleNameError(value, STATE.savedSchedules),
      });
      if (!name) return;
      if (!canSaveMoreSchedules(STATE.savedSchedules))
        throw new Error("Schedule limit reached. Delete a saved schedule and retry.");
      const snapshot = createScheduleSnapshot(name, store.snapshot(), null);
      const before = captureScheduleChange(STATE);
      if (!STATE.savedSchedules.length) snapshot.isFavorite = true;
      await updateSavedSchedules([snapshot, ...STATE.savedSchedules]);
      STATE.currentSavedScheduleId = snapshot.id;
      STATE.currentScheduleName = snapshot.name;
      STATE.syncPlanId = snapshot.id;
      STATE.syncPlanName = snapshot.name;
      recordChange(before, `Add saved schedule "${snapshot.name}"`);
      renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      if (ui.savedDropdown) ui.savedDropdown.open = true;
    }));
    on(ui.savedMenu, "click", async (event) => {
      if (saveInProgress || undoInProgress) return;
      const actionButton = event.target.closest("[data-action]");
      const card = event.target.closest(".schedule-saved-card");
      const scheduleId = card?.dataset.id;
      if (!scheduleId) return;
      const selected = STATE.savedSchedules.find((s) => s.id === scheduleId);
      if (!selected) return;
      if (actionButton?.dataset.action === "notes") {
        event.stopPropagation();
        openScheduleNotes(ui, {
          scheduleId,
          getSchedules: () => STATE.savedSchedules,
          saveSchedules: async next => {
            await updateSavedSchedules(next);
            renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
          },
        });
        return;
      }
      if (actionButton?.dataset.action === "favorite") {
        event.stopPropagation();
        await updateSavedSchedules(togglePreferredSchedule(STATE.savedSchedules, scheduleId));
        renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
        if (ui.savedDropdown) ui.savedDropdown.open = true;
        return;
      }
      if (actionButton?.dataset.action === "rename") {
        event.stopPropagation();
        const nextName = await openScheduleModal({
          title: "Rename schedule",
          message: `Choose a new name for "${selected.name}".`,
          confirmLabel: "Rename",
          showInput: true,
          showCancel: true,
          inputLabel: "Schedule name",
          inputPlaceholder: "e.g. Fall semester plan",
          inputValue: selected.name,
          validateInput: (value) => getScheduleNameError(value, STATE.savedSchedules, scheduleId),
        });
        if (!nextName || nextName === selected.name) {
          if (ui.savedDropdown) ui.savedDropdown.open = true;
          return;
        }
        await updateSavedSchedules(
          STATE.savedSchedules.map((schedule) =>
            schedule.id === scheduleId ? { ...schedule, name: nextName } : schedule,
          ),
        );
        if (STATE.currentSavedScheduleId === scheduleId) STATE.currentScheduleName = nextName;
        if (STATE.syncPlanId === scheduleId) STATE.syncPlanName = nextName;
        updateScheduleView();
        renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
        showFooterAlert(`Renamed schedule to "${nextName}".`, { tone: "success" });
        if (ui.savedDropdown) ui.savedDropdown.open = true;
        return;
      }
      if (actionButton?.dataset.action === "delete") {
        event.stopPropagation();
        debug.log({ id: "savedMenu.delete" }, "Deleting saved schedule", { scheduleId, scheduleName: selected.name });
        const confirmed = await openScheduleModal({
          title: "Delete Schedule?",
          message: `Delete "${selected.name}" from saved schedules? You can undo this in the current Workday tab.`,
          confirmLabel: "Delete",
          showInput: false,
          showCancel: true,
        });
        if (!confirmed) return;
        const before = captureScheduleChange(STATE);
        await updateSavedSchedules(STATE.savedSchedules.filter((s) => s.id !== scheduleId));
        if (STATE.currentSavedScheduleId === scheduleId) {
          STATE.currentSavedScheduleId = null;
          STATE.currentScheduleName = null;
          STATE.syncPlanId = crypto.randomUUID();
          STATE.syncPlanName = "Working Schedule";
        }
        recordChange(before, `Delete saved schedule "${selected.name}"`);
        updateScheduleView();
        renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
        return;
      }
      const before = captureScheduleChange(STATE);
      STATE.currentSavedScheduleId = scheduleId;
      STATE.currentScheduleName = selected.name;
      STATE.syncPlanId = selected.id;
      STATE.syncPlanName = selected.name;
      debug.log({ id: "savedMenu.load" }, "Loading saved schedule", { scheduleId, scheduleName: selected.name });
      store.load(selected.courses);
      courseColorController.assignCourseColors(STATE.courses);
      STATE.filtered = [...STATE.courses];
      ui.searchInput.value = "";
      filterCourses("");
      renderAll();
      recordChange(before, `Load saved schedule "${selected.name}"`);
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
    mountPlanner(ui, {
      getState: () => STATE,
      saveSchedules: async (next) => {
        const before = captureScheduleChange(STATE);
        await updateSavedSchedules(next);
        recordChange(before, "Import or update saved schedules");
        renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
        renderSaveState();
      },
    });
    try {
      const preferences = await storageGet(["wdTimeFormat"]);
      if (["24h", "am/pm"].includes(preferences.wdTimeFormat)) STATE.view.timeFormat = preferences.wdTimeFormat;
    } catch (error) { showActionError(error); }
    // Initial startup restores saved state, loads the current page's schedule, and then
    // enables the extra page-level average buttons that live outside the panel UI.
    await refreshGoogleAccountState().catch((error) => {
      debug.warn({ id: "googleAuth.initialState" }, "Could not load Google sign-in state", error);
    });
    wireTableSorting(ui);
    try {
      STATE.savedSchedules = await loadSavedSchedules();
      storageReady = true;
    } catch (error) {
      ui.footerNotes.setPersistent("storage-error", `${error.message} Reload to retry.`, { tone: "warn" });
    }
    debug.log({ id: "boot.savedSchedulesLoaded" }, "Loaded saved schedules", {
      scheduleCount: STATE.savedSchedules.length,
    });
    renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
    await loadCoursesFromPage();
    renderAll();
    setActiveView(STATE.view.panel);
    // The popup or another Workday tab can rename, update or delete this source.
    const onSavedSchedulesChanged = async (changes, area) => {
      if (area !== "local" || !changes.wdSavedSchedules) return;
      try {
        STATE.savedSchedules = await loadSavedSchedules();
        storageReady = true;
        const { saved } = getScheduleSaveState(STATE);
        if (STATE.currentSavedScheduleId && !saved) {
          STATE.currentSavedScheduleId = null;
          STATE.currentScheduleName = null;
          STATE.syncPlanId = crypto.randomUUID();
          STATE.syncPlanName = "Working Schedule";
        } else if (saved) {
          STATE.currentScheduleName = saved.name;
          STATE.syncPlanName = saved.name;
        }
        updateScheduleView();
        renderSavedSchedules(ui, STATE.savedSchedules, STATE.currentSavedScheduleId);
      } catch (error) {
        storageReady = false;
        renderSaveState();
        showActionError(error);
      }
    };
    const storageEvents = globalThis.chrome?.storage?.onChanged;
    storageEvents?.addListener(onSavedSchedulesChanged);
    const host = shadowRoot.host;
    const navigationObserver = new MutationObserver(
      debounce(() => {
        if (!host.isConnected) document.documentElement.appendChild(host);
      }, 100),
    );
    navigationObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener(
      "pagehide",
      () => {
        navigationObserver.disconnect();
        storageEvents?.removeListener(onSavedSchedulesChanged);
        ui.scheduleResizeObserver?.disconnect();
      },
      { once: true },
    );
    const cleanupAverageButtons = setupRegistrationAverageButtons({ onAddCourse: importCourseFromRegistrationCard });
    if (typeof cleanupAverageButtons === "function") {
      debug.log({ id: "boot.averageButtonsReady" }, "Average button observer initialized");
      window.addEventListener("beforeunload", cleanupAverageButtons, { once: true });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot().catch(console.error), { once: true });
  } else {
    void boot().catch(console.error);
  }
})();
