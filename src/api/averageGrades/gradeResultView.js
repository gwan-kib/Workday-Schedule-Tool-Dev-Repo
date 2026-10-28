import { courseStatisticsLabel } from "./courseStatistics.js";

export function gradeResultText(result) {
  const lines = courseStatisticsLabel(result).split("\n");
  return {
    summary: lines.filter((line) => /^(Latest year|5-year window)/.test(line)).join("\n"),
    details: lines.filter((line) => !/^(Latest year|5-year window)/.test(line)).join(" · "),
  };
}
export function renderGradeDetails(button, { details, source } = {}) {
  const host = button.closest(".course-card") || button.parentElement;
  if (!host) return;
  let note = host.querySelector(".grade-result-details");
  if (!details) {
    note?.remove();
    return;
  }
  if (!note) {
    note = document.createElement("p");
    note.className = "grade-result-details";
    host.appendChild(note);
  }
  note.textContent = details + " ";
  if (source?.startsWith("https://ubcgrades.com/#")) {
    const link = document.createElement("a");
    link.href = source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View UBCGrades source";
    link.addEventListener("click", (event) => event.stopPropagation());
    note.appendChild(link);
  }
}
