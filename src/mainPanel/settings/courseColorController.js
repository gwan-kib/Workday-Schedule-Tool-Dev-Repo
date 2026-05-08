import { on } from "../../utilities/dom.js";
import { debugFor, debugLog } from "../../utilities/debugTool.js";
import {
  applyCourseColorAssignments,
  assignCourseColors,
  captureCourseColorPalettes,
  COURSE_COLOR_COUNT,
  COURSE_COLOR_LABELS,
  DEFAULT_COURSE_COLOR_ASSIGNMENTS,
  loadCourseColorAssignments,
  normalizeCourseColorAssignments,
  persistCourseColorAssignments,
} from "./courseColorSettings.js";

const debug = debugFor("courseColorController");
debugLog({ local: { courseColorController: false } });

// Creates the course color UI controller. Input: ui object. Output: controller object.
export async function createCourseColorController(ui) {
  debug.log({ id: "createCourseColorController.start" }, "Initializing course color controller");
  const courseColorTarget = ui.root?.host || ui.mainPanel;
  const courseColorPalettes = captureCourseColorPalettes(courseColorTarget);
  let courseColorAssignments = await loadCourseColorAssignments();

  if (courseColorTarget && courseColorPalettes.length) {
    courseColorAssignments = normalizeCourseColorAssignments(courseColorAssignments);
    applyCourseColorAssignments(courseColorTarget, courseColorPalettes, courseColorAssignments);
    debug.log(
      { id: "createCourseColorController.initialApply" },
      "Applied initial course color assignments",
      { assignments: courseColorAssignments },
    );
  }

  let closeCourseColorMenus = () => {};

  const renderCourseColorSettings = () => {
    if (!ui.courseColorGrid || !courseColorPalettes.length) {
      debug.log({ id: "createCourseColorController.render.skip" }, "Skipped rendering course color settings");
      return;
    }
    ui.courseColorGrid.innerHTML = "";
    debug.log({ id: "createCourseColorController.render" }, "Rendering course color settings", {
      paletteCount: courseColorPalettes.length,
    });

    const paletteById = new Map(courseColorPalettes.map((palette) => [palette.id, palette]));
    closeCourseColorMenus = (exceptMenu = null) => {
      ui.courseColorGrid.querySelectorAll(".course-color-select.is-open").forEach((menu) => {
        if (menu === exceptMenu) return;
        menu.classList.remove("is-open");
        menu.querySelector(".course-color-select-button")?.setAttribute("aria-expanded", "false");
      });
    };

    for (let index = 0; index < COURSE_COLOR_COUNT; index += 1) {
      const courseIndex = index + 1;
      const row = document.createElement("div");
      row.className = "course-color-row";

      const label = document.createElement("div");
      label.className = "course-color-label";
      label.textContent = `Course ${courseIndex}`;

      const control = document.createElement("div");
      control.className = "course-color-control";

      const selectMenu = document.createElement("div");
      selectMenu.className = "course-color-select";
      selectMenu.dataset.courseColor = String(courseIndex);

      const selectButton = document.createElement("button");
      selectButton.className = "course-color-select-button";
      selectButton.type = "button";
      selectButton.setAttribute("aria-haspopup", "listbox");
      selectButton.setAttribute("aria-expanded", "false");

      const selectText = document.createElement("span");
      selectText.className = "course-color-select-text";
      selectButton.appendChild(selectText);

      const optionsList = document.createElement("div");
      optionsList.className = "course-color-select-menu";
      optionsList.setAttribute("role", "listbox");

      const swatch = document.createElement("div");
      swatch.className = "course-color-swatch";

      const updateSwatch = (paletteId) => {
        const palette = paletteById.get(paletteId);
        if (!palette) return;
        swatch.style.background = palette.bg;
        swatch.style.borderColor = palette.border;
      };

      const updateSelectedOption = (paletteId) => {
        const selectedIndex = courseColorPalettes.findIndex((palette) => palette.id === paletteId);
        selectText.textContent =
          COURSE_COLOR_LABELS[selectedIndex] || courseColorPalettes[selectedIndex]?.label || `Palette ${paletteId}`;
        optionsList.querySelectorAll(".course-color-select-option").forEach((option) => {
          const isSelected = Number(option.dataset.paletteId) === paletteId;
          option.classList.toggle("is-selected", isSelected);
          option.setAttribute("aria-selected", String(isSelected));
        });
      };

      const applySelectedPalette = async (paletteId) => {
        debug.log({ id: "createCourseColorController.change" }, "Course color selection changed", {
          courseIndex,
          paletteId,
        });
        courseColorAssignments[index] = paletteId;
        courseColorAssignments = normalizeCourseColorAssignments(courseColorAssignments);
        applyCourseColorAssignments(courseColorTarget, courseColorPalettes, courseColorAssignments);
        updateSwatch(paletteId);
        updateSelectedOption(paletteId);
        await persistCourseColorAssignments(courseColorAssignments);
      };

      courseColorPalettes.forEach((palette, paletteIndex) => {
        const option = document.createElement("button");
        option.className = "course-color-select-option";
        option.type = "button";
        option.dataset.paletteId = String(palette.id);
        option.setAttribute("role", "option");

        const optionSwatch = document.createElement("span");
        optionSwatch.className = "course-color-option-swatch";
        optionSwatch.style.background = palette.bg;
        optionSwatch.style.borderColor = palette.border;
        optionSwatch.setAttribute("aria-hidden", "true");

        const optionLabel = document.createElement("span");
        optionLabel.className = "course-color-option-label";
        optionLabel.textContent = COURSE_COLOR_LABELS[paletteIndex] || palette.label || `Palette ${palette.id}`;

        option.appendChild(optionSwatch);
        option.appendChild(optionLabel);

        on(option, "click", async () => {
          await applySelectedPalette(palette.id);
          selectMenu.classList.remove("is-open");
          selectButton.setAttribute("aria-expanded", "false");
          selectButton.focus();
        });

        optionsList.appendChild(option);
      });

      updateSwatch(courseColorAssignments[index]);
      updateSelectedOption(courseColorAssignments[index]);

      on(selectButton, "click", () => {
        const isOpen = selectMenu.classList.toggle("is-open");
        selectButton.setAttribute("aria-expanded", String(isOpen));
        closeCourseColorMenus(selectMenu);
        if (isOpen) {
          optionsList.querySelector(".course-color-select-option.is-selected")?.focus();
        }
      });

      on(selectMenu, "keydown", (event) => {
        const options = Array.from(optionsList.querySelectorAll(".course-color-select-option"));
        const currentIndex = options.indexOf(document.activeElement);

        if (event.key === "Escape") {
          selectMenu.classList.remove("is-open");
          selectButton.setAttribute("aria-expanded", "false");
          selectButton.focus();
          return;
        }

        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + options.length) % options.length;
        options[nextIndex]?.focus();
      });

      selectMenu.appendChild(selectButton);
      selectMenu.appendChild(optionsList);
      control.appendChild(swatch);
      control.appendChild(selectMenu);
      row.appendChild(label);
      row.appendChild(control);
      ui.courseColorGrid.appendChild(row);
    }
  };

  on(ui.root, "click", (event) => {
    if (event.target.closest?.(".course-color-select")) return;
    closeCourseColorMenus();
  });

  const applyAndPersistCourseColors = async (assignments, { skipPersist = false } = {}) => {
    debug.log({ id: "createCourseColorController.applyAndPersist" }, "Applying course colors", {
      assignments,
      skipPersist,
    });
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

  return {
    assignCourseColors,
    applyAndPersistCourseColors,
    getAssignments: () => {
      debug.log({ id: "createCourseColorController.getAssignments" }, "Reading course color assignments", {
        assignments: courseColorAssignments,
      });
      return [...courseColorAssignments];
    },
  };
}
