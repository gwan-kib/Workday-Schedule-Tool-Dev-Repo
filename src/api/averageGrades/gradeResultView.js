// Keep the primary statistic compact; the secondary average is available on hover/focus.
export function gradeResultText(result) {
  const format = (value) => (Number.isFinite(value) ? `${value.toFixed(1)}%` : "N/A");
  return {
    summary: `Average: ${format(result?.latest?.average)}`,
    tooltip: `5-year average: ${format(result?.fiveYear?.average)}${result?.stale ? " (cached)" : ""}`,
  };
}

export function renderGradeAverageHint(button, tooltip = "5-year average: N/A") {
  if (!button.parentElement) return;
  let control = button.parentElement;
  if (!control.classList.contains("grade-average-control")) {
    control = document.createElement("span");
    control.className = "grade-average-control";
    button.before(control);
    control.appendChild(button);
  }
  let hint = control.querySelector(".grade-average-hint");
  if (!hint) {
    hint = document.createElement("span");
    hint.className = "grade-average-hint wd-hover-tooltip";
    const icon = document.createElement("span");
    icon.className = "material-symbols-rounded";
    icon.textContent = "info";
    icon.setAttribute("aria-hidden", "true");
    hint.appendChild(icon);
    hint.tabIndex = 0;
    hint.setAttribute("role", "note");
    hint.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    control.appendChild(hint);
  }
  hint.dataset.tooltip = tooltip;
  hint.setAttribute("aria-label", tooltip);
}
