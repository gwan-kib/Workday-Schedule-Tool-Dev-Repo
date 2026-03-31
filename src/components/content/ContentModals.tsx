import type { SchedulePickerOption } from "../../lib/types";

type ScheduleModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  showInput: boolean;
  showCancel: boolean;
  inputValue: string;
  inputInvalid: boolean;
  onInputChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

type SchedulePickerModalProps = {
  open: boolean;
  title: string;
  message: string;
  options: SchedulePickerOption[];
  onClose: () => void;
  onSelect: (scheduleId: string) => void;
};

export function ScheduleModal({
  open,
  title,
  message,
  confirmLabel,
  showInput,
  showCancel,
  inputValue,
  inputInvalid,
  onInputChange,
  onClose,
  onConfirm,
}: ScheduleModalProps) {
  return (
    <div className={`schedule-modal${open ? "" : " is-hidden"}`} id="schedule-save-modal" aria-hidden={!open}>
      <div className="schedule-modal-backdrop" data-action="close" onClick={onClose} />
      <div className="dialog-container">
        <div
          className="schedule-modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-modal-title"
        >
          <div className="schedule-modal-header">
            <h3 className="schedule-modal-title" id="schedule-modal-title">
              {title}
            </h3>
            <button className="schedule-modal-close" type="button" data-action="close" onClick={onClose}>
              <span className="material-symbols-rounded" aria-hidden="true">
                close
              </span>
            </button>
          </div>
          <p className="schedule-modal-message" id="schedule-modal-message">
            {message}
          </p>
          <label className={`schedule-modal-field${showInput ? "" : " is-hidden"}`} id="schedule-modal-field">
            <span className="schedule-modal-label">Schedule name</span>
            <input
              id="schedule-modal-input"
              className={`schedule-modal-input${inputInvalid ? " is-invalid" : ""}`}
              type="text"
              placeholder="e.g. Fall semester plan"
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onConfirm();
              }}
            />
          </label>
          <div className="schedule-modal-actions">
            {showCancel ? (
              <button className="button schedule-modal-cancel" type="button" onClick={onClose}>
                Cancel
              </button>
            ) : null}
            <button className="button schedule-modal-confirm" type="button" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SchedulePickerModal({
  open,
  title,
  message,
  options,
  onClose,
  onSelect,
}: SchedulePickerModalProps) {
  return (
    <div
      className={`schedule-modal${open ? "" : " is-hidden"}`}
      id="schedule-picker-modal"
      aria-hidden={!open}
    >
      <div className="schedule-modal-backdrop" data-action="close" onClick={onClose} />
      <div className="dialog-container">
        <div
          className="schedule-modal-dialog schedule-picker-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-picker-title"
        >
          <div className="schedule-modal-header">
            <h3 className="schedule-modal-title" id="schedule-picker-title">
              {title}
            </h3>
            <button className="schedule-modal-close" type="button" data-action="close" onClick={onClose}>
              <span className="material-symbols-rounded" aria-hidden="true">
                close
              </span>
            </button>
          </div>
          <p className="schedule-modal-message" id="schedule-picker-message">
            {message}
          </p>
          <div className="schedule-picker-list" id="schedule-picker-list">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="schedule-picker-option"
                data-schedule-id={option.id}
                onClick={() => onSelect(option.id)}
              >
                <span className="schedule-picker-option-title">{option.title}</span>
                <span className="schedule-picker-option-meta">
                  {option.courseCount} course{option.courseCount === 1 ? "" : "s"}
                </span>
                <span className="schedule-picker-option-courses">
                  {option.courseNames.length ? option.courseNames.join(", ") : "No course names detected"}
                </span>
              </button>
            ))}
          </div>
          <div className="schedule-modal-actions">
            <button className="button schedule-modal-cancel" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
