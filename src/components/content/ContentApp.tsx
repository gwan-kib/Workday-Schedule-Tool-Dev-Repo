import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { renderCourseObjects } from "../../domain/courseList/renderCourseObjects";
import { extractCoursesData } from "../../domain/extraction";
import { exportCoursesAsIcs } from "../../domain/export/exportIcs";
import { setupRegistrationAverageButtons } from "../../domain/grades/registrationAverageButtons";
import {
  applyCourseColorAssignments,
  canSaveMoreSchedules,
  captureCourseColorPalettes,
  createScheduleSnapshot,
  DEFAULT_COURSE_COLOR_ASSIGNMENTS,
  loadCourseColorAssignments,
  loadSavedSchedules,
  MAX_SCHEDULES,
  normalizeCourseColorAssignments,
  persistCourseColorAssignments,
  persistSavedSchedules,
  togglePreferredSchedule,
} from "../../domain/settings/courseColorSettings";
import {
  loadHoverTooltipSetting,
  persistHoverTooltipSetting,
} from "../../domain/settings/hoverTooltipSettings";
import { renderSchedule } from "../../domain/schedule/scheduleView";
import { ensureMaterialSymbolsFont } from "../../lib/fonts";
import type {
  CourseColorPalette,
  SchedulePickerOption,
  ScheduleRenderUi,
  SortableKey,
} from "../../lib/types";
import { useContentStore } from "../../store/useContentStore";
import { SavedSchedulesDropdown } from "../shared/SavedSchedulesDropdown";
import { HelpPanel } from "./HelpPanel";
import { ScheduleModal, SchedulePickerModal } from "./ContentModals";
import { SettingsPanel } from "./SettingsPanel";

const INITIAL_SCHEDULE_MODAL_STATE = {
  open: false,
  title: "Save Schedule",
  message: "Name this schedule so you can find it later.",
  confirmLabel: "Save",
  showInput: true,
  showCancel: true,
  inputValue: "",
  inputInvalid: false,
};

const INITIAL_PICKER_MODAL_STATE = {
  open: false,
  title: "Choose a schedule",
  message: "Multiple schedule tables were found on this page. Choose which one to load.",
  options: [] as SchedulePickerOption[],
};

export function ContentApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const scheduleGridRef = useRef<HTMLDivElement>(null);
  const scheduleTermPillRef = useRef<HTMLDivElement>(null);
  const courseListRef = useRef<HTMLDivElement>(null);
  const footerAlertRef = useRef<HTMLSpanElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const averageButtonsCleanupRef = useRef<(() => void) | null>(null);
  const scheduleModalResolverRef = useRef<((value: string | boolean | null) => void) | null>(null);
  const pickerModalResolverRef = useRef<((value: string | null) => void) | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [courseColorPalettes, setCourseColorPalettes] = useState<CourseColorPalette[]>([]);
  const [courseColorAssignments, setCourseColorAssignments] = useState<number[]>([
    ...DEFAULT_COURSE_COLOR_ASSIGNMENTS,
  ]);
  const [scheduleModal, setScheduleModal] = useState(INITIAL_SCHEDULE_MODAL_STATE);
  const [pickerModal, setPickerModal] = useState(INITIAL_PICKER_MODAL_STATE);

  const store = useContentStore();

  const widgetClassName = useMemo(() => {
    const classes = ["widget"];
    if (!store.view.isPanelOpen) classes.push("is-hidden");
    if (store.view.panel === "schedule-panel") classes.push("is-schedule-view");
    if (store.view.panel === "settings-panel") classes.push("is-settings-view");
    if (store.view.panel === "help-panel") classes.push("is-help-view");
    if (!store.view.hoverTipsEnabled) classes.push("is-hover-tooltips-off");
    return classes.join(" ");
  }, [store.view.hoverTipsEnabled, store.view.isPanelOpen, store.view.panel]);

  const sortButtonClass = (key: SortableKey) => {
    const classes = ["course-sort-button"];
    if (store.sort.key === key) classes.push(store.sort.dir === 1 ? "sorted-asc" : "sorted-desc");
    return classes.join(" ");
  };

  async function applyCourseColors(nextAssignments: number[], { persist = true } = {}) {
    const normalized = normalizeCourseColorAssignments(nextAssignments);
    setCourseColorAssignments(normalized);

    if (rootRef.current && courseColorPalettes.length) {
      applyCourseColorAssignments(rootRef.current, courseColorPalettes, normalized);
    }

    if (persist) await persistCourseColorAssignments(normalized);
  }

  function openScheduleModal(config: {
    title: string;
    message: string;
    confirmLabel?: string;
    showInput?: boolean;
    showCancel?: boolean;
  }) {
    setScheduleModal({
      open: true,
      title: config.title,
      message: config.message,
      confirmLabel: config.confirmLabel || "Save",
      showInput: config.showInput !== false,
      showCancel: config.showCancel !== false,
      inputValue: "",
      inputInvalid: false,
    });

    return new Promise<string | boolean | null>((resolve) => {
      scheduleModalResolverRef.current = resolve;
    });
  }

  function closeScheduleModal(value: string | boolean | null) {
    scheduleModalResolverRef.current?.(value);
    scheduleModalResolverRef.current = null;
    setScheduleModal(INITIAL_SCHEDULE_MODAL_STATE);
  }

  function openSchedulePickerModal(options: SchedulePickerOption[]) {
    setPickerModal({
      open: true,
      title: "Select a schedule",
      message: "Multiple schedule tables detected. Select the one you would like to load:",
      options,
    });

    return new Promise<string | null>((resolve) => {
      pickerModalResolverRef.current = resolve;
    });
  }

  function closeSchedulePickerModal(value: string | null) {
    pickerModalResolverRef.current?.(value);
    pickerModalResolverRef.current = null;
    setPickerModal(INITIAL_PICKER_MODAL_STATE);
  }

  async function loadCoursesFromPage({ preserveExisting = false }: { preserveExisting?: boolean } = {}) {
    const extractedCourses = await extractCoursesData({
      selectSchedule: (options) => openSchedulePickerModal(options),
    });

    if (extractedCourses === null) {
      if (!preserveExisting) store.clearCourses();
      return false;
    }

    store.setCourses(extractedCourses);
    store.setCurrentSchedule(null, null);
    return true;
  }

  useEffect(() => {
    ensureMaterialSymbolsFont(document);
  }, []);

  useEffect(() => {
    if (!rootRef.current) return;
    setCourseColorPalettes(captureCourseColorPalettes(rootRef.current));
  }, []);

  useEffect(() => {
    let cancelled = false;
    averageButtonsCleanupRef.current = setupRegistrationAverageButtons() || null;

    void (async () => {
      const [storedSchedules, hoverTipsEnabled, assignments] = await Promise.all([
        loadSavedSchedules(),
        loadHoverTooltipSetting(),
        loadCourseColorAssignments(),
      ]);

      if (cancelled) return;

      store.setSavedSchedules(storedSchedules);
      store.setHoverTipsEnabled(hoverTipsEnabled);
      await applyCourseColors(assignments, { persist: false });
      await loadCoursesFromPage();
    })();

    return () => {
      cancelled = true;
      averageButtonsCleanupRef.current?.();
      averageButtonsCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!rootRef.current || !courseColorPalettes.length) return;
    applyCourseColorAssignments(rootRef.current, courseColorPalettes, courseColorAssignments);
  }, [courseColorAssignments, courseColorPalettes]);

  useEffect(() => {
    const ui: ScheduleRenderUi = {
      root: rootRef.current?.getRootNode() as ParentNode | undefined,
      scheduleGrid: scheduleGridRef.current,
      scheduleTermPill: scheduleTermPillRef.current,
      footerAlert: footerAlertRef.current,
    };

    renderSchedule(ui, store.filteredCourses, store.view.semester, store.view.timeFormat);
    renderCourseObjects(
      courseListRef.current,
      store.filteredCourses,
      ui.conflictPartnersByCode ?? new Map<string, string[]>(),
    );

    const toggleButton = scheduleGridRef.current?.querySelector<HTMLButtonElement>(".schedule-time-toggle");
    if (!toggleButton) return;

    const handleToggle = () => {
      store.setTimeFormat(store.view.timeFormat === "am/pm" ? "24h" : "am/pm");
    };

    toggleButton.addEventListener("click", handleToggle);
    return () => toggleButton.removeEventListener("click", handleToggle);
  }, [store.filteredCourses, store.view.semester, store.view.timeFormat]);

  useEffect(() => {
    if (!exportOpen) return;

    const handleDocumentClick = (event: MouseEvent) => {
      const path = event.composedPath ? event.composedPath() : [];
      if (exportDropdownRef.current && !path.includes(exportDropdownRef.current)) {
        setExportOpen(false);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [exportOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (scheduleModal.open) closeScheduleModal(null);
      if (pickerModal.open) closeSchedulePickerModal(null);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [pickerModal.open, scheduleModal.open]);

  return (
    <div ref={rootRef}>
      <button
        id="floating-button"
        type="button"
        onClick={store.togglePanelOpen}
        className={!store.view.isPanelOpen ? "is-collapsed" : ""}
      >
        <span className="floating-button__icon" aria-hidden="true">
          ▶
        </span>
        <span className="material-symbols-rounded">calendar_month</span>
      </button>

      <div className={widgetClassName}>
        <div className="widget-header">
          <span id="widget-title">UBC Workday - Schedule Tool</span>
          <span className="spacer" />
          <div
            ref={exportDropdownRef}
            className={`export-dropdown${exportOpen ? " is-open" : ""}`}
            id="widget-export"
          >
            <button
              className="button export-summary"
              id="widget-export-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((open) => !open)}
            >
              <span className="material-symbols-rounded export-icon" aria-hidden="true">
                ios_share
              </span>
              <span className="text">Export</span>
              <span className="material-symbols-rounded" aria-hidden="true">
                expand_more
              </span>
            </button>
            <div className="export-menu" id="widget-export-menu" role="menu">
              <button
                className="export-option wd-hover-tooltip"
                type="button"
                onClick={() => {
                  exportCoursesAsIcs(store.filteredCourses, store.currentScheduleName);
                  setExportOpen(false);
                }}
              >
                Download .ics
              </button>
              <button
                className="export-option wd-hover-tooltip"
                type="button"
                onClick={() => setExportOpen(false)}
              >
                More options soon...
              </button>
            </div>
          </div>
          <button className="button help" type="button" onClick={() => store.showUtilityPanel("help-panel")}>
            <span className="material-symbols-rounded">help</span>
            <span className="text">Help</span>
          </button>
          <button
            className="button settings symbolOnly"
            type="button"
            onClick={() => store.showUtilityPanel("settings-panel")}
          >
            <span className="material-symbols-rounded">settings</span>
          </button>
        </div>

        <div className="widet-toolbar">
          <button
            className={`tab-button symbolOnly wd-hover-tooltip${store.view.panel === "course-list-panel" ? " is-active" : ""}`}
            type="button"
            onClick={() => store.setPanel("course-list-panel")}
          >
            <span className="text">
              <span className="material-symbols-rounded">format_list_bulleted</span>
            </span>
          </button>
          <button
            className={`tab-button symbolOnly wd-hover-tooltip${store.view.panel === "schedule-panel" ? " is-active" : ""}`}
            type="button"
            onClick={() => store.setPanel("schedule-panel")}
          >
            <span className="text">
              <span className="material-symbols-rounded">calendar_today</span>
            </span>
          </button>
          <div className="widget-search-wrap">
            <span className="material-symbols-rounded search-icon" aria-hidden="true">
              search
            </span>
            <input
              id="widget-search"
              value={store.searchQuery}
              placeholder="Course / Week Day / Instructor..."
              onChange={(event) => startTransition(() => store.setSearchQuery(event.target.value))}
            />
          </div>
          <span className="spacer" />
          <SavedSchedulesDropdown
            id="schedule-saved-dropdown"
            ariaLabel="My saved schedules"
            summaryText="Schedules"
            schedules={store.savedSchedules}
            activeScheduleId={store.currentSavedScheduleId}
            onSelect={(scheduleId) =>
              void (async () => {
                const selected = store.savedSchedules.find((schedule) => schedule.id === scheduleId);
                if (!selected) return;
                if (selected.colorAssignments) await applyCourseColors(selected.colorAssignments);
                store.loadSavedSchedule(selected);
              })()
            }
            onToggleFavorite={(scheduleId) =>
              void (async () => {
                const nextSchedules = togglePreferredSchedule(store.savedSchedules, scheduleId);
                store.setSavedSchedules(nextSchedules);
                await persistSavedSchedules(nextSchedules);
              })()
            }
            onDelete={(scheduleId) =>
              void (async () => {
                const selected = store.savedSchedules.find((schedule) => schedule.id === scheduleId);
                if (!selected) return;
                const confirmed = await openScheduleModal({
                  title: "Permanently Delete Schedule?",
                  message: `This action will permanently delete "${selected.name}".`,
                  confirmLabel: "Delete",
                  showInput: false,
                  showCancel: true,
                });
                if (!confirmed) return;
                const nextSchedules = store.savedSchedules.filter((schedule) => schedule.id !== scheduleId);
                store.setSavedSchedules(nextSchedules);
                await persistSavedSchedules(nextSchedules);
                if (store.currentSavedScheduleId === scheduleId) store.setCurrentSchedule(null, null);
              })()
            }
          />
          <button
            id="widget-save-schedule"
            className="button schedule-save-button symbolOnly wd-hover-tooltip"
            type="button"
            onClick={() =>
              void (async () => {
                if (!canSaveMoreSchedules(store.savedSchedules)) {
                  await openScheduleModal({
                    title: "Schedule limit reached",
                    message: `You can only save up to ${MAX_SCHEDULES} schedules. Delete one to save another.`,
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
                if (typeof name !== "string" || !name.trim()) return;
                const snapshot = createScheduleSnapshot(
                  name.trim(),
                  store.filteredCourses,
                  courseColorAssignments,
                );
                if (!store.savedSchedules.length) snapshot.isFavorite = true;
                const nextSchedules = [snapshot, ...store.savedSchedules];
                store.setSavedSchedules(nextSchedules);
                await persistSavedSchedules(nextSchedules);
              })()
            }
          >
            <span className="material-symbols-rounded save-icon">save_as</span>
          </button>
          <button
            ref={refreshButtonRef}
            id="widget-refresh"
            className="button symbolOnly wd-hover-tooltip"
            type="button"
            onClick={() =>
              void (async () => {
                refreshButtonRef.current?.classList.remove("rotate");
                void refreshButtonRef.current?.offsetWidth;
                refreshButtonRef.current?.classList.add("rotate");
                await loadCoursesFromPage({ preserveExisting: true });
              })()
            }
          >
            <span className="material-symbols-rounded refresh-icon">refresh</span>
          </button>
          <button
            id="widget-clear"
            className="button symbolOnly wd-hover-tooltip"
            type="button"
            onClick={store.clearCourses}
          >
            <span className="material-symbols-rounded">delete_forever</span>
          </button>
        </div>

        <div className="widget-body">
          <div
            className={`widget-panel${store.view.panel === "course-list-panel" ? " is-active" : ""}`}
            data-panel="course-list-panel"
          >
            <div className="course-list-toolbar">
              <span className="course-list-label">Sort By:</span>
              <div className="course-sortbar" id="course-sortbar">
                <button
                  className={sortButtonClass("title")}
                  type="button"
                  onClick={() => store.toggleSort("title")}
                >
                  Title
                </button>
                <button
                  className={sortButtonClass("meeting")}
                  type="button"
                  onClick={() => store.toggleSort("meeting")}
                >
                  Meeting Days
                </button>
                <button
                  className={sortButtonClass("instructionalFormat")}
                  type="button"
                  onClick={() => store.toggleSort("instructionalFormat")}
                >
                  Class Type
                </button>
              </div>
            </div>
            <div ref={courseListRef} className="course-list" id="course-list" />
          </div>
          <div
            className={`widget-panel${store.view.panel === "schedule-panel" ? " is-active" : ""}`}
            data-panel="schedule-panel"
          >
            <div className="schedule-controls">
              <div ref={scheduleTermPillRef} className="schedule-term-pill" id="schedule-term-pill">
                Detected Term
              </div>
            </div>
            <div ref={scheduleGridRef} className="schedule-grid" id="schedule-grid" />
          </div>
          <div
            className={`widget-panel${store.view.panel === "settings-panel" ? " is-active" : ""}`}
            data-panel="settings-panel"
          >
            <SettingsPanel
              hoverTipsEnabled={store.view.hoverTipsEnabled}
              onHoverTipsChange={(enabled) =>
                void (async () => {
                  store.setHoverTipsEnabled(enabled);
                  await persistHoverTooltipSetting(enabled);
                })()
              }
              courseColorPalettes={courseColorPalettes}
              courseColorAssignments={courseColorAssignments}
              onCourseColorChange={(index, paletteId) => {
                const nextAssignments = [...courseColorAssignments];
                nextAssignments[index] = paletteId;
                void applyCourseColors(nextAssignments);
              }}
              onResetColors={() => void applyCourseColors([...DEFAULT_COURSE_COLOR_ASSIGNMENTS])}
            />
          </div>
          <div
            className={`widget-panel${store.view.panel === "help-panel" ? " is-active" : ""}`}
            data-panel="help-panel"
          >
            <HelpPanel />
          </div>
        </div>

        <div className="widget-footer">
          <span
            ref={footerAlertRef}
            className="footer-alert is-hidden"
            id="schedule-conflict-alert"
            aria-live="polite"
          />
          <span className="spacer" />
        </div>

        <ScheduleModal
          open={scheduleModal.open}
          title={scheduleModal.title}
          message={scheduleModal.message}
          confirmLabel={scheduleModal.confirmLabel}
          showInput={scheduleModal.showInput}
          showCancel={scheduleModal.showCancel}
          inputValue={scheduleModal.inputValue}
          inputInvalid={scheduleModal.inputInvalid}
          onInputChange={(value) =>
            setScheduleModal((current) => ({ ...current, inputValue: value, inputInvalid: false }))
          }
          onClose={() => closeScheduleModal(null)}
          onConfirm={() => {
            if (!scheduleModal.showInput) {
              closeScheduleModal(true);
              return;
            }
            const trimmed = scheduleModal.inputValue.trim();
            if (!trimmed) {
              setScheduleModal((current) => ({ ...current, inputInvalid: true }));
              return;
            }
            closeScheduleModal(trimmed);
          }}
        />
        <SchedulePickerModal
          open={pickerModal.open}
          title={pickerModal.title}
          message={pickerModal.message}
          options={pickerModal.options}
          onClose={() => closeSchedulePickerModal(null)}
          onSelect={(scheduleId) => closeSchedulePickerModal(scheduleId)}
        />
      </div>
    </div>
  );
}
