// Synthetic courses and Workday JSON: no student/account data.
export const line = (days = "Mon Wed", time = "9:00 a.m. - 9:20 a.m.", range = "2026-09-01 - 2026-12-15") =>
  `${range} | ${days} | ${time} | Example Hall (EX) | Room: 101`;
export const course = (overrides = {}) => ({
  code: "TEST_O 101",
  section_number: "001",
  title: "Example course",
  instructor: "Example Instructor",
  instructionalFormat: "Lecture",
  meetingLines: [line()],
  ...overrides,
});
export const fiveCourses = () =>
  Array.from({ length: 5 }, (_, i) =>
    course({ code: `TEST_O ${101 + i}`, title: `Course ${i + 1}`, workdayCourseId: String(100 + i) }),
  );
export const workdayJson = {
  title: { instances: [{ text: "TEST_O 101 - 001 - Example course" }] },
  body: {
    children: [
      { children: [{ label: "Course", instances: [{ text: "TEST_O 101 - Example course" }] }] },
      {
        children: [
          { label: "Instructor Teaching", instances: [{ descriptor: "Example Instructor" }] },
          { label: "Instructional Formats", instances: [{ value: "Lecture" }] },
          {
            label: "Meeting Patterns",
            instances: [{ text: line() }, { text: line("Fri", "1:00 p.m. - 2:00 p.m.", "2027-01-01 - 2027-04-15") }],
          },
        ],
      },
    ],
  },
};
