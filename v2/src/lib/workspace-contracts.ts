import type { Enrolment, Result } from "./contracts";
import type { Persona } from "./personas";
import type { Reminder } from "./reminders";
import type { compareEvidence } from "./comparison";

export type PageSlice<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
};
export type CourseSummary = { id: string; learner_id: string; data: Enrolment };
export type WorkspaceSummary = {
  role: Persona;
  learners: { id: string; name: string; monthly_cap?: number | string }[];
  enrolments: CourseSummary[];
  topics: Record<string, string[]>;
  attempts: {
    id: string;
    learner_id: string;
    state: string;
    subject: string;
    mode: string;
    duration_minutes: string | number;
    deadline?: string;
    created_at: string;
  }[];
  assessments: {
    id: string;
    learner_id: string;
    state: string;
    subject: string;
    mode: string;
    submitted_at: string;
    effective?: Result[];
  }[];
  sessions: {
    id: string;
    learner_id: string;
    state: string;
    data: {
      title: string;
      start: string;
      timezone: string;
      minutes: number;
      purpose: string;
      attemptId?: string;
    };
  }[];
  calendar: string;
};
export type TeacherGroup = {
  id: string;
  name: string;
  members: { group_id: string; family_id: string; learner_id: string }[];
};
export type ReminderSettings = {
  timezone: string;
  calendarTiming: "default" | "off" | "10" | "30" | "60";
  lowCreditMicros: number;
};
export type ReminderInbox = PageSlice<Reminder> & {
  unread: number;
  settings: ReminderSettings;
};
export type ComparisonRead = ReturnType<typeof compareEvidence> & {
  group: { id: string; name: string };
  from: string;
  to: string;
  benchmark: string;
  benchmarks: { key: string; label: string; count: number }[];
  coverage: { topic: string; students: number; observations: number }[];
  activity: {
    id: string;
    name: string;
    familyId: string;
    familyName: string;
    submissions: number;
    pending: number;
  }[];
};
