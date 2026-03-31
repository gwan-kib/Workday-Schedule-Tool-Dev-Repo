import { describe, expect, it } from "vitest";

import { buildIcsFile } from "../../src/domain/export/exportIcs";
import type { CourseData } from "../../src/lib/types";

describe("buildIcsFile", () => {
  it("creates recurring VEVENTs for course meeting lines", () => {
    const courses: CourseData[] = [
      {
        code: "CPSC 110",
        title: "Computation, Programs, and Programming",
        section_number: "101",
        instructor: "Gregor Kiczales",
        meeting: "Mon / Wed / Fri | 9:00 a.m. - 10:00 a.m.\nDMP (DMP)\nRoom: 110",
        instructionalFormat: "Lecture",
        meetingLines: [
          "2026-09-08 - 2026-12-01 | Mon Wed Fri | 9:00 a.m. - 10:00 a.m. | DMP (DMP) | Room 110",
        ],
      },
    ];

    const ics = buildIcsFile(courses);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:CPSC 110 - Computation\\, Programs\\, and Programming");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;");
  });
});
