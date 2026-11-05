import { OPTIMIZER_PRIORITIES, optimizeSchedules } from "../../core/scheduleOptimizer.js";
import { loadOptimizerOptions, MAX_OPTIMIZER_GROUPS } from "../../extraction/optimizerOptions.js";
import { clock, sectionLabel } from "../../core/planner.js";
import { assignCourseColors } from "../settings/courseColorSettings.js";
import { renderSchedule } from "./scheduleView.js";
import { node } from "./plannerOverview.js";

function button(text, click) {
  const control = node("button", text);
  control.type = "button";
  control.addEventListener("click", click);
  return control;
}

const days = count => count + (count === 1 ? " day" : " days");
const metricText = {
  friday: value => days(value) + " with Friday classes",
  late: value => "First class at " + clock(value),
  early: value => "Last class ends at " + clock(value),
  gaps: value => Math.round(value) + " min between classes per class day",
  campus: value => days(value) + " with classes on campus",
};

export function openOptimizer(d, { getDraft, apply, fetchSection }) {
  const controller = new AbortController();
  d.cleanup.push(() => controller.abort());
  const form = node("fieldset", null, "planner-feature-fields");
  form.append(node("legend", "Required courses"));
  const groups = node("div", null, "planner-feature-fields");
  const priorityList = node("ol", null, "planner-priority-list");
  const results = node("section", null, "planner-feature-fields");
  const applyButton = button("Apply to draft", d.run(() => {
    if (!selected) return;
    apply(selected.courses, snapshot);
    d.close();
  }));
  applyButton.hidden = true;
  applyButton.className = "planner-primary";

  d.content.append(
    node("p", "Add one group per required course. Put each alternative on its own line using the Section links from Workday. For linked lectures, labs or tutorials, put the links together on one line after confirming that combination in Workday.", "planner-hint"),
    node("p", "Other courses and personal blocks in your draft stay fixed. Check seat availability in Workday before registration.", "planner-hint"),
    form,
    node("h3", "Rank your preferences"),
    node("p", "The first enabled preference matters most. Choose later starts or earlier finishes, and turn off any preference you don’t need. Friday classes are allowed when needed.", "planner-hint"),
    priorityList,
    results,
  );
  const order = Object.keys(OPTIMIZER_PRIORITIES);
  const enabled = new Set(["friday", "late", "gaps"]);
  let selected = null, snapshot, preview;
  const clearResults = () => {
    preview?.dispose();
    preview = undefined;
    results.replaceChildren();
    selected = null;
    applyButton.hidden = true;
    d.setStatus("");
  };

  const addGroup = button("Add required course", () => {
    const row = node("div", null, "planner-feature-fields");
    const label = node("label", null, "planner-field");
    const caption = node("span", null, "planner-field-label");
    const links = node("textarea");
    links.rows = 2;
    links.maxLength = 12000;
    links.placeholder = "Paste Workday Section links here";
    links.addEventListener("input", clearResults);
    label.append(caption, links);
    const remove = button("Remove group", () => {
      row.remove();
      renumberGroups();
      clearResults();
      addGroup.focus();
    });
    row.append(label, remove);
    groups.append(row);
    renumberGroups();
    clearResults();
    links.focus();
  });
  function renumberGroups() {
    [...groups.children].forEach((row, index) => {
      row.querySelector("span").textContent = "Course group " + (index + 1) + " options";
      row.querySelector("button").setAttribute("aria-label", "Remove course group " + (index + 1));
    });
    addGroup.disabled = groups.children.length >= MAX_OPTIMIZER_GROUPS;
  }
  form.append(groups, addGroup);

  function drawPriorities(focusKey, focusControl = "input", disabled = false) {
    priorityList.replaceChildren();
    const active = order.filter(key => enabled.has(key));
    for (const key of [...active, ...order.filter(key => !enabled.has(key))]) {
      const row = node("li");
      row.dataset.priority = key;
      const label = node("label");
      const checkbox = node("input");
      checkbox.type = "checkbox";
      checkbox.checked = enabled.has(key);
      checkbox.disabled = disabled;
      checkbox.onchange = () => {
        if (checkbox.checked) {
          enabled.add(key);
          if (key === "late") enabled.delete("early");
          if (key === "early") enabled.delete("late");
        } else {
          enabled.delete(key);
        }
        clearResults();
        drawPriorities(key);
      };
      label.append(checkbox, document.createTextNode(OPTIMIZER_PRIORITIES[key]));
      row.append(label);
      const index = active.indexOf(key);
      if (index !== -1) {
        for (const [direction, delta] of [["up", -1], ["down", 1]]) {
          const adjacent = active[index + delta];
          const move = button(direction === "up" ? "Up" : "Down", () => {
            const a = order.indexOf(key), b = order.indexOf(adjacent);
            [order[a], order[b]] = [order[b], order[a]];
            clearResults();
            drawPriorities(key, "button[data-direction='" + direction + "']");
          });
          move.dataset.direction = direction;
          move.setAttribute("aria-label", "Move " + OPTIMIZER_PRIORITIES[key] + " " + direction);
          move.disabled = disabled || !adjacent;
          row.append(move);
        }
      }
      priorityList.append(row);
      if (key === focusKey) {
        const target = row.querySelector(focusControl);
        (target && !target.disabled ? target : checkbox).focus();
      }
    }
  }
  drawPriorities();
  addGroup.click();

  const search = button("Find suggestions", d.run(async () => {
    clearResults();
    const inputs = [...groups.querySelectorAll("textarea")].map(input => input.value);
    const priorities = order.filter(key => enabled.has(key));
    snapshot = getDraft();
    form.disabled = true;
    drawPriorities(undefined, undefined, true);
    d.setStatus("Checking Workday sections and finding schedules…", "info");
    try {
      const options = await loadOptimizerOptions(inputs, snapshot.courses, { fetchSection, signal: controller.signal });
      const outcome = await optimizeSchedules({
        ...options,
        personalBlocks: snapshot.personalBlocks,
        priorities,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (outcome.fixedConflict) {
        d.setStatus("Fixed courses clash with each other or with a personal block. Adjust the draft or add a group for a conflicting course.", "error");
        return;
      }
      const skipped = outcome.excluded + options.unavailable;
      const notes = [
        skipped ? skipped + " option(s) skipped because Workday data was missing or the meeting times could not be verified." : "",
        outcome.limited ? "The search limit was reached. Try fewer options to check every combination." : "",
      ].filter(Boolean);
      if (!outcome.suggestions.length) {
        d.setStatus(["No conflict-free suggestion found.", ...notes].join(" "), "info");
        return;
      }

      const choose = node("select");
      const label = node("label", null, "planner-field");
      label.append(node("span", "Ranked suggestions", "planner-field-label"), choose);
      for (const [index, item] of outcome.suggestions.entries()) {
        const option = node("option", (index + 1) + ". " + item.courses.map(c => c.code + " " + c.section_number).join(" / "));
        option.value = String(index);
        choose.append(option);
      }
      const metrics = node("ul", null, "planner-feature-details");
      const host = node("div");
      results.append(label, metrics, host);
      const show = () => {
        const index = Number(choose.value);
        selected = outcome.suggestions[index];
        const courses = structuredClone(selected.courses);
        assignCourseColors(courses);
        metrics.replaceChildren(...priorities.map(key =>
          node("li", OPTIMIZER_PRIORITIES[key] + " · " + metricText[key](selected.metrics[key])),
        ));
        if (!priorities.length) metrics.append(node("li", "No preferences selected. Results use section order."));
        metrics.append(node("li", selected.courses.map(sectionLabel).join(" / ")));
        if (!preview) {
          preview = d.preview(host, courses, "Suggestion " + (index + 1), new Set(), 1, snapshot.personalBlocks);
        } else {
          preview.scheduleName = "Suggestion " + (index + 1);
          renderSchedule(preview, courses, null, "am/pm");
        }
      };
      choose.onchange = show;
      show();
      applyButton.hidden = false;
      d.setStatus(["Choose a suggestion to see its timetable. Applying is undoable.", ...notes].join(" "));
    } finally {
      form.disabled = false;
      drawPriorities();
    }
  }));
  d.actions.append(search, applyButton);
}
