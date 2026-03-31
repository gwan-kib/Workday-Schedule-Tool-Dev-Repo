import { debugFor } from "../../../lib/debug";

const debug = debugFor("sectionLinkInfo");

export function parseSectionLinkString(input: string): {
  code: string;
  section_number: string;
  title: string;
  full: string;
} | null {
  let normalized = String(input || "")
    .replace(/\u00A0/g, " ")
    .trim();
  if (!normalized) return null;

  normalized = normalized.replace(/\s*\n\s*/g, " ").trim();

  const match = normalized.match(/^\s*([A-Z][A-Z0-9_]*\s*\d{3}[A-Z]?)\s*-\s*(.+?)\s*$/);
  if (!match) {
    debug.log({ id: "sectionLinkInfo.noMatch" }, "String did not match expected pattern", normalized);
    return null;
  }

  const baseCode = match[1].trim();
  const rest = match[2].trim();
  const parts = rest
    .split(/\s*[-–—]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  const sectionToken = parts[0] ?? "";
  const parsedTitle = parts
    .slice(1)
    .join(" - ")
    .trim()
    .replace(/\s*:\s*/g, ":\n");

  return {
    code: baseCode,
    section_number: sectionToken,
    title: parsedTitle,
    full: normalized,
  };
}
