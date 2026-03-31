import { $$ } from "../../lib/dom";

type HeaderMaps = {
  colMap?: Record<string, string | null>;
};

function getCellWorkdayKey(cell: Element): string | null {
  const inner = cell.querySelector('[id^="gen-dwr-comp-"]');
  const id = inner?.id || "";
  const match = id.match(/^gen-dwr-comp-(\d+\.\d+)-/);
  return match?.[1] ?? null;
}

export function createRowCellReader(rowEl: Element, headerMaps: HeaderMaps) {
  const colHeaderMap = headerMaps.colMap ?? {};
  const cellsInRow = $$(rowEl, "td, [role='gridcell']");
  const cellByCol = new Map<string, Element>();

  cellsInRow.forEach((cell) => {
    const key = getCellWorkdayKey(cell);
    if (key && !cellByCol.has(key)) cellByCol.set(key, cell);
  });

  const getCellByHeader = (keyName: string): Element | null => {
    const colKey = colHeaderMap[keyName];
    if (colKey == null) return null;
    return cellByCol.get(colKey) ?? null;
  };

  const readCellTextByHeader = (keyName: string): string => {
    const element = getCellByHeader(keyName);
    return (element instanceof HTMLElement ? element.innerText : element?.textContent || "").trim();
  };

  return {
    cellsInRow,
    cellByCol,
    getCellByHeader,
    readCellTextByHeader,
  };
}
