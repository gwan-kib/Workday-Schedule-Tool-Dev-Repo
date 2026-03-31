import { $$ } from "../../lib/dom";
import { debugFor } from "../../lib/debug";

const debug = debugFor("grid");

type HeaderMap = {
  colMap: Record<string, string | null>;
  posMap: Record<string, number>;
};

export type WorkdayGridMatch = {
  root: Element;
  rows: Element[];
};

export function normalizeText(value: string): string {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getHeaderText(headerEl: Element | null): string {
  if (!headerEl) return "";

  const button = headerEl.querySelector("button[title]");
  if (button) return (button.getAttribute("title") || "").trim();
  return (headerEl.textContent || "").trim();
}

function getHeaderKey(el: Element): string | null {
  const automationId = el.getAttribute("data-automation-id") || "";
  const match = automationId.match(/^columnHeader(\d+\.\d+)$/);
  return match?.[1] ?? null;
}

export function buildHeaderMaps(gridRoot: Element): HeaderMap {
  const headerEls = Array.from(gridRoot.querySelectorAll('th[data-automation-id^="columnHeader"]'));
  const headers = headerEls
    .map((el, pos) => ({
      el,
      pos,
      key: getHeaderKey(el),
      text: getHeaderText(el),
      norm: normalizeText(getHeaderText(el)),
    }))
    .filter((header) => header.text);

  const findHeader = (needles: string[]) => {
    const normalizedNeedles = needles.map(normalizeText);
    return (
      headers.find((header) => normalizedNeedles.includes(header.norm)) ??
      headers.find((header) => normalizedNeedles.some((needle) => header.norm.includes(needle))) ??
      null
    );
  };

  const keys = {
    instructor: ["instructor", "instructors"],
    meeting: ["meeting patterns", "meeting pattern"],
    deliveryMode: ["delivery mode"],
    title: ["title", "course listing"],
    section: ["section"],
    instructionalFormat: ["instructional format"],
    startDate: ["start date", "start"],
  } satisfies Record<string, string[]>;

  const colMap: Record<string, string | null> = {};
  const posMap: Record<string, number> = {};

  Object.entries(keys).forEach(([key, needles]) => {
    const hit = findHeader(needles);
    colMap[key] = hit?.key ?? null;
    posMap[key] = hit?.pos ?? -1;
  });

  return { colMap, posMap };
}

const GRID_ROOT_SELECTOR = `
  table,
  [role="table"],
  [role="grid"],
  div[data-automation-id*="grid"],
  div[data-automation-id*="Grid"],
  div[data-automation-id="gridContainer"],
  div[data-automation-id="responsiveDataTable"],
  div[data-automation-id="tableContainer"]
`;

const GRID_HEADER_SELECTOR = `
  thead th,
  [role="columnheader"],
  div[data-automation-id*="columnHeader"],
  .wd-GridHeaderCell,
  .grid-column-header
`;

const GRID_ROW_SELECTOR = "tbody tr, [role='rowgroup'] [role='row'], .wd-GridRow, .grid-row";

function sameRows(leftRows: Element[], rightRows: Element[]): boolean {
  if (leftRows.length !== rightRows.length) return false;
  return leftRows.every((row, index) => row === rightRows[index]);
}

function getCandidateRoots(): Element[] {
  const uniqueRoots: Element[] = [];

  for (const root of $$(document, GRID_ROOT_SELECTOR)) {
    if (!(root instanceof Element)) continue;
    if (!uniqueRoots.includes(root)) uniqueRoots.push(root);
  }

  return uniqueRoots;
}

function scanRoot(root: Element): WorkdayGridMatch | null {
  const headerEls = $$(root, GRID_HEADER_SELECTOR);
  const headerText = headerEls.map((header) => normalizeText(getHeaderText(header)));

  const looksRight =
    headerText.some((text) => text.includes("section")) &&
    (headerText.some((text) => text.includes("instructor")) ||
      headerText.some((text) => text.includes("meeting")) ||
      headerText.some((text) => text.includes("instructional format")) ||
      headerText.some((text) => text.includes("format")) ||
      headerText.some((text) => text.includes("status")));

  if (!looksRight) return null;

  const rows = $$(root, GRID_ROW_SELECTOR);
  return rows.length ? { root, rows } : null;
}

export function findWorkdayGrids(): WorkdayGridMatch[] {
  const matches: WorkdayGridMatch[] = [];

  for (const root of getCandidateRoots()) {
    const match = scanRoot(root);
    if (!match) continue;
    if (!matches.some((existing) => sameRows(existing.rows, match.rows))) {
      matches.push(match);
    }
  }

  debug.log({ id: "grid.findWorkdayGrids" }, "Detected candidate schedule grids", {
    count: matches.length,
  });

  return matches;
}

export function findWorkdayGrid(): WorkdayGridMatch | null {
  return findWorkdayGrids()[0] ?? null;
}
