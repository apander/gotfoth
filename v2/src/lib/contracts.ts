import { z } from "zod";
export const Mode = z.enum(["guided", "independent", "timed", "mock"]);
export type Mode = z.infer<typeof Mode>;
export const Resource = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  fileId: z.string().optional(),
  pages: z.array(z.number().int().positive()).default([]),
});
export const Question = z.object({
  id: z.string(),
  number: z.string(),
  text: z.string().min(1),
  marks: z.number().int().positive(),
  format: z.enum(["essay", "short", "number", "table", "unsupported"]),
  section: z.string(),
  choiceGroup: z.string().optional(),
  option: z.enum(["health", "criminological"]).optional(),
  resourceIds: z.array(z.string()).default([]),
  topics: z.array(z.string()).min(1),
  topicAllocations: z
    .record(z.string(), z.number().int().positive())
    .optional(),
  command: z.string().default(""),
  objectives: z.array(z.string()).default([]),
  rubric: z.object({
    id: z.string(),
    text: z.string().min(1),
    levels: z.boolean(),
    pages: z.array(z.number().int().positive()).min(1),
  }),
  pages: z.array(z.number().int().positive()).min(1),
  hints: z.array(z.string()).default([]),
  tableColumns: z.array(z.string()).optional(),
  eligible: z.boolean().default(true),
});
export type Question = z.infer<typeof Question>;
export const Paper = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  subject: z.enum(["psychology", "business"]),
  qualification: z.enum(["YPS01", "YBS11"]),
  specification: z.string(),
  unit: z.string(),
  year: z.number().int().min(2000),
  session: z.enum(["January", "June", "October"]),
  variant: z.string(),
  title: z.string(),
  durationMinutes: z.number().positive(),
  totalMarks: z.number().int().positive(),
  instructions: z.string(),
  generalRubric: z.string().min(1),
  permittedMaterials: z.string(),
  resources: z.array(Resource),
  questions: z.array(Question).min(1),
  choices: z.array(
    z.object({
      id: z.string(),
      choose: z.number().int().positive(),
      questionIds: z.array(z.string()).min(1),
    }),
  ),
  compatibleSpecifications: z.array(z.string()).min(1),
  sourceIds: z.array(z.string()).min(2),
  fullMockEligible: z.boolean(),
  permissionConfirmed: z.boolean().default(false),
  boundaries: z
    .array(
      z.object({ grade: z.string(), minimum: z.number().int().nonnegative() }),
    )
    .optional(),
});
export type Paper = z.infer<typeof Paper>;
export const Result = z.object({
  questionId: z.string(),
  rubricId: z.string(),
  awarded: z.number().int().nonnegative(),
  available: z.number().int().positive(),
  evidence: z.array(
    z.object({ quote: z.string().min(1), rubricReference: z.string().min(1) }),
  ),
  justification: z.string().min(1),
  achievements: z.array(z.string()).max(2),
  improvement: z.string(),
  uncertainty: z.array(z.string()),
});
export type Result = z.infer<typeof Result>;
export const Enrolment = z.object({
  subject: z.enum(["psychology", "business"]),
  specification: z.string().min(1),
  targetSession: z.string().regex(/^(January|June|October) 20\d{2}$/),
  taughtTopics: z.array(z.string()),
  option: z.enum(["health", "criminological"]).optional(),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  extraTimePercent: z.number().min(0).max(100).default(0),
  sessionMinutes: z.number().int().min(5).max(180).default(20),
  availability: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        minutes: z.number().int().positive(),
      }),
    )
    .default([]),
  examDates: z
    .array(
      z.object({
        unit: z.string(),
        date: z.string().date(),
        confirmed: z.boolean(),
      }),
    )
    .default([]),
  blockedDates: z.array(z.string().date()).default([]),
});
export type Enrolment = z.infer<typeof Enrolment>;
