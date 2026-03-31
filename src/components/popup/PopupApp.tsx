import { useEffect, useMemo, useRef, useState } from "react";

import {
  applyCourseColorAssignments,
  captureCourseColorPalettes,
  formatScheduleMeta,
  getPreferredSchedule,
  loadSavedSchedules,
  persistSavedSchedules,
  togglePreferredSchedule,
} from "../../domain/settings/courseColorSettings";
import { renderSchedule } from "../../domain/schedule/scheduleView";
import { ensureMaterialSymbolsFont } from "../../lib/fonts";
import type { CourseColorPalette, SavedSchedule } from "../../lib/types";
import { SavedSchedulesDropdown } from "../shared/SavedSchedulesDropdown";

export function PopupApp() {
  const scheduleGridRef = useRef<HTMLDivElement>(null);
  const scheduleTermPillRef = useRef<HTMLDivElement>(null);
  const footerAlertRef = useRef<HTMLDivElement>(null);

  const [schedules, setSchedules] = useState<SavedSchedule[]>([]);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [timeFormat, setTimeFormat] = useState<"am/pm" | "24h">("am/pm");
  const [basePalettes, setBasePalettes] = useState<CourseColorPalette[]>([]);

  const activeSchedule = useMemo(
    () => schedules.find((schedule) => schedule.id === activeScheduleId) || getPreferredSchedule(schedules),
    [activeScheduleId, schedules],
  );

  useEffect(() => {
    ensureMaterialSymbolsFont(document);
    setBasePalettes(captureCourseColorPalettes(document.documentElement));

    void (async () => {
      const storedSchedules = await loadSavedSchedules();
      setSchedules(storedSchedules);
      setActiveScheduleId(getPreferredSchedule(storedSchedules)?.id || null);
    })();
  }, []);

  useEffect(() => {
    if (!activeSchedule) return;

    if (basePalettes.length) {
      applyCourseColorAssignments(
        document.documentElement,
        basePalettes,
        activeSchedule.colorAssignments || [],
      );
    }

    renderSchedule(
      {
        scheduleGrid: scheduleGridRef.current,
        scheduleTermPill: scheduleTermPillRef.current,
        footerAlert: footerAlertRef.current,
      },
      activeSchedule.courses,
      null,
      timeFormat,
    );

    const toggleButton = scheduleGridRef.current?.querySelector<HTMLButtonElement>(".schedule-time-toggle");
    if (!toggleButton) return;

    const handleToggle = () => {
      setTimeFormat((current) => (current === "am/pm" ? "24h" : "am/pm"));
    };

    toggleButton.addEventListener("click", handleToggle);
    return () => toggleButton.removeEventListener("click", handleToggle);
  }, [activeSchedule, basePalettes, timeFormat]);

  return (
    <main className="popup-shell">
      {!activeSchedule ? (
        <section className="popup-empty" id="popup-empty">
          <h2>No saved schedules yet</h2>
          <p>
            Open Workday, save a schedule there, and it will appear here the next time you click the extension
            icon.
          </p>
        </section>
      ) : null}

      <section className="popup-brand" aria-label="Extension name">
        <p className="popup-eyebrow">Chrome Extension</p>
        <h1 className="popup-brand-title">UBC Workday - Schedule Tool</h1>
      </section>

      {activeSchedule ? (
        <section className="popup-content" id="popup-content">
          <div className="popup-picker" id="popup-picker-wrap">
            <span className="popup-picker-label">Saved Schedules:</span>
            <SavedSchedulesDropdown
              id="popup-saved-dropdown"
              ariaLabel="Choose saved schedule"
              summaryText={activeSchedule.name || "Schedules"}
              schedules={schedules}
              activeScheduleId={activeSchedule.id}
              hideWhenSingle
              onSelect={(scheduleId) => setActiveScheduleId(scheduleId)}
              onToggleFavorite={(scheduleId) =>
                void (async () => {
                  const nextSchedules = togglePreferredSchedule(schedules, scheduleId);
                  setSchedules(nextSchedules);
                  await persistSavedSchedules(nextSchedules);
                })()
              }
            />
          </div>

          <div className="popup-meta-row">
            <div ref={scheduleTermPillRef} className="schedule-term-pill" id="popup-term-pill">
              Detected Term
            </div>
            <div className="popup-meta" id="popup-meta">
              {formatScheduleMeta(activeSchedule)}
            </div>
          </div>

          <div ref={scheduleGridRef} className="schedule-grid" id="popup-schedule-grid" />
          <div
            ref={footerAlertRef}
            className="popup-alert footer-alert is-hidden"
            id="popup-footer-alert"
            aria-live="polite"
          />
        </section>
      ) : null}
    </main>
  );
}
