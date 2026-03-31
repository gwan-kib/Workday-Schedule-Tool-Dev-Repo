import { useEffect, useRef } from "react";

import { formatScheduleMeta } from "../../domain/settings/courseColorSettings";
import type { SavedSchedule } from "../../lib/types";

type SavedSchedulesDropdownProps = {
  id: string;
  ariaLabel: string;
  summaryText: string;
  schedules: SavedSchedule[];
  activeScheduleId: string | null;
  emptyText?: string;
  hideWhenSingle?: boolean;
  onSelect: (scheduleId: string) => void;
  onToggleFavorite: (scheduleId: string) => void;
  onDelete?: (scheduleId: string) => void;
};

export function SavedSchedulesDropdown({
  id,
  ariaLabel,
  summaryText,
  schedules,
  activeScheduleId,
  emptyText = "No saved schedules yet.",
  hideWhenSingle = false,
  onSelect,
  onToggleFavorite,
  onDelete,
}: SavedSchedulesDropdownProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const details = detailsRef.current;
      if (!details?.open) return;

      const path = event.composedPath ? event.composedPath() : [];
      if (!path.includes(details)) {
        details.open = false;
      }
    };

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  return (
    <details
      ref={detailsRef}
      className={`schedule-saved-dropdown${hideWhenSingle && schedules.length <= 1 ? " is-hidden" : ""}`}
      id={id}
    >
      <summary className="schedule-saved-summary" aria-label={ariaLabel}>
        <span className="text">{summaryText}</span>
        <span className="material-symbols-rounded" aria-hidden="true">
          expand_more
        </span>
      </summary>
      <div className="schedule-saved-menu">
        {schedules.length ? (
          schedules.map((schedule) => (
            <div
              key={schedule.id}
              className={`schedule-saved-card${schedule.id === activeScheduleId ? " is-active" : ""}`}
              data-id={schedule.id}
              tabIndex={0}
              role="button"
              aria-label={`Load ${schedule.name}`}
              onClick={() => {
                onSelect(schedule.id);
                if (detailsRef.current) detailsRef.current.open = false;
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(schedule.id);
                if (detailsRef.current) detailsRef.current.open = false;
              }}
            >
              <div className="schedule-saved-card-header">
                <div>
                  <div className="schedule-saved-title-row">
                    <div className="schedule-saved-title">{schedule.name}</div>
                    {schedule.isFavorite ? <span className="schedule-saved-badge">Favorite</span> : null}
                  </div>
                  <div className="schedule-saved-meta">{formatScheduleMeta(schedule)}</div>
                </div>
              </div>
              <div className="schedule-saved-actions">
                <button
                  type="button"
                  className={`schedule-saved-action star${schedule.isFavorite ? " is-favorite" : ""}`}
                  data-action="favorite"
                  aria-label={schedule.isFavorite ? "Unstar schedule" : "Star schedule"}
                  title={schedule.isFavorite ? "Unstar schedule" : "Star schedule"}
                  aria-pressed={schedule.isFavorite}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite(schedule.id);
                  }}
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    star
                  </span>
                </button>
                {onDelete ? (
                  <button
                    type="button"
                    className="schedule-saved-action delete"
                    data-action="delete"
                    aria-label="Delete schedule"
                    title="Delete schedule"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(schedule.id);
                    }}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">
                      delete
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="schedule-saved-empty">{emptyText}</div>
        )}
      </div>
    </details>
  );
}
