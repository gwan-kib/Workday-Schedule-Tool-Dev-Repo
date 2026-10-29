import { scheduleLayout } from "./scheduleLayout.js";
import {
  DAYS,
  normalizeSchedule,
  courseIdentity,
  meetingsOverlap,
} from "./meetings.js";

export const clock = (n) =>
  n == null
    ? "—"
    : `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const sectionLabel = (c) =>
  [c.code, c.section_number, c.instructionalFormat].filter(Boolean).join(" · ");
export function conflictDetails(courses) {
  const { meetings, diagnostics } = normalizeSchedule(courses);
  const conflicts = [],
    transitions = [];
  for (let i = 0; i < meetings.length; i++)
    for (let j = i + 1; j < meetings.length; j++) {
      const a = meetings[i],
        b = meetings[j];
      const dates = a.dates.filter((d) => b.dates.includes(d));
      if (!dates.length) continue;
      if (meetingsOverlap(a, b))
        conflicts.push({
          a,
          b,
          dates,
          start: Math.max(a.startMinutes, b.startMinutes),
          end: Math.min(a.endMinutes, b.endMinutes),
        });
      else {
        const first = a.endMinutes <= b.startMinutes ? a : b,
          second = first === a ? b : a;
        const minutes = second.startMinutes - first.endMinutes;
        if (minutes >= 0 && minutes < 15)
          transitions.push({ a: first, b: second, dates, minutes });
      }
    }
  return { conflicts, transitions, diagnostics };
}

// A representative, uninterrupted teaching week. Holidays and the partial
// first/last weeks do not reduce scheduled hours. Keep the same Week 1/2
// recurrence selection as the timetable and combine split-date records there.
export function scheduleStatistics(courses) {
  const uninterrupted = courses.map((course) => ({
    ...course,
    meetingExceptions: [],
  }));
  const fullDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const weeks = [1, 2].map((week) => {
    const layout = scheduleLayout(uninterrupted, week);
    const patterns = new Map();
    for (const meeting of layout.meetings) {
      for (const day of meeting.days) {
        const key = JSON.stringify([meeting.courseId, day, meeting.startMinutes, meeting.endMinutes]);
        patterns.set(key, { day, minutes: meeting.endMinutes - meeting.startMinutes });
      }
    }
    const byDay = DAYS.map(day => [...patterns.values()]
      .filter(pattern => pattern.day === day)
      .reduce((sum, pattern) => sum + pattern.minutes, 0));
    const busiest = Math.max(0, ...byDay);
    return {
      week,
      hours: Math.round(byDay.reduce((sum, minutes) => sum + minutes, 0) / 60),
      busiestDay: busiest ? fullDays[byDay.indexOf(busiest)] : "—",
    };
  });
  return { weeks };
}

export function compareSchedules(left, right) {
  const signature = (c) =>
    JSON.stringify({
      lines: c.meetingLines,
      anchors: c.meetingAnchors,
      exceptions: c.meetingExceptions,
      format: c.instructionalFormat,
    });
  const a = new Map(left.map((c) => [courseIdentity(c), c])),
    b = new Map(right.map((c) => [courseIdentity(c), c]));
  const removed = left.filter((c) => !b.has(courseIdentity(c))),
    added = right.filter((c) => !a.has(courseIdentity(c)));
  const moved = left
    .filter(
      (c) =>
        b.has(courseIdentity(c)) &&
        signature(c) !== signature(b.get(courseIdentity(c))),
    )
    .map((c) => ({ from: c, to: b.get(courseIdentity(c)) }));
  // A new section for the same code/component is a section change, not an unrelated course.
  const key = (c) =>
    `${String(c.code).replace(/\s/g, "").toUpperCase()}|${c.instructionalFormat || ""}`;
  for (const from of [...removed]) {
    const to = added.find((c) => key(c) === key(from));
    if (to) {
      moved.push({ from, to });
      removed.splice(removed.indexOf(from), 1);
      added.splice(added.indexOf(to), 1);
    }
  }
  return { added, removed, moved };
}

// Interval partitioning uses transitive overlap groups, so 3+ classes remain visible.
export function eventLanes(events) {
  const result = new Map();
  let group = [],
    end = -1;
  const finish = () => {
    const laneEnds = [];
    for (const ev of group) {
      let lane = laneEnds.findIndex((n) => n <= ev.startMinutes);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = ev.endMinutes;
      result.set(ev.id, { lane, count: 0 });
    }
    group.forEach((ev) => (result.get(ev.id).count = laneEnds.length));
  };
  for (const ev of [...events].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  )) {
    if (ev.startMinutes >= end && group.length) {
      finish();
      group = [];
      end = -1;
    }
    group.push(ev);
    end = Math.max(end, ev.endMinutes);
  }
  finish();
  return result;
}

export function conflictText(c) {
  const days = [
    ...new Set(
      c.dates.map(
        (d) => DAYS[(new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7],
      ),
    ),
  ].join(", ");
  return `Clash: ${sectionLabel(c.a.course)} / ${sectionLabel(c.b.course)} — ${days} ${clock(c.start)}–${clock(c.end)}; ${c.dates.length} shared date(s), ${c.dates[0]} to ${c.dates.at(-1)}`;
}
