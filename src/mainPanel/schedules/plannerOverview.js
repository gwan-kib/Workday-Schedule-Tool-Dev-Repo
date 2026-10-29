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
  for (const [label, key] of [
    ["Scheduled hours/week", "hours"],
    ["Busiest day", "busiestDay"],
  ]) {
    const pair = node("div");
    const values = node("dd");
    if (weeks[0][key] === weeks[1][key]) {
      values.append(node("span", String(weeks[0][key]), "planner-metric-value"));
    } else {
      values.className = "planner-week-values";
      weeks.forEach((week, index) => {
        const value = node("span", null, "planner-week-value");
        value.append(node("span", `Week ${index + 1}: `, "planner-week-label"), node("strong", String(week[key])));
        if (index) values.append(node("span", " · ", "planner-week-separator"));
        values.append(value);
      });
    }
    pair.append(node("dt", label), values);
    grid.append(pair);
  }
  box.append(grid);
  host.append(box);
}
