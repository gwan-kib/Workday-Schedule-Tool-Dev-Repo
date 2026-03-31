import { debugFor } from "../../../lib/debug";

const debug = debugFor("meetingPatternsInfo");

const DATE_RE = /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/;
const TIME_RE = /\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\b/i;
const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;

function formatDayPart(dayPartRaw: string): string {
  const tokens = String(dayPartRaw || "").match(/\([^)]*\)|\S+/g) || [];

  return tokens
    .map((token) => {
      const trimmed = token.trim();
      return /^\(\s*alternate\s+weeks\s*\)$/i.test(trimmed) ? "(Alternate Weeks)" : trimmed;
    })
    .filter(Boolean)
    .reduce((formatted, token) => {
      if (!formatted) return token;
      return token.startsWith("(") ? `${formatted} ${token}` : `${formatted} / ${token}`;
    }, "");
}

export function extractMeetingLines(containerEl: Element | null): string[] {
  if (!containerEl) return [];

  const items = Array.from(containerEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]'));
  const lines = items.map((el) => (el.getAttribute("aria-label") || "").trim()).filter(Boolean);
  const filtered = lines.filter((line) => DATE_RE.test(line) && TIME_RE.test(line) && DAY_RE.test(line));

  debug.log({ id: "meetingPatternsInfo.extractMeetingLines" }, "Extracted meeting lines", filtered);
  return filtered;
}

export function isOnlineDelivery(deliveryModeCellEl: Element | null): boolean {
  if (!deliveryModeCellEl) return false;

  const text = (deliveryModeCellEl.textContent || "").trim();
  if (/online learning/i.test(text)) return true;

  const prompts = Array.from(deliveryModeCellEl.querySelectorAll('[data-automation-id="promptOption"]'));
  return prompts.some((el) => {
    const label =
      el.getAttribute("data-automation-label") || el.getAttribute("title") || el.textContent || "";
    return /online learning/i.test(label);
  });
}

export function formatMeetingLineForPanel(line: string): { days: string; time: string; location: string } {
  const raw = String(line || "");
  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const dayPartRaw = parts.find((part) => /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(part)) || "";
  const timePart = parts.find((part) => /\d{1,2}:\d{2}/.test(part) && /-/.test(part)) || "";
  const buildingPart = parts.find((part) => /\([A-Z]{2,}\)/.test(part)) || "";

  const floorMatch = raw.match(/\bfloor\b\s*[:-]?\s*(-?[A-Za-z0-9]+)/i);
  const roomMatch = raw.match(/\b(room|rm)\b\s*[:-]?\s*([A-Za-z0-9]+)/i);

  return {
    days: formatDayPart(dayPartRaw),
    time: timePart,
    location: [
      buildingPart,
      [floorMatch ? `Floor: ${floorMatch[1]}` : "", roomMatch ? `Room: ${roomMatch[2]}` : ""]
        .filter(Boolean)
        .join(" | "),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function normalizeMeetingPatternsText(text: string): string {
  return String(text || "")
    .split(/\r?\n(.*)/s)
    .slice(0, 2)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function extractStartDate(line: string): string {
  const match = String(line || "").match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match?.[1] ?? "";
}
