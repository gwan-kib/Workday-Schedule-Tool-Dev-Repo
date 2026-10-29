import { renderSchedule } from "./scheduleView.js";
import { node } from "./plannerOverview.js";
import { compareSchedules, sectionLabel } from "../../core/planner.js";
import { courseIdentity } from "../../core/meetings.js";
import { storageGet } from "../../utilities/storage.js";
import {
  BACKUP_SETTINGS,
  createBackup,
  parseWstSchedule,
  planScheduleImport,
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
    if (previous?.isConnected) previous.focus?.();
    else
      (ui.savedDropdown?.querySelector("summary") || ui.exportButton)?.focus();
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
          'button,input,textarea,select,summary,[tabindex="0"]',
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

export function mountPlanner(ui, { getState, saveSchedules }) {
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
    if (!["backup", "import"].includes(action)) return;
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
      action === "import" ? "Import WST schedule" : "Back up schedules",
    );
    d.content.append(
      node(
        "p",
        "Back up saved schedules, or import a file containing one WST schedule.",
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
              plans.length === 1
                ? `${timetableFilename(plans[0].courses, plans[0].name)}.wst.json`
                : "WST-schedules-backup.json",
            );
            d.status.textContent =
              "Backup downloaded. To import one schedule later, export that schedule individually. Save working changes before backing up.";
          }),
        ),
      );
      return;
    }
    const file = node("input");
    file.type = "file";
    file.accept = ".json,.wst,application/json";
    file.multiple = false;
    file.setAttribute("aria-label", "WST schedule file");
    d.content.append(
      node(
        "p",
        "Choose one schedule file. It will be added to your saved schedules with its original name; if needed, (1), (2), and so on will be added.",
      ),
      file,
    );
    file.onchange = d.run(async () => {
      if (!file.files?.length) return;
      if (file.files.length !== 1)
        throw new Error("Choose one WST schedule file at a time.");
      const selected = file.files[0];
      file.disabled = true;
      try {
        if (selected.size > 5 * 1024 * 1024)
          throw new Error("Schedule file exceeds 5 MB.");
        const incoming = parseWstSchedule(await selected.text());
        const result = planScheduleImport(getState().savedSchedules, incoming);
        await saveSchedules(result.schedules);
        d.status.textContent = `Imported "${result.imported.name}" into saved schedules.`;
      } finally {
        file.disabled = false;
        file.value = "";
      }
    });
  }

  return {};
}
