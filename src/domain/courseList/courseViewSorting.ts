import type { CourseData, SortState, SortableKey } from "../../lib/types";

export const SORTABLE_KEYS = new Set<SortableKey>(["title", "meeting", "instructionalFormat"]);

export function filterCourses(courses: CourseData[], query: string): CourseData[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...courses];

  const keys: Array<keyof CourseData> = ["title", "meeting", "instructionalFormat", "code", "instructor"];
  return courses.filter((course) =>
    keys.some((key) =>
      String(course[key] || "")
        .toLowerCase()
        .includes(normalizedQuery),
    ),
  );
}

export function sortCourses(courses: CourseData[], key: SortableKey, previousSort: SortState): SortState {
  if (!SORTABLE_KEYS.has(key)) return previousSort;

  const dir: 1 | -1 = previousSort.key === key ? (previousSort.dir === 1 ? -1 : 1) : 1;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  courses.sort((left, right) => dir * collator.compare(left[key] || "", right[key] || ""));

  return { key, dir };
}

export function applyFilterAndSort(courses: CourseData[], query: string, sortState: SortState): CourseData[] {
  const filtered = filterCourses(courses, query);
  if (!sortState.key) return filtered;

  const next = [...filtered];
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  next.sort(
    (left, right) =>
      sortState.dir * collator.compare(left[sortState.key!] || "", right[sortState.key!] || ""),
  );
  return next;
}
