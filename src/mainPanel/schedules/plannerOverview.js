import {
  scheduleStatistics,
  clock,
  sectionLabel,
  conflictDetails,
  conflictText,
} from "../../core/planner.js";
import { courseIdentity } from "../../core/meetings.js";
export function node(tag, text, className = "") {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (className) el.className = className;
  return el;
}
export function renderPlannerOverview(host, courses) {
  const stats = scheduleStatistics(courses),
    box = node("details", null, "planner-overview");
  box.append(
    node(
      "summary",
      `Schedule overview · ${stats.hours.average.toFixed(1)} hours/week · ${stats.conflicts} conflicting pair(s)`,
    ),
  );
  const grid = node("dl", null, "planner-metrics");
  const range = (s) =>
    `${s.average.toFixed(1)} average (${s.min.toFixed(1)}–${s.max.toFixed(1)})`;
  const metrics = [
    ["Scheduled hours/week", range(stats.hours)],
    ["Gaps, hours/week", range(stats.gapHours)],
    ["Campus days/week", range(stats.campusDays)],
    ["Days off/week (of 7)", range(stats.daysOff)],
    [
      "Earliest start / latest end",
      `${clock(stats.earliest)} / ${clock(stats.latest)}`,
    ],
    [
      "Busiest dated day",
      stats.busiest
        ? `${stats.busiest.day} ${stats.busiest.date}: ${(stats.busiest.minutes / 60).toFixed(1)} hours`
        : "—",
    ],
  ];
  metrics.forEach(([label, value]) => {
    const pair = node("div");
    pair.append(node("dt", label), node("dd", value));
    grid.append(pair);
  });
  box.append(
    grid,
    node(
      "p",
      `Computed from ${stats.weeks} Monday-based teaching week(s) in the supplied date ranges, including partial first/last weeks. Contact hours count each class, including overlaps. Gaps count empty time between scheduled meetings on the same actual day. Campus days require a physical location and exclude online classes. Days off have no timed meetings. Alternating weeks and exceptions use actual dates; unknown meetings are excluded. This is not a registration or workload score.`,
      "planner-note",
    ),
  );
  host.append(box);
}
export function renderConflictDetails(host, courses, onRevealCourse) {
  const { conflicts, transitions, diagnostics } = conflictDetails(courses);
  if (!conflicts.length && !transitions.length && !diagnostics.length) return;
  const box = node("details", null, "planner-conflicts");
  box.append(
    node(
      "summary",
      `Conflicts and transitions · ${conflicts.length} clash(es) · ${transitions.length} close transition(s) · ${diagnostics.length} uncertain`,
    ),
  );
  const list = node("ul");
  conflicts.forEach((c) => {
    const row = node("li");
    row.append(node("p", conflictText(c)));
    const dates = node("details");
    dates.append(
      node("summary", "All affected dates"),
      node("p", c.dates.join(", ")),
    );
    row.append(dates);
    for (const m of [c.a, c.b])
      if (onRevealCourse) {
        const b = node("button", `Show ${sectionLabel(m.course)}`);
        b.type = "button";
        b.onclick = () => onRevealCourse(m.course);
        row.append(b);
      }
    list.append(row);
  });
  transitions.forEach((t) =>
    list.append(
      node(
        "li",
        `Close transition, not a clash: ${sectionLabel(t.a.course)} → ${sectionLabel(t.b.course)}, ${t.minutes} minutes; first shared date ${t.dates[0]}. Check travel time.`,
      ),
    ),
  );
  diagnostics.forEach((d) => {
    const c = courses.find((c) => courseIdentity(c) === d.courseId);
    list.append(
      node(
        "li",
        `Unknown/uncertain: ${c ? sectionLabel(c) : "Meeting"} — ${d.message}`,
      ),
    );
  });
  box.append(list);
  host.append(box);
}
