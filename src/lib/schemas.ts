import { z } from "zod";

export const courseDataSchema = z.object({
  code: z.string().default(""),
  title: z.string().default(""),
  section_number: z.string().default(""),
  instructor: z.string().default(""),
  meeting: z.string().default(""),
  instructionalFormat: z.string().default(""),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  meetingLines: z.array(z.string()).default([]),
  isLab: z.boolean().optional(),
  isSeminar: z.boolean().optional(),
  isDiscussion: z.boolean().optional(),
  colorIndex: z.number().int().min(1).max(7).optional(),
});

export const savedScheduleSchema = z.object({
  id: z.string(),
  name: z.string().default("Untitled"),
  savedAt: z.string(),
  courses: z.array(courseDataSchema).default([]),
  colorAssignments: z.array(z.number().int().min(1).max(7)).nullable().default(null),
  isFavorite: z.boolean().default(false),
});

export type CourseDataInput = z.input<typeof courseDataSchema>;
export type SavedScheduleInput = z.input<typeof savedScheduleSchema>;
