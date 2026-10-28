import { STATE } from "../core/state.js";
import { normalizeSchedule, zonedInstant, utcStamp } from "../core/meetings.js";

export const escapeIcsText = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

// Fold by UTF-8 octets, preserving whole Unicode code points. A continuation's
// leading space also counts toward its 75-octet budget.
export function foldIcsLine(line) {
  const encoder = new TextEncoder();
  let out = "",
    length = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (length + bytes > 75) {
      out += "\r\n ";
      length = 1;
    }
    out += ch;
    length += bytes;
  }
  return out;
}
const prop = (name, value) => `${name}:${escapeIcsText(value)}`;

export function buildICSFile(courses, { now = new Date() } = {}) {
  const { meetings } = normalizeSchedule(courses);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Workday Schedule Tool//EN", "CALSCALE:GREGORIAN"];
  for (const m of meetings) {
    const c = m.course;
    lines.push(
      "BEGIN:VEVENT",
      prop("UID", `${m.id}@workday-schedule-tool`),
      `DTSTAMP:${utcStamp(now)}`,
      prop("SUMMARY", [c.code, c.title, c.section_number].filter(Boolean).join(" - ")),
      prop("DESCRIPTION", [c.instructor, c.instructionalFormat].filter(Boolean).join("\n")),
      prop("LOCATION", m.location),
      `DTSTART:${utcStamp(zonedInstant(m.dates[0], m.startMinutes, m.timeZone))}`,
      `DTEND:${utcStamp(zonedInstant(m.dates[0], m.endMinutes, m.timeZone))}`,
    );
    // Explicit dates retain Vancouver wall time across DST without relying on a
    // consumer's local zone, and express alternate weeks/exceptions exactly.
    if (m.dates.length > 1)
      lines.push(`RDATE:${m.dates.map((d) => utcStamp(zonedInstant(d, m.startMinutes, m.timeZone))).join(",")}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function exportICS(scheduleName) {
  const normalized = normalizeSchedule(STATE.courses);
  if (!normalized.meetings.length) throw new Error("No validated timed meetings to export. See Meeting Times Unknown.");
  const blob = new Blob([buildICSFile(STATE.courses)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `[WST] ${String(scheduleName || "Schedule").replace(/[\\/:*?"<>|]/g, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
  return { exported: normalized.meetings.length, skipped: normalized.diagnostics.length };
}
