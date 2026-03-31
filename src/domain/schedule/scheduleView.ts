import { debugFor } from "../../lib/debug";
import type { CourseData, ScheduleEvent, ScheduleRenderUi, SemesterKey, TimeFormat } from "../../lib/types";
import { extractStartDate } from "../extraction/parsers/meetingPatternsInfo";
import { detectScheduleConflicts } from "./scheduleCollisions";

const debug = debugFor("scheduleView");

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const START_HOUR = 8;
const END_HOUR = 21;
const SLOT_MINUTES = 30;
const DAY_REGEX = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g;
const TIME_REGEX = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/gi;

const SLOTS: number[] = [];
for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
  SLOTS.push(hour * 60);
  SLOTS.push(hour * 60 + 30);
}
SLOTS.push(END_HOUR * 60);

const TERM_WINDOWS: Record<
  SemesterKey,
  { label: string; startMonth: number; startDay: number; endMonth: number; endDay: number }
> = {
  winter1: { label: "Winter Session - Term 1", startMonth: 9, startDay: 1, endMonth: 12, endDay: 31 },
  winter2: { label: "Winter Session - Term 2", startMonth: 1, startDay: 1, endMonth: 4, endDay: 30 },
  summer1: { label: "Summer Session - Term 1", startMonth: 5, startDay: 1, endMonth: 6, endDay: 30 },
  summer2: { label: "Summer Session - Term 2", startMonth: 7, startDay: 1, endMonth: 8, endDay: 31 },
};

function normalizeConflictToken(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseTimeToken(token: string): number | null {
  const match = String(token || "")
    .trim()
    .match(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i);
  if (!match) return null;

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const period = match[3].toLowerCase();

  if (period === "p" && hours !== 12) hours += 12;
  if (period === "a" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function parseMeetingLine(line: string) {
  const days = String(line || "").match(DAY_REGEX) || [];
  const timeTokens = String(line || "").match(TIME_REGEX) || [];

  if (!days.length || timeTokens.length < 2) return null;

  const startMinutes = parseTimeToken(timeTokens[0] || "");
  const endMinutes = parseTimeToken(timeTokens[1] || "");
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;

  return {
    days: [...new Set(days)],
    startMinutes,
    endMinutes,
  };
}

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getSemesterForRange(startDate: string, endDate: string): SemesterKey | null {
  const courseStart = parseDateValue(startDate);
  const courseEnd = parseDateValue(endDate || startDate);
  if (!courseStart || !courseEnd) return null;

  const startYear = courseStart.getFullYear();
  const endYear = courseEnd.getFullYear();

  for (let year = startYear - 1; year <= endYear + 1; year += 1) {
    for (const [termKey, term] of Object.entries(TERM_WINDOWS) as Array<
      [SemesterKey, (typeof TERM_WINDOWS)[SemesterKey]]
    >) {
      const termStart = new Date(year, term.startMonth - 1, term.startDay);
      const termEnd = new Date(year, term.endMonth - 1, term.endDay);
      const overlaps = courseStart <= termEnd && courseEnd >= termStart;
      if (overlaps) return termKey;
    }
  }

  return null;
}

function clampToGrid(minutes: number): number {
  return Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, minutes));
}

function snapDownToSlot(minutes: number): number {
  return Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function snapUpToSlot(minutes: number): number {
  return Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function slotIndexOf(minutes: number): number {
  return SLOTS.indexOf(minutes);
}

function buildDayEvents(courses: CourseData[], semester: SemesterKey | null): Map<string, ScheduleEvent[]> {
  const eventsByDay = new Map<string, ScheduleEvent[]>();
  DAYS.forEach((day) => eventsByDay.set(day, []));

  const seen = new Set<string>();
  let eventId = 0;

  courses.forEach((course, courseIndex) => {
    const colorIndex = course.colorIndex || (courseIndex % 7) + 1;
    const startDate = course.startDate || extractStartDate(course.meetingLines?.[0] || "") || "";
    const endDate = course.endDate || startDate || "";
    const courseSemester = getSemesterForRange(startDate, endDate);
    if (semester && courseSemester !== semester) return;

    const label = course.isLab ? "[LAB]" : course.isSeminar ? "[SEM]" : course.isDiscussion ? "[DISC]" : "";
    const eventType = course.isLab
      ? "lab"
      : course.isSeminar
        ? "seminar"
        : course.isDiscussion
          ? "discussion"
          : "";

    (course.meetingLines || []).forEach((line) => {
      const parsed = parseMeetingLine(line);
      if (!parsed) return;

      const startMin = snapDownToSlot(clampToGrid(parsed.startMinutes));
      const endMin = snapUpToSlot(clampToGrid(parsed.endMinutes));

      const startIdx = slotIndexOf(startMin);
      const endIdx = slotIndexOf(endMin);
      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return;

      const rowSpan = endIdx - startIdx;

      parsed.days.forEach((day) => {
        if (!eventsByDay.has(day)) return;

        const key = [
          day,
          course.code || "",
          course.title || "",
          parsed.startMinutes,
          parsed.endMinutes,
          startIdx,
          rowSpan,
        ].join("|");
        if (seen.has(key)) return;
        seen.add(key);

        eventsByDay.get(day)?.push({
          id: eventId++,
          colorIndex,
          eventType,
          code: course.code || "",
          title: course.title || "",
          label,
          startMinutes: parsed.startMinutes,
          endMinutes: parsed.endMinutes,
          rowStart: startIdx,
          rowSpan,
          startIdx,
          endIdx,
        });
      });
    });
  });

  DAYS.forEach((day) => {
    eventsByDay.get(day)?.sort((left, right) => left.startIdx - right.startIdx || left.endIdx - right.endIdx);
  });

  return eventsByDay;
}

function formatTimeLabel(minutes: number, timeFormat: TimeFormat): string {
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

function formatTimeRange(startMinutes: number, endMinutes: number, timeFormat: TimeFormat): string {
  return `${formatTimeLabel(startMinutes, timeFormat)} - ${formatTimeLabel(endMinutes, timeFormat)}`;
}

function buildScheduleTable(timeFormat: TimeFormat): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "schedule-table-wrap";

  const table = document.createElement("table");
  table.className = "schedule-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  headRow.innerHTML = `
    <th class="schedule-time">
      <button class="schedule-time-toggle wd-hover-tooltip" type="button" aria-label="Time format" data-tooltip="Time format">
        ${timeFormat === "am/pm" ? "AM/PM" : "24H"}
      </button>
    </th>
    ${DAYS.map((day) => `<th class="schedule-day-head" data-day="${day}">${day}</th>`).join("")}
  `;

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (let rowIndex = 0; rowIndex < SLOTS.length; rowIndex += 1) {
    const row = document.createElement("tr");

    const timeCell = document.createElement("td");
    timeCell.className = "schedule-time";
    timeCell.textContent = formatTimeLabel(SLOTS[rowIndex], timeFormat);
    row.appendChild(timeCell);

    DAYS.forEach((day) => {
      const cell = document.createElement("td");
      cell.className = "schedule-cell";
      cell.dataset.day = day;
      cell.dataset.row = String(rowIndex);

      const inner = document.createElement("div");
      inner.className = "schedule-cell-inner";
      cell.appendChild(inner);
      row.appendChild(cell);
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

function renderOverlayBlocks(
  wrap: HTMLDivElement,
  eventsByDay: Map<string, ScheduleEvent[]>,
  conflictBlocks: Array<{ day: string; rowStart: number; rowSpan: number; codes: string[] }>,
  timeFormat: TimeFormat,
): void {
  const overlay = wrap.querySelector<HTMLDivElement>(".schedule-overlay");
  if (!overlay) return;

  overlay.innerHTML = "";

  const table = wrap.querySelector<HTMLTableElement>(".schedule-table");
  const firstBodyRow = table?.querySelector("tbody tr");
  const firstDayCell = table?.querySelector<HTMLTableCellElement>(
    'tbody tr td.schedule-cell[data-day="Mon"]',
  );
  const timeHeader = table?.querySelector<HTMLTableCellElement>("thead th.schedule-time");
  if (!table || !firstBodyRow || !firstDayCell || !timeHeader) return;

  const timeColWidth = timeHeader.getBoundingClientRect().width;
  const dayColWidth = firstDayCell.getBoundingClientRect().width;
  const headerHeight = table.querySelector("thead")?.getBoundingClientRect().height || 0;
  const rowHeight = firstBodyRow.getBoundingClientRect().height;

  const cellStyles = getComputedStyle(firstDayCell);
  const borderLeft = parseFloat(cellStyles.borderLeftWidth) || 0;
  const borderTop = parseFloat(cellStyles.borderTopWidth) || 0;
  const borderRight = parseFloat(cellStyles.borderRightWidth) || 0;
  const borderBottom = parseFloat(cellStyles.borderBottomWidth) || 0;

  const borderX = (borderLeft + borderRight) / 2;
  const borderY = (borderTop + borderBottom) / 2;

  DAYS.forEach((day, dayIndex) => {
    const events = eventsByDay.get(day) || [];

    events.forEach((event) => {
      const left = timeColWidth + dayIndex * dayColWidth;
      const top = headerHeight + event.rowStart * rowHeight;
      const height = event.rowSpan * rowHeight;

      const block = document.createElement("div");
      const colorClass = event.colorIndex ? ` schedule-entry--color-${event.colorIndex}` : "";
      const subClass =
        event.eventType === "lab" || event.eventType === "seminar" || event.eventType === "discussion"
          ? " schedule-entry--sub"
          : "";

      block.className = `schedule-entry-float${colorClass}${subClass}`;
      block.style.left = `${left + borderLeft}px`;
      block.style.top = `${top + borderTop}px`;
      block.style.width = `${dayColWidth - borderX - 0.1}px`;
      block.style.height = `${height - borderY}px`;

      const overlapLayer = document.createElement("div");
      overlapLayer.className = "schedule-entry-overlap-layer";
      block.appendChild(overlapLayer);

      const text = document.createElement("div");
      text.className = "schedule-entry-text";
      const codeMatch = String(event.code || "").match(/^([A-Z_]+)\s*(\d+)$/);
      const formattedCode = codeMatch ? `${codeMatch[1]} ${codeMatch[2]}` : event.code || "";
      const title = formattedCode || event.title;
      const titleLabel = event.label ? `${title} ${event.label}` : title;

      text.innerHTML = `
        <div class="schedule-entry-title">${titleLabel}</div>
        <div class="schedule-entry-time">${formatTimeRange(event.startMinutes, event.endMinutes, timeFormat)}</div>
      `;

      block.appendChild(text);
      overlay.appendChild(block);
    });
  });

  conflictBlocks.forEach((conflict) => {
    const dayIndex = DAYS.indexOf(conflict.day);
    if (dayIndex === -1) return;

    const left = timeColWidth + dayIndex * dayColWidth;
    const top = headerHeight + conflict.rowStart * rowHeight;
    const height = conflict.rowSpan * rowHeight;
    if (height <= 0) return;

    const block = document.createElement("div");
    block.className = "schedule-conflict-float wd-hover-tooltip";
    block.style.left = `${left + borderLeft}px`;
    block.style.top = `${top + borderTop}px`;
    block.style.width = `${dayColWidth - borderX}px`;
    block.style.height = `${height - borderY}px`;

    const symbol = document.createElement("div");
    symbol.className = "schedule-conflict-symbol";
    symbol.textContent = "!";
    block.appendChild(symbol);

    if (conflict.codes.length) {
      const tooltipText = `Classes in conflict:\n[${conflict.codes.join(", ")}]`;
      block.dataset.tooltip = tooltipText;
      block.setAttribute("aria-label", tooltipText);
      block.tabIndex = 0;
    }

    overlay.appendChild(block);
  });
}

function buildConflictPartnerLookup(conflictBlocks: Array<{ codes: string[] }>): Map<string, string[]> {
  const partnersByCode = new Map<string, Map<string, string>>();

  conflictBlocks.forEach((block) => {
    const uniqueCodes = block.codes
      .map((rawCode) => ({
        normalized: normalizeConflictToken(rawCode),
        label: String(rawCode || "").trim(),
      }))
      .filter((item) => item.normalized);

    uniqueCodes.forEach(({ normalized: codeKey }, i) => {
      if (!partnersByCode.has(codeKey)) partnersByCode.set(codeKey, new Map());
      const partnerMap = partnersByCode.get(codeKey)!;

      uniqueCodes.forEach(({ normalized: otherKey, label: otherLabel }, j) => {
        if (i === j) return;
        if (!partnerMap.has(otherKey)) partnerMap.set(otherKey, otherLabel);
      });
    });
  });

  const lookup = new Map<string, string[]>();
  partnersByCode.forEach((partnerMap, codeKey) => {
    lookup.set(
      codeKey,
      Array.from(partnerMap.values()).sort((left, right) =>
        normalizeConflictToken(left).localeCompare(normalizeConflictToken(right)),
      ),
    );
  });

  return lookup;
}

function updateFooterConflictMessage(ui: ScheduleRenderUi, conflictCodes: string[]): void {
  const alertEl = ui.footerAlert || ui.root?.querySelector("#schedule-conflict-alert") || null;
  if (!(alertEl instanceof HTMLElement)) return;

  if (!conflictCodes.length) {
    alertEl.textContent = "";
    alertEl.classList.add("is-hidden");
    return;
  }

  alertEl.textContent = `! The following classes are in conflict: [${conflictCodes.join(", ")}].`;
  alertEl.classList.remove("is-hidden");
}

function getActiveSemester(courses: CourseData[]): SemesterKey | null {
  const counts: Partial<Record<SemesterKey, number>> = {};

  courses.forEach((course) => {
    const startDate = course.startDate || extractStartDate(course.meetingLines?.[0] || "") || "";
    const endDate = course.endDate || startDate || "";
    const semester = getSemesterForRange(startDate, endDate);
    if (!semester) return;
    counts[semester] = (counts[semester] || 0) + 1;
  });

  let bestSemester: SemesterKey | null = null;
  let bestCount = 0;

  (Object.entries(counts) as Array<[SemesterKey, number]>).forEach(([semester, count]) => {
    if (count > bestCount) {
      bestSemester = semester;
      bestCount = count;
    }
  });

  return bestSemester;
}

export function renderSchedule(
  ui: ScheduleRenderUi,
  courses: CourseData[],
  semester: SemesterKey | null,
  timeFormat: TimeFormat = "24h",
): void {
  const host =
    ui.scheduleGrid || ui.schedulePanel || ui.scheduleContainer || ui.scheduleView || ui.schedule || null;

  if (!host) {
    debug.warn({ id: "scheduleView.missingHost" }, "Unable to render schedule without a host element");
    return;
  }

  const activeSemester = semester || getActiveSemester(courses);
  const eventsByDay = buildDayEvents(courses, activeSemester);
  const allEventsByDay = buildDayEvents(courses, null);
  const { conflictBlocks } = detectScheduleConflicts(eventsByDay);
  const { conflictBlocks: allConflictBlocks, conflictCodes } = detectScheduleConflicts(allEventsByDay);

  ui.conflictPartnersByCode = buildConflictPartnerLookup(allConflictBlocks);

  host.innerHTML = "";
  const tableWrap = buildScheduleTable(timeFormat);
  host.appendChild(tableWrap);

  renderOverlayBlocks(tableWrap, eventsByDay, conflictBlocks, timeFormat);
  updateFooterConflictMessage(ui, conflictCodes);

  ui.activeSemester = activeSemester;

  const semesterLabel = activeSemester ? TERM_WINDOWS[activeSemester].label : "Term Not Found";
  if (ui.scheduleTermPill) ui.scheduleTermPill.textContent = semesterLabel;
}
