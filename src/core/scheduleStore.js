import { courseIdentity, normalizeSchedule } from "./meetings.js";

export function selectVisibleCourses(state) {
  const query = String(state.query || "")
    .trim()
    .toLowerCase();
  const courses = state.courses.filter(
    (c) =>
      !query ||
      ["title", "meeting", "instructionalFormat", "code", "instructor"].some((k) =>
        String(c[k] || "")
          .toLowerCase()
          .includes(query),
      ),
  );
  if (state.sort.key) {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    courses.sort((a, b) => state.sort.dir * collator.compare(a[state.sort.key] || "", b[state.sort.key] || ""));
  }
  return courses;
}

// This controller owns canonical data; renderers receive derived arrays.
export function createScheduleStore(state) {
  const refresh = () => {
    state.filtered = selectVisibleCourses(state);
  };
  return {
    load(courses) {
      state.courses = structuredClone(courses);
      refresh();
    },
    add(course) {
      if (state.courses.some((c) => courseIdentity(c) === courseIdentity(course))) return false;
      state.courses = [...state.courses, structuredClone(course)];
      refresh();
      return true;
    },
    remove(course) {
      state.courses = state.courses.filter((c) => courseIdentity(c) !== courseIdentity(course));
      refresh();
    },
    filter(query) {
      state.query = query;
      refresh();
    },
    sort(key) {
      state.sort =
        state.sort.key !== key ? { key, dir: 1 } : state.sort.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 };
      refresh();
    },
    snapshot() {
      return structuredClone(state.courses);
    },
    export() {
      return normalizeSchedule(state.courses);
    },
    compare(courses) {
      const a = new Set(state.courses.map(courseIdentity)),
        b = new Set(courses.map(courseIdentity));
      return { added: [...b].filter((id) => !a.has(id)), removed: [...a].filter((id) => !b.has(id)) };
    },
  };
}
