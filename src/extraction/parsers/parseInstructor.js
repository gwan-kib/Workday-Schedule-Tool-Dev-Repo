import { debugFor } from "../../utilities/debugTool.js";

const debug = debugFor("instructorInfo");

// Extracts instructor names from a cell. Input: element. Output: string.
export function extractInstructorNamesFromCell(instructorEl) {
  if (!instructorEl) {
    debug.log({ id: "extractInstructorNamesFromCell.missing" }, "");
    return "";
  }

  const prompt = instructorEl.querySelector('[data-automation-id="promptOption"]');
  const txt = (
    (prompt && (prompt.getAttribute("data-automation-label") || prompt.getAttribute("title") || prompt.textContent)) ||
    instructorEl.textContent ||
    ""
  ).trim();

  debug.log({ id: "extractInstructorNamesFromCell.result" }, "Extracted instructor text:", txt);

  return txt;
}
