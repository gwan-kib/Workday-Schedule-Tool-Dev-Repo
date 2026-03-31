import { DEFAULT_COURSE_COLOR_ASSIGNMENTS } from "../../domain/settings/courseColorSettings";
import type { CourseColorPalette } from "../../lib/types";

type SettingsPanelProps = {
  hoverTipsEnabled: boolean;
  onHoverTipsChange: (enabled: boolean) => void;
  courseColorPalettes: CourseColorPalette[];
  courseColorAssignments: number[];
  onCourseColorChange: (courseIndex: number, paletteId: number) => void;
  onResetColors: () => void;
};

export function SettingsPanel({
  hoverTipsEnabled,
  onHoverTipsChange,
  courseColorPalettes,
  courseColorAssignments,
  onCourseColorChange,
  onResetColors,
}: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      <p>More options will be added in future updates.</p>
      <div className="settings-box settings-box--stack">
        <div className="settings-section settings-section--display">
          <h3>Display</h3>
          <p>Control hover tips across the tool.</p>
          <label className="settings-tooltip-toggle">
            <span className="settings-toggle__label">
              <span className="settings-toggle__title">Hover tips</span>
              <span className="settings-toggle__hint">Show labels on hover</span>
            </span>
            <input
              id="setting-hover-tips"
              className="settings-toggle__input"
              type="checkbox"
              role="switch"
              checked={hoverTipsEnabled}
              onChange={(event) => onHoverTipsChange(event.target.checked)}
            />
            <span className="settings-toggle__slider" aria-hidden="true" />
          </label>
        </div>

        <div className="settings-section settings-section--course-colors">
          <h3>Course Colors</h3>
          <p>Customize your course colors.</p>
          <div className="course-color-grid" id="course-color-grid">
            {courseColorPalettes.map((palette, index) => {
              const courseIndex = index + 1;
              const selectedPaletteId =
                courseColorAssignments[index] ?? DEFAULT_COURSE_COLOR_ASSIGNMENTS[index] ?? palette.id;

              return (
                <div key={courseIndex} className="course-color-row">
                  <div className="course-color-label">{`Course ${courseIndex}`}</div>
                  <div className="course-color-control">
                    <select
                      className="course-color-select"
                      data-course-color={courseIndex}
                      value={selectedPaletteId}
                      onChange={(event) => onCourseColorChange(index, Number(event.target.value))}
                    >
                      {courseColorPalettes.map((optionPalette) => (
                        <option key={optionPalette.id} value={optionPalette.id}>
                          {optionPalette.label}
                        </option>
                      ))}
                    </select>
                    <div
                      className="course-color-swatch"
                      style={{
                        background: courseColorPalettes[selectedPaletteId - 1]?.bg,
                        borderColor: courseColorPalettes[selectedPaletteId - 1]?.border,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <button
            className="button course-color-reset"
            id="course-color-reset"
            type="button"
            onClick={onResetColors}
          >
            Reset to default
          </button>
        </div>

        <div className="settings-field--github-link">
          <label className="settings-field">
            <a
              className="link"
              href="https://github.com/gwan-kib/Workday-Schedule-Tool"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub Repo
              <span className="material-symbols-rounded">arrow_outward</span>
            </a>
          </label>
        </div>

        <div className="settings-section settings-section--team">
          <h3>Project Team</h3>
          <div className="team-links">
            <label className="settings-field">
              <a
                className="link"
                href="https://www.linkedin.com/in/gwantanakiboigo/"
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn: Gwantana Kiboigo
                <span className="material-symbols-rounded">arrow_outward</span>
              </a>
            </label>
            <label className="settings-field">
              <a
                className="link"
                href="https://www.linkedin.com/in/mahmoud-rabie-2b0287344/"
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn: Mahmoud Rabie
                <span className="material-symbols-rounded">arrow_outward</span>
              </a>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
