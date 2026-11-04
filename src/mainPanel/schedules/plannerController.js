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
  const wrap = node("label", null, "planner-field"),
    input = node("select");
  wrap.append(node("span", label, "planner-field-label"));
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
export function plannerDialog(ui, title, variant = "") {
  const root = ui.root || document.body,
    previous = root.activeElement || document.activeElement;
  const dialog = node("dialog", null, "planner-dialog");
  if (variant) dialog.classList.add(`planner-dialog--${variant}`);
  dialog.setAttribute("aria-label", title);
  const header = node("div", null, "planner-dialog-header"),
    content = node("div", null, "planner-dialog-body"),
    actions = node("div", null, "planner-dialog-actions");
  const status = node("p", null, "planner-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const setStatus = (message, tone = "success") => {
    status.dataset.tone = tone;
    status.textContent = message;
  };
  const observers = [],
    cleanup = [];
  const close = () => {
    observers.forEach((u) => u.scheduleResizeObserver?.disconnect());
    cleanup.forEach((f) => f());
    dialog.close?.();
    dialog.remove();
    if (previous?.isConnected && !previous.closest?.("details:not([open])")) previous.focus?.();
    else
      (ui.savedDropdown?.querySelector("summary") || ui.exportButton)?.focus();
  };
  header.append(node("h2", title), button("Close", close));
  dialog.append(header, content, status, actions);
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
  const run = (fn) => async (event) => {
    const trigger = event?.currentTarget;
    if (trigger?.getAttribute("aria-busy") === "true") return;
    const isButton = trigger?.tagName === "BUTTON";
    if (isButton) { trigger.disabled = true; trigger.setAttribute("aria-busy", "true"); }
    setStatus("", "info");
    try {
      await fn();
    } catch (e) {
      setStatus(e.message || "Action failed. Retry.", "error");
    } finally {
      if (isButton) { trigger.disabled = false; trigger.removeAttribute("aria-busy"); }
    }
  };
  const preview = (host, courses, name, highlights = new Set(), week = 1) => {
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
      selectedScheduleWeek: week,
    };
    observers.push(previewUi);
    renderSchedule(previewUi, courses, null, "am/pm");
    return previewUi;
  };
  return { dialog, content, actions, status, setStatus, run, close, preview, cleanup };
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
    const d = plannerDialog(ui, "Compare saved plans", "comparison"),
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
    const swapSides = button("Swap sides", () => {
      [left.input.value, right.input.value] = [right.input.value, left.input.value];
      draw();
    });
    selectors.append(left.wrap, right.wrap, swapSides);
    const differences = node("section", null, "planner-differences"),
      pair = node("div", null, "planner-comparison");
    d.content.append(selectors, differences, pair);
    let current = [], selectedWeek = ui.selectedScheduleWeek || 1;
    const draw = () => {
      current.forEach((u) => u.scheduleResizeObserver?.disconnect());
      current = [];
      pair.replaceChildren();
      differences.replaceChildren();
      const a = plans.find((s) => s.id === left.input.value),
        b = plans.find((s) => s.id === right.input.value),
        diff = compareSchedules(a.courses, b.courses);
      for (const [field, other] of [[left.input, b.id], [right.input, a.id]])
        [...field.options].forEach((option) => { option.disabled = option.value === other; });
      const counts = node("div", null, "planner-difference-counts");
      for (const [count, label] of [[diff.added.length, "added"], [diff.removed.length, "removed"], [diff.moved.length, "changed"]])
        counts.append(node("span", `${count} ${label}`, "planner-difference-chip"));
      counts.setAttribute("aria-label", "Right plan compared with left plan");
      differences.append(counts);
      differences.append(
        node(
          "p",
          "Right compared with left. Δ marks differences; ! marks a confirmed clash. Each timetable scrolls independently.",
          "planner-hint",
        ),
      );
      const changes = node("details", null, "planner-change-list");
      changes.append(node("summary", "View changed sections"));
      for (const [label, items] of [
        ["Added", diff.added],
        ["Removed", diff.removed],
      ])
        items.forEach((c) =>
          changes.append(node("p", `${label}: ${sectionLabel(c)}`)),
        );
      diff.moved.forEach(({ from, to }) =>
        changes.append(
          node("p", `Changed: ${sectionLabel(from)} → ${sectionLabel(to)}`),
        ),
      );
      if (diff.added.length + diff.removed.length + diff.moved.length) differences.append(changes);
      else differences.append(node("p", "These plans have the same sections and meeting times.", "planner-hint"));
      for (const plan of [a, b]) {
        const col = node("section", null, "planner-comparison-column");
        const cardHeader = node("div", null, "planner-comparison-heading");
        cardHeader.append(node("h3", plan.name));
        const preferred = button(
            "Set as Preferred",
            d.run(async () => {
              const latest = getState().savedSchedules;
              if (!latest.some((s) => s.id === plan.id))
                throw new Error("That plan was deleted. Reopen comparison.");
              await saveSchedules(
                latest.map((s) => ({ ...s, isFavorite: s.id === plan.id })),
              );
              plans.forEach((p) => { p.isFavorite = p.id === plan.id; });
              draw();
              d.setStatus(`Preferred schedule: ${plan.name}`);
              pair.querySelector('[aria-pressed="true"]')?.focus();
            }),
          );
        preferred.setAttribute("aria-pressed", String(Boolean(plan.isFavorite)));
        preferred.className = "planner-preferred-button";
        if (plan.isFavorite) preferred.textContent = "Preferred schedule";
        cardHeader.append(preferred);
        col.append(cardHeader);
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
            selectedWeek,
          ),
        );
      }
      current.forEach(
        (p) =>
          (p.onScheduleWeekChange = (week) => {
            selectedWeek = week;
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
    const downloads = node("div", null, "planner-downloads");
    d.content.append(downloads);
    for (const format of ["png", "pdf"])
      downloads.append(
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
            d.setStatus(`${format.toUpperCase()} download ready.`);
          }),
        ),
      );
  }

  function openBackup(action) {
    const d = plannerDialog(
      ui,
      action === "import" ? "Import WST schedule" : "Back up schedules",
    );
    if (action === "backup") {
      d.content.append(node("p", "Choose a saved schedule to share or import later. An all-schedules backup keeps a copy of every saved plan.", "planner-hint"));
      const selection = select("Export plans", [
        ["all", "All saved schedules"],
        ...getState().savedSchedules.map((s) => [s.id, s.name]),
      ]);
      d.content.append(selection.wrap);
      const download =
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
            d.setStatus(plans.length === 1 ? "Schedule file downloaded. It can be imported with Import WST schedule." : "Backup downloaded. To import one schedule later, export that schedule individually.");
          }),
        );
      download.className = "planner-primary";
      download.disabled = !getState().savedSchedules.length;
      d.actions.append(download);
      d.content.append(node("p", getState().savedSchedules.length ? "Only saved changes are included. Quick Save your working schedule first." : "No saved schedules yet. Save a schedule before creating a backup.", "planner-hint"));
      return;
    }
    const file = node("input");
    file.type = "file";
    file.accept = ".json,.wst,application/json";
    file.multiple = false;
    file.setAttribute("aria-label", "WST schedule file");
    const fileLabel = node("label", null, "planner-import-file planner-field");
    fileLabel.append(node("span", "Choose a schedule file", "planner-field-label"), file);
    const slots = node("p", `${getState().savedSchedules.length} of 10 saved schedules used · One file, one schedule · Up to 5 MB`, "planner-hint");
    d.content.append(
      node(
        "p",
        "Choose one schedule file. It will be added to your saved schedules with its original name; if needed, (1), (2), and so on will be added.",
      ),
      fileLabel,
      slots,
    );
    if (getState().savedSchedules.length >= 10) d.setStatus("You can save up to 10 schedules. Remove one before importing another.", "error");
    file.onchange = d.run(async () => {
      if (!file.files?.length) return;
      if (file.files.length !== 1)
        throw new Error("Choose one WST schedule file at a time.");
      const selected = file.files[0];
      file.disabled = true;
      d.setStatus("Importing schedule…", "info");
      file.setAttribute("aria-busy", "true");
      try {
        if (selected.size > 5 * 1024 * 1024)
          throw new Error("Schedule file exceeds 5 MB.");
        let incoming;
        try { incoming = parseWstSchedule(await selected.text()); }
        catch (error) { throw new Error(`${error.message.replace(/^Invalid backup:/, "Invalid schedule file:")} Choose a single WST schedule file exported from this extension.`); }
        const result = planScheduleImport(getState().savedSchedules, incoming);
        await saveSchedules(result.schedules);
        d.setStatus(`Imported "${result.imported.name}" into saved schedules.${result.imported.name !== incoming.name ? " The name was adjusted because a schedule with that name already exists." : ""}`);
        slots.textContent = `${result.schedules.length} of 10 saved schedules used · One file, one schedule · Up to 5 MB`;
      } finally {
        file.disabled = false;
        file.removeAttribute("aria-busy");
        file.value = "";
      }
    });
  }

  return {};
}
