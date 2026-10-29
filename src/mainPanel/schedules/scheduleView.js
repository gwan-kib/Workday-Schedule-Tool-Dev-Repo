import { renderPlannerOverview, renderConflictDetails } from "./plannerOverview.js";
import { eventLanes } from "../../core/planner.js";
import { courseIdentity } from "../../core/meetings.js";
import { renderScheduleHeading } from "./scheduleHeading.js";
import { scheduleLayout } from "../../core/scheduleLayout.js";
import { debugFor, debugLog } from "../../utilities/debugTool.js";
import { createFooterNoteController } from "../shell/footerNoteController.js";
import { detectScheduleConflicts } from "./scheduleCollisions.js";
const debug = debugFor("scheduleView");
debugLog({ local: { scheduleView: false } });
const CONFLICT_FOOTER_NOTE_ID = "schedule-conflicts";
const normalizeConflictToken = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
// Formats a time label for a slot. Input: minutes number. Output: string.
function formatTimeLabel(minutes, timeFormat) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (timeFormat === "am/pm") {
    const period = h24 >= 12 ? "PM" : "AM";
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }
  return `${String(h24)}:${String(m).padStart(2, "0")}`;
}
function formatTimeRange(startMinutes, endMinutes, timeFormat) {
  return `${formatTimeLabel(startMinutes, timeFormat)} - ${formatTimeLabel(endMinutes, timeFormat)}`;
}
// Builds the base schedule table DOM. Input: none. Output: wrapper element.
function buildScheduleTable(timeFormat, layout) {
  const { days: DAYS, slots: SLOTS } = layout;
  const wrap = document.createElement("div");
  wrap.className = "schedule-table-wrap";
  const table = document.createElement("table");
  table.className = "schedule-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.innerHTML = `
    <th class="schedule-time">
      <button class="schedule-time-toggle wd-hover-tooltip" type="button" data-tooltip="Time format">
        ${timeFormat === "am/pm" ? "AM/PM" : "24H"}
      </button>
    </th>
    ${DAYS.map((day) => `<th class="schedule-day-head" data-day="${day}">${day}</th>`).join("")}
  `;
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (let r = 0; r < SLOTS.length; r++) {
    const row = document.createElement("tr");
    const timeTd = document.createElement("td");
    timeTd.className = "schedule-time";
    timeTd.textContent = formatTimeLabel(SLOTS[r], timeFormat);
    row.appendChild(timeTd);
    DAYS.forEach((day) => {
      const td = document.createElement("td");
      td.className = "schedule-cell";
      td.dataset.day = day;
      td.dataset.row = String(r);
      const inner = document.createElement("div");
      inner.className = "schedule-cell-inner";
      td.appendChild(inner);
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  const overlay = document.createElement("div");
  overlay.className = "schedule-overlay";
  wrap.appendChild(overlay);
  return wrap;
}
// Renders overlay blocks for events. Input: wrapper element, events-by-day Map. Output: none.
function renderOverlayBlocks(wrap, eventsByDay, conflictBlocks = [], timeFormat = "24h", changedIds = new Set()) {
  const DAYS = Array.from(eventsByDay.keys());
  const overlay = wrap.querySelector(".schedule-overlay");
  overlay.innerHTML = "";
  const table = wrap.querySelector(".schedule-table");
  const firstBodyRow = table.querySelector("tbody tr");
  const firstDayCell = table.querySelector('tbody tr td.schedule-cell[data-day="Mon"]');
  const timeTh = table.querySelector("thead th.schedule-time");
  if (!firstBodyRow || !firstDayCell || !timeTh) return;
  const timeColWidth = timeTh.getBoundingClientRect().width;
  const dayColWidth = firstDayCell.getBoundingClientRect().width;
  const headerHeight = table.querySelector("thead").getBoundingClientRect().height;
  const rowHeight = firstBodyRow.getBoundingClientRect().height;
  const cellStyles = getComputedStyle(firstDayCell);
  const borderLeft = parseFloat(cellStyles.borderLeftWidth) || 0;
  const borderTop = parseFloat(cellStyles.borderTopWidth) || 0;
  const borderRight = parseFloat(cellStyles.borderRightWidth) || 0;
  const borderBottom = parseFloat(cellStyles.borderBottomWidth) || 0;
  const borderX = (borderLeft + borderRight) / 2.0;
  const borderY = (borderTop + borderBottom) / 2.0;
  DAYS.forEach((day, dayIndex) => {
    const events = eventsByDay.get(day) || [];
    const lanes = eventLanes(events);
    events.forEach((ev) => {
      const { lane, count } = lanes.get(ev.id);
      const left = timeColWidth + dayIndex * dayColWidth + lane * dayColWidth / count;
      const top = headerHeight + ev.rowStart * rowHeight;
      const height = ev.rowSpan * rowHeight;
      const block = document.createElement("div");
      const colorClass = ev.colorIndex ? ` schedule-entry--color-${ev.colorIndex}` : "";
      const subClass =
        ev.eventType === "lab" ||
        ev.eventType === "seminar" ||
        ev.eventType === "discussion" ||
        ev.eventType === "experiential"
          ? " schedule-entry--sub"
          : "";
      block.className = `schedule-entry-float${colorClass}${subClass}`;
      block.style.left = `${left + borderLeft}px`;
      block.style.top = `${top + borderTop}px`;
      block.style.width = `${dayColWidth / count - borderX - 1}px`;
      block.style.height = `${height - borderY}px`;
      const overlapLayer = document.createElement("div");
      overlapLayer.className = "schedule-entry-overlap-layer";
      block.appendChild(overlapLayer);
      const text = document.createElement("div");
      text.className = "schedule-entry-text";
      const codeMatch = String(ev.code || "").match(/^([A-Z_]+)\s*(\d+)$/);
      const formattedCode = codeMatch ? `${codeMatch[1]} ${codeMatch[2]}` : ev.code || "";
      const title = formattedCode || ev.title;
      const titleLabel = [title, ev.course?.section_number, ev.label].filter(Boolean).join(" ");
      const isChanged = changedIds.has(courseIdentity(ev.course));
      block.classList.toggle('is-changed', isChanged);
      const isConflict = conflictBlocks.some(c => c.eventIds?.includes(ev.id));
      block.classList.toggle("has-conflict", isConflict);
      block.tabIndex = 0;
      const description = `${isChanged ? "Changed section: " : ""}${isConflict ? "Clash: " : ""}${titleLabel}; ${ev.title}; ${formatTimeRange(ev.startMinutes, ev.endMinutes, timeFormat)}; ${ev.location}; ${ev.dates[0]} to ${ev.dates.at(-1)}`;
      block.setAttribute("aria-label", description);
      block.title = description;
      const timeLabel = formatTimeRange(ev.startMinutes, ev.endMinutes, timeFormat);
      const titleNode = document.createElement("div");
      titleNode.className = "schedule-entry-title";
      titleNode.textContent = (isChanged ? "Δ " : "") + (isConflict ? "! " : "") + titleLabel;
      const timeNode = document.createElement("div");
      timeNode.className = "schedule-entry-time";
      timeNode.textContent = timeLabel;
      text.append(titleNode, timeNode);
      block.appendChild(text);
      overlay.appendChild(block);
    });
  });
}

function buildConflictPartnerLookup(conflictBlocks = []) {
  const partnersByCode = new Map();
  (conflictBlocks || []).forEach((block) => {
    const uniqueCodes = [];
    const seen = new Set();
    (block?.baseCodes || block?.codes || []).forEach((rawCode) => {
      const label = String(rawCode || "").trim();
      const normalized = normalizeConflictToken(label);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      uniqueCodes.push({ normalized, label });
    });
    uniqueCodes.forEach(({ normalized: codeKey }, i) => {
      if (!partnersByCode.has(codeKey)) partnersByCode.set(codeKey, new Map());
      const partnerMap = partnersByCode.get(codeKey);
      uniqueCodes.forEach(({ normalized: otherKey, label: otherLabel }, j) => {
        if (i === j) return;
        if (!partnerMap.has(otherKey)) partnerMap.set(otherKey, otherLabel);
      });
    });
  });
  const lookup = new Map();
  partnersByCode.forEach((partnerMap, codeKey) => {
    const partners = Array.from(partnerMap.values()).sort((a, b) =>
      normalizeConflictToken(a).localeCompare(normalizeConflictToken(b)),
    );
    lookup.set(codeKey, partners);
  });
  return lookup;
}
function buildFooterConflictGroups(conflictBlocks = []) {
  const groups = new Map();
  (Array.isArray(conflictBlocks) ? conflictBlocks : []).forEach((block) => {
    const labels = (Array.isArray(block?.codes) ? block.codes : [])
      .map((code) => String(code || "").trim())
      .filter(Boolean);
    if (!labels.length) return;
    const sortedLabels = [...labels].sort((a, b) => normalizeConflictToken(a).localeCompare(normalizeConflictToken(b)));
    const groupKey = sortedLabels.map(normalizeConflictToken).join("|");
    if (!groups.has(groupKey)) groups.set(groupKey, sortedLabels);
  });
  return Array.from(groups.values());
}
function getFooterNoteController(ui) {
  if (ui?.footerNotes) return ui.footerNotes;
  const root = ui?.footerAlert || ui?.root?.querySelector("#schedule-footer-notes");
  if (!root) return null;
  ui.footerNotes = createFooterNoteController(root);
  return ui.footerNotes;
}
function updateFooterConflictMessage(ui, conflictBlocks) {
  const footerNotes = getFooterNoteController(ui);
  const conflictGroups = buildFooterConflictGroups(conflictBlocks).map((group) => group.join(" & "));
  const codes = conflictGroups.length ? [conflictGroups.join("), (")] : [];
  if (!codes.length) {
    footerNotes?.removePersistent(CONFLICT_FOOTER_NOTE_ID);
    return;
  }
  footerNotes?.setPersistent(
    CONFLICT_FOOTER_NOTE_ID,
    `🚩 The following classes are in conflict: (${codes.join(", ")})`,
    { tone: "warn" },
  );
}
// All view/export/conflict consumers share the same normalized meeting data.
export function renderSchedule(ui, courses = [], semester, timeFormat = "24h") {
  const host = ui?.scheduleGrid;
  if (!host) return;
  const layout = scheduleLayout(courses, ui.selectedScheduleWeek || 1);
  const { conflictBlocks } = detectScheduleConflicts(layout.eventsByDay);
  const all = scheduleLayout(courses);
  const allConflicts = detectScheduleConflicts(all.eventsByDay).conflictBlocks;
  ui.conflictPartnersByCode = buildConflictPartnerLookup(allConflicts);
  host.replaceChildren();
  const weekControls = document.createElement("div");
  weekControls.className = "schedule-week-controls";
  const weekToggle = document.createElement("div");
  weekToggle.className = "schedule-week-toggle";
  weekToggle.setAttribute("role", "group");
  weekToggle.setAttribute("aria-label", "Alternating teaching week");
  for (const week of [1, 2]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Week ${week}`;
    button.dataset.week = String(week);
    button.setAttribute("aria-pressed", String(layout.selectedWeek === week));
    button.addEventListener("click", () => {
      if (ui.onScheduleWeekChange) { ui.onScheduleWeekChange(week); return; }
      ui.selectedScheduleWeek = week;
      renderSchedule(ui, courses, null, ui.scheduleTimeFormat || timeFormat);
    });
    weekToggle.appendChild(button);
  }
  const controls = ui.scheduleControls || ui.scheduleTermPill?.closest(".schedule-controls");
  controls?.querySelector(".schedule-week-controls")?.remove();
  const weekNote = document.createElement("p");
  weekNote.className = "schedule-week-note";
  weekNote.textContent = "(Incase course sections are biweekly)";
  weekControls.append(weekToggle, weekNote);
  (controls || host).appendChild(weekControls);
  renderPlannerOverview(host, courses);
  renderConflictDetails(host, courses, ui.onRevealCourse);
  const tableWrap = buildScheduleTable(timeFormat, layout);
  const maxConcurrent = Math.max(1, ...[...layout.eventsByDay.values()].flatMap(events => [...eventLanes(events).values()].map(l => l.count)));
  const tableWidth = `${Math.max(660, 64 + layout.days.length * 100 * maxConcurrent)}px`;
  tableWrap.querySelector('table').style.minWidth = tableWidth;
  tableWrap.querySelector('table').style.width = tableWidth;
  host.appendChild(tableWrap);
  const draw = () => renderOverlayBlocks(tableWrap, layout.eventsByDay, conflictBlocks, timeFormat, ui.highlightCourseIds);
  draw();
  ui.scheduleResizeObserver?.disconnect();
  if (typeof ResizeObserver !== "undefined") {
    ui.scheduleResizeObserver = new ResizeObserver(draw);
    ui.scheduleResizeObserver.observe(tableWrap);
  }
  if (layout.unknownCourses.length) {
    const unknown = document.createElement("section");
    unknown.className = "schedule-unknown";
    const heading = document.createElement("h3");
    heading.textContent = "Meeting Times Unknown";
    unknown.appendChild(heading);
    layout.unknownCourses.forEach((c) => {
      const row = document.createElement("p");
      row.textContent = [c.code, c.section_number, c.title].filter(Boolean).join(" – ");
      unknown.appendChild(row);
    });
    host.appendChild(unknown);
  }
  const footer = getFooterNoteController(ui);
  if (layout.diagnostics.length)
    footer?.setPersistent(
      "meeting-diagnostics",
      `${layout.diagnostics.length} meeting(s) have missing, invalid or uncertain data. See Meeting Times Unknown; these meetings cannot be exported.`,
      { tone: "warn" },
    );
  else footer?.removePersistent("meeting-diagnostics");
  updateFooterConflictMessage(ui, conflictBlocks);
  renderScheduleHeading(ui.scheduleTermPill, ui.scheduleName, courses);
  ui.scheduleTimeFormat = timeFormat;
  tableWrap.querySelector(".schedule-time-toggle")?.addEventListener("click", () => {
    const next = timeFormat === "am/pm" ? "24h" : "am/pm";
    ui.onTimeFormatChange?.(next);
    renderSchedule(ui, courses, null, next);
  });
}
