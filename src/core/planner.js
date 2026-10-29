import {
  DAYS,
  normalizeSchedule,
  dateNumber,
  courseIdentity,
  meetingsOverlap,
} from "./meetings.js";

export const clock = (n) =>
  n == null
    ? "—"
    : `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const sectionLabel = (c) =>
  [c.code, c.section_number, c.instructionalFormat].filter(Boolean).join(" · ");
const monday = (n) => n - ((new Date(n * 86400000).getUTCDay() + 6) % 7);
const online = (m) =>
  m.course.isOnline ||
  /\b(online|remote|virtual|asynchronous)\b/i.test(
    [m.course.deliveryMode, m.course.meeting, m.location].join(" "),
  );

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

// Each Monday-based week touched by a supplied teaching range is counted once.
// Contact time adds meeting durations; overlapping classes count individually.
export function scheduleStatistics(courses) {
  const { meetings, diagnostics } = normalizeSchedule(courses);
  const weeks = new Map(),
    dates = new Map();
  for (const m of meetings) {
    for (
      let n = monday(dateNumber(m.startDate));
      n <= dateNumber(m.endDate);
      n += 7
    )
      if (!weeks.has(n))
        weeks.set(n, {
          minutes: 0,
          gaps: 0,
          days: new Set(),
          campus: new Set(),
        });
    for (const date of m.dates) {
      if (!dates.has(date)) dates.set(date, []);
      dates.get(date).push(m);
      const w = weeks.get(monday(dateNumber(date)));
      w.minutes += m.endMinutes - m.startMinutes;
      w.days.add(date);
      if (
        !online(m) &&
        m.location &&
        !/no location|tba|unknown/i.test(m.location)
      )
        w.campus.add(date);
    }
  }
  let busiest = null;
  for (const [date, entries] of dates) {
    const sorted = [...entries].sort((a, b) => a.startMinutes - b.startMinutes);
    let end = sorted[0].endMinutes,
      gaps = 0,
      minutes = 0;
    for (const m of sorted) {
      gaps += Math.max(0, m.startMinutes - end);
      end = Math.max(end, m.endMinutes);
      minutes += m.endMinutes - m.startMinutes;
    }
    weeks.get(monday(dateNumber(date))).gaps += gaps;
    if (!busiest || minutes > busiest.minutes)
      busiest = {
        date,
        minutes,
        day: DAYS[(new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7],
      };
  }
  const values = [...weeks.values()];
  const summary = (fn) => {
    const nums = values.map(fn);
    return {
      average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
      min: nums.length ? Math.min(...nums) : 0,
      max: nums.length ? Math.max(...nums) : 0,
    };
  };
  return {
    weeks: weeks.size,
    hours: summary((w) => w.minutes / 60),
    gapHours: summary((w) => w.gaps / 60),
    campusDays: summary((w) => w.campus.size),
    daysOff: summary((w) => 7 - w.days.size),
    busiest,
    earliest: meetings.length
      ? Math.min(...meetings.map((m) => m.startMinutes))
      : null,
    latest: meetings.length
      ? Math.max(...meetings.map((m) => m.endMinutes))
      : null,
    conflicts: conflictDetails(courses).conflicts.length,
    diagnostics,
  };
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

export function previewSwap(courses, original, replacement) {
  const index = courses.findIndex(
    (c) => courseIdentity(c) === courseIdentity(original),
  );
  if (index < 0)
    throw new Error(
      "This section is no longer in the working schedule. Reopen alternatives.",
    );
  if (
    courses.some(
      (c, i) =>
        i !== index && courseIdentity(c) === courseIdentity(replacement),
    )
  )
    throw new Error("That section is already in the schedule.");
  const next = structuredClone(courses);
  next[index] = {
    ...structuredClone(replacement),
    colorIndex: original.colorIndex,
    manualColorIndex: original.manualColorIndex,
  };
  const warnings = [
    "Lecture/lab/tutorial pairing requirements cannot be verified. Other components remain unchanged; check Workday before registering.",
  ];
  if (
    String(original.code).replace(/\s/g, "") !==
    String(replacement.code).replace(/\s/g, "")
  )
    warnings.push(
      "Different or cross-listed course code. Verify that this is the intended alternative.",
    );
  if (original.instructionalFormat !== replacement.instructionalFormat)
    warnings.push("Component type differs from the original section.");
  const before = normalizeSchedule([original]).meetings,
    after = normalizeSchedule([replacement]);
  if (after.diagnostics.length)
    warnings.push(
      "Some meeting times or recurrence are unknown; the preview is incomplete.",
    );
  if (
    before.some(
      (a) =>
        !after.meetings.some(
          (b) => a.startDate === b.startDate && a.endDate === b.endDate,
        ),
    )
  )
    warnings.push("Term/date coverage differs from the original section.");
  return { courses: next, warnings, ...conflictDetails(next) };
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
