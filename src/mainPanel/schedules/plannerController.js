import { renderSchedule } from "./scheduleView.js";
import { node } from "./plannerOverview.js";
import { compareSchedules, sectionLabel } from "../../core/planner.js";
import { courseIdentity } from "../../core/meetings.js";
import { storageGet, storageSet } from "../../utilities/storage.js";
import {
  BACKUP_SETTINGS,
  createBackup,
  parseBackup,
  planRestore,
} from "../../core/scheduleBackup.js";
import {
  downloadBlob,
  exportTimetable,
  timetableFilename,
  exportAppearance,
} from "../../exportLogic/exportTimetable.js";

const button = (label, handler) => {
  const b = node("button", label);
  b.type = "button";
  b.addEventListener("click", handler);
  return b;
};
const select = (label, items, value) => {
  const wrap = node("label", label + " "),
    input = node("select");
  input.setAttribute("aria-label", label);
  items.forEach(([id, text]) => {
    const o = node("option", text);
    o.value = id;
    input.append(o);
  });
  input.value = value ?? items[0]?.[0] ?? "";
  wrap.append(input);
  return { wrap, input };
};
export function plannerDialog(ui, title) {
  const root = ui.root || document.body,
    previous = root.activeElement || document.activeElement;
  const dialog = node("dialog", null, "planner-dialog");
  dialog.setAttribute("aria-label", title);
  const header = node("div", null, "planner-dialog-header"),
    content = node("div", null, "planner-dialog-body");
  const status = node("p", null, "planner-status");
  status.setAttribute("role", "status");
  const observers = [],
    cleanup = [];
  const close = () => {
    observers.forEach((u) => u.scheduleResizeObserver?.disconnect());
    cleanup.forEach((f) => f());
    dialog.close?.();
    dialog.remove();
    previous?.focus?.();
  };
  header.append(node("h2", title), button("Close", close));
  dialog.append(header, status, content);
  root.append(dialog);
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute("open", "");
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [
        ...dialog.querySelectorAll(
          'button,input,select,summary,[tabindex="0"]',
        ),
      ].filter((n) => !n.disabled && !n.hidden && n.getClientRects().length),
      first = items[0],
      last = items.at(-1),
      active = root.activeElement || document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first?.focus();
    }
  });
  header.querySelector("button").focus();
  const run = (fn) => async () => {
    status.textContent = "";
    try {
      await fn();
    } catch (e) {
      status.textContent = e.message || "Action failed. Retry.";
    }
  };
  const preview = (host, courses, name, highlights = new Set()) => {
    const grid = node("div", null, "planner-preview-grid"),
      controls = node("div"),
      heading = node("div");
    host.append(controls, heading, grid);
    heading.className = "schedule-term-pill";
    const previewUi = {
      scheduleGrid: grid,
      scheduleControls: controls,
      scheduleTermPill: heading,
      scheduleName: name,
      highlightCourseIds: highlights,
    };
    observers.push(previewUi);
    renderSchedule(previewUi, courses, null, "am/pm");
    return previewUi;
  };
  return { dialog, content, status, run, close, preview, cleanup };
}

export function mountPlanner(ui, { getState, saveSchedules, onRestored }) {
  const toolbar = node("div", null, "planner-toolbar");
  ui.scheduleGrid.before(toolbar);
  const error = (e) =>
    ui.footerNotes?.showTemporary(e.message || "Action failed.", {
      tone: "warn",
      durationMs: 10000,
    });
  const safe = (fn) => () => Promise.resolve().then(fn).catch(error);
  toolbar.append(
    button(
      "Compare saved plans",
      safe(() => openComparison()),
    ),
    button(
      "Download PNG / PDF",
      safe(() => openExport()),
    ),
  );
  ui.exportMenu?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-planner-action]")?.dataset
      .plannerAction;
    if (!["backup", "restore"].includes(action)) return;
    ui.exportDropdown?.classList.remove("is-open");
    ui.exportButton?.setAttribute("aria-expanded", "false");
    safe(() => openBackup(action))();
  });

  function openComparison() {
    const plans = structuredClone(getState().savedSchedules);
    if (plans.length < 2)
      throw new Error("Save at least two schedules to compare.");
    const d = plannerDialog(ui, "Compare saved plans"),
      selectors = node("div", null, "planner-toolbar");
    const left = select(
        "Left plan",
        plans.map((s) => [s.id, s.name]),
        plans[0].id,
      ),
      right = select(
        "Right plan",
        plans.map((s) => [s.id, s.name]),
        plans[1].id,
      );
    selectors.append(left.wrap, right.wrap);
    const differences = node("section"),
      pair = node("div", null, "planner-comparison");
    d.content.append(selectors, differences, pair);
    let current = [];
    const draw = () => {
      current.forEach((u) => u.scheduleResizeObserver?.disconnect());
      current = [];
      pair.replaceChildren();
      differences.replaceChildren();
      const a = plans.find((s) => s.id === left.input.value),
        b = plans.find((s) => s.id === right.input.value),
        diff = compareSchedules(a.courses, b.courses);
      differences.append(
        node(
          "p",
          `Right compared with left: ${diff.added.length} added, ${diff.removed.length} removed, ${diff.moved.length} moved/changed section(s).`,
        ),
      );
      differences.append(
        node(
          "p",
          "Δ marks added, removed or changed sections relative to the other plan. ! marks a confirmed clash. Scroll each timetable to see all days.",
        ),
      );
      for (const [label, items] of [
        ["Added", diff.added],
        ["Removed", diff.removed],
      ])
        items.forEach((c) =>
          differences.append(node("p", `${label}: ${sectionLabel(c)}`)),
        );
      diff.moved.forEach(({ from, to }) =>
        differences.append(
          node("p", `Changed: ${sectionLabel(from)} → ${sectionLabel(to)}`),
        ),
      );
      for (const plan of [a, b]) {
        const col = node("section", null, "planner-comparison-column");
        col.append(node("h3", plan.name));
        col.append(
          button(
            "Set as Preferred",
            d.run(async () => {
              const latest = getState().savedSchedules;
              if (!latest.some((s) => s.id === plan.id))
                throw new Error("That plan was deleted. Reopen comparison.");
              await saveSchedules(
                latest.map((s) => ({ ...s, isFavorite: s.id === plan.id })),
              );
              d.status.textContent = `Preferred schedule: ${plan.name}`;
            }),
          ),
        );
        const changed =
          plan === a
            ? [...diff.removed, ...diff.moved.map((m) => m.from)]
            : [...diff.added, ...diff.moved.map((m) => m.to)];
        pair.append(col);
        current.push(
          d.preview(
            col,
            plan.courses,
            plan.name,
            new Set(changed.map(courseIdentity)),
          ),
        );
      }
      current.forEach(
        (p) =>
          (p.onScheduleWeekChange = (week) => {
            current.forEach((u, i) => {
              u.selectedScheduleWeek = week;
              renderSchedule(u, [a, b][i].courses, null, "am/pm");
            });
          }),
      );
    };
    left.input.onchange = right.input.onchange = draw;
    draw();
  }

  function openExport() {
    const d = plannerDialog(ui, "Download timetable"),
      orientation = select("Orientation", [
        ["landscape", "Landscape"],
        ["portrait", "Portrait"],
      ]);
    d.content.append(
      node(
        "p",
        "PNG downloads the timetable only. PDF includes the timetable and one page of course details.",
      ),
      orientation.wrap,
    );
    for (const format of ["png", "pdf"])
      d.content.append(
        button(
          `Download ${format.toUpperCase()}`,
          d.run(async () => {
            const state = getState(),
              target = ui.root.host || ui.mainPanel,
              appearance = exportAppearance(target);
            await exportTimetable(state.courses, format, {
              name: state.currentScheduleName || "Working Schedule",
              orientation: orientation.input.value,
              ...appearance,
              week: ui.selectedScheduleWeek || 1,
              timeFormat: state.view?.timeFormat || "am/pm",
            });
            d.status.textContent = `${format.toUpperCase()} download ready.`;
          }),
        ),
      );
  }

  function openBackup(action) {
    const d = plannerDialog(
      ui,
      action === "restore" ? "Restore schedules" : "Back up schedules",
    );
    d.content.append(
      node(
        "p",
        "Back up saved schedules and display preferences, or restore them from a JSON backup.",
      ),
    );
    if (action === "backup") {
      const selection = select("Export plans", [
        ["all", "All saved schedules"],
        ...getState().savedSchedules.map((s) => [s.id, s.name]),
      ]);
      d.content.append(
        selection.wrap,
        button(
          "Download JSON backup",
          d.run(async () => {
            const state = getState(),
              settings = await storageGet(BACKUP_SETTINGS),
              plans =
                selection.input.value === "all"
                  ? state.savedSchedules
                  : state.savedSchedules.filter(
                      (s) => s.id === selection.input.value,
                    );
            downloadBlob(
              new Blob(
                [JSON.stringify(createBackup(plans, settings), null, 2)],
                {
                  type: "application/json",
                },
              ),
              `${timetableFilename([], "Workday-backup")}.json`,
            );
            d.status.textContent =
              "Backup downloaded. Only saved plans are included; save working changes first.";
          }),
        ),
      );
      return;
    }
    const file = node("input");
    file.type = "file";
    file.accept = ".json,application/json";
    file.setAttribute("aria-label", "JSON backup file");
    const mode = select("Import mode", [
      ["merge", "Merge — keep existing plans and preferences"],
      ["replace", "Replace — replace saved plans and preferences"],
    ]);
    const preview = node("section");
    d.content.append(node("h3", "Import / restore"), file, mode.wrap, preview);
    let backup = null;
    const show = () => {
      preview.replaceChildren();
      if (!backup) return;
      const existing = getState().savedSchedules,
        next = planRestore(existing, backup, mode.input.value),
        signature = JSON.stringify(existing),
        selectedMode = mode.input.value;
      preview.append(
        node(
          "p",
          `File: ${backup.schedules.length} saved plan(s). After ${selectedMode}: ${next.schedules.length} plan(s). ${selectedMode === "replace" ? "Existing saved plans and these preferences will be replaced. Working courses and account data are preserved." : "Duplicate copies are skipped; conflicting names/IDs are imported separately. Existing preferences and preferred plan win."}`,
        ),
      );
      next.schedules.forEach((s) =>
        preview.append(
          node(
            "p",
            `${s.name}${s.isFavorite ? " (Preferred)" : ""} · ${s.courses.length} section(s)`,
          ),
        ),
      );
      preview.append(
        node(
          "p",
          `Non-sensitive settings: ${Object.keys(backup.settings).join(", ") || "none"}.`,
        ),
      );
      const confirm = node("input");
      confirm.type = "checkbox";
      const label = node(
        "label",
        selectedMode === "replace"
          ? " I confirm replacement of my saved plans and preferences."
          : " I confirm merging these saved plans.",
      );
      label.prepend(confirm);
      const apply = button(
        selectedMode === "replace" ? "Confirm Replace" : "Confirm Merge",
        d.run(async () => {
          if (!confirm.checked)
            throw new Error("Confirm the import preview first.");
          if (JSON.stringify(getState().savedSchedules) !== signature)
            throw new Error(
              "Saved plans changed. Change import mode to refresh the preview.",
            );
          const settings = await storageGet(BACKUP_SETTINGS);
          const defaults = {
            wdCourseColorAssignments: [1, 2, 3, 4, 5, 6, 7, 8],
            wdHoverTooltipsEnabled: true,
            wdTimeFormat: "am/pm",
          };
          const imported =
            selectedMode === "replace"
              ? { ...defaults, ...backup.settings }
              : { ...backup.settings, ...settings };
          await storageSet({
            ...imported,
            wdSavedSchedules: next.schedules,
            wdPreferredScheduleId:
              next.schedules.find((s) => s.isFavorite)?.id || null,
            wdScheduleSchemaVersion: 1,
          });
          await onRestored(next.schedules, imported);
          preview.replaceChildren();
          backup = null;
          d.status.textContent =
            "Restore complete. Saved plans refreshed. Reload Workday to apply restored display preferences.";
        }),
      );
      preview.append(label, apply);
    };
    file.onchange = d.run(async () => {
      backup = null;
      preview.replaceChildren();
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > 5 * 1024 * 1024)
        throw new Error("Backup file exceeds 5 MB.");
      backup = parseBackup(await selected.text());
      show();
    });
    mode.input.onchange = d.run(show);
  }
  return {};
}
