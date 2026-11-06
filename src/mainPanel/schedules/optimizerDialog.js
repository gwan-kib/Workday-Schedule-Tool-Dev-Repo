import { OPTIMIZER_PRIORITIES, optimizeSchedules } from "../../core/scheduleOptimizer.js";
import { catalogSectionLink } from "../../api/courseCatalog.js";
import { courseIdentity } from "../../core/meetings.js";
import { loadOptimizerOptions } from "../../extraction/optimizerOptions.js";
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

export function openOptimizer(d, { getDraft, apply }) {
  const controller = new AbortController();
  d.cleanup.push(() => controller.abort());
  const coursesInDraft = node("p", null, "planner-hint");
  const discovery = node("div", null, "planner-feature-fields");
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
    node("p", "Find alternate sections for courses already in your working schedule. The lookup uses the public UBC catalog. Personal blocks stay fixed.", "planner-hint"),
    coursesInDraft,
    discovery,
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
    discovery.replaceChildren();
    results.replaceChildren();
    selected = null;
    applyButton.hidden = true;
    d.setStatus("");
  };

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
  function describeDraft(courses) {
    coursesInDraft.textContent = courses.length
      ? "Current sections: " + courses.map(sectionLabel).join(" / ")
      : "Load or add courses to your schedule before looking for suggestions.";
  }
  describeDraft(getDraft().courses);

  const search = button("Find suggestions", d.run(async () => {
    clearResults();
    const priorities = order.filter(key => enabled.has(key));
    snapshot = getDraft();
    describeDraft(snapshot.courses);
    if (!snapshot.courses.length) throw new Error("Load or add courses to your schedule first.");

    drawPriorities(undefined, undefined, true);
    d.setStatus("Checking the UBC course schedule…", "info");
    try {
      const options = await loadOptimizerOptions(snapshot.courses, { signal: controller.signal });
      const listing = node("details", null, "planner-change-list");
      listing.append(node("summary", "Section search results"));
      for (const row of options.report) {
        listing.append(node("p", row.label + " · " + row.note));
      }
      discovery.append(listing);
      if (!options.groups.length) {
        listing.open = true;
        d.setStatus("No verified alternatives were found for this draft.", "info");
        return;
      }
      const currentKey = JSON.stringify(snapshot.courses.map(courseIdentity).sort());
      const outcome = await optimizeSchedules({
        ...options,
        personalBlocks: snapshot.personalBlocks,
        priorities,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (outcome.fixedConflict) {
        listing.open = true;
        d.setStatus("Sections that must stay fixed clash with each other or with a personal block. Adjust the draft and try again.", "error");
        return;
      }
      const notes = [
        outcome.excluded ? "Some options had incomplete meeting times and were skipped." : "",
        outcome.limited ? "The search limit was reached. These are the best schedules found so far." : "",
      ].filter(Boolean);
      if (!outcome.suggestions.length) {
        d.setStatus(["No conflict-free suggestion found.", ...notes].join(" "), "info");
        return;
      }

      const choose = node("select");
      const label = node("label", null, "planner-field");
      label.append(node("span", "Ranked suggestions", "planner-field-label"), choose);
      for (const [index, item] of outcome.suggestions.entries()) {
        const label = item.key === currentKey
          ? "Current draft"
          : item.courses.map(c => c.code + " " + c.section_number).join(" / ");
        const option = node("option", (index + 1) + ". " + label);
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
        const unchanged = selected.key === currentKey;
        applyButton.hidden = unchanged;
        if (unchanged) metrics.append(node("li", "This suggestion keeps your current sections."));
        const draftIds = new Set(snapshot.courses.map(courseIdentity));
        for (const course of selected.courses) {
          const href = catalogSectionLink(course.catalogSectionLink);
          if (draftIds.has(courseIdentity(course)) || !href) continue;
          const link = node("a", "View " + sectionLabel(course) + " in the UBC catalog");
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          const item = node("li");
          item.append(link);
          metrics.append(item);
        }
        if (!preview) {
          preview = d.preview(host, courses, "Suggestion " + (index + 1), new Set(), 1, snapshot.personalBlocks);
        } else {
          preview.scheduleName = "Suggestion " + (index + 1);
          renderSchedule(preview, courses, null, "am/pm");
        }
      };
      choose.onchange = show;
      show();
      d.setStatus(["Review the timetable and confirm current availability in Workday. Applying is undoable.", ...notes].join(" "));
    } finally {
      drawPriorities();
    }
  }));
  d.actions.append(search, applyButton);
}
