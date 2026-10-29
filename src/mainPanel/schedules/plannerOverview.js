import { scheduleStatistics } from "../../core/planner.js";
export function node(tag, text, className = "") {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (className) el.className = className;
  return el;
}
export function renderPlannerOverview(host, courses) {
  const { weeks } = scheduleStatistics(courses);
  const box = node("details", null, "planner-overview");
  box.append(node("summary", "Schedule overview"));
  const grid = node("dl", null, "planner-metrics");
  const value = (key) =>
    weeks[0][key] === weeks[1][key]
      ? String(weeks[0][key])
      : `Week 1: ${weeks[0][key]} · Week 2: ${weeks[1][key]}`;
  for (const [label, key] of [
    ["Scheduled hours/week", "hours"],
    ["Busiest day", "busiestDay"],
  ]) {
    const pair = node("div");
    pair.append(node("dt", label), node("dd", value(key)));
    grid.append(pair);
  }
  box.append(grid);
  host.append(box);
}
