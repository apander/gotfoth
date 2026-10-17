/** Typed projections for domain queries. The reviewed SQL migration also owns RLS, constraints, triggers and auth tables. */
import {
  pgTable,
  uuid,
  text,
  boolean,
  bigint,
  jsonb,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import type { Paper, Enrolment, Result } from "../lib/contracts";
export const families = pgTable("families", {
  id: uuid().primaryKey(),
  name: text().notNull(),
  suspended: boolean().notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const learners = pgTable("learners", {
  id: uuid().primaryKey(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id),
  name: text().notNull(),
  email: text(),
  weeklyGoal: integer("weekly_goal").notNull().default(3),
  goalTimezone: text("goal_timezone").notNull().default("UTC"),
  monthlyCap: bigint("monthly_cap", { mode: "number" })
    .notNull()
    .default(10000000),
});
export const enrolments = pgTable("enrolments", {
  id: uuid().primaryKey(),
  familyId: uuid("family_id").notNull(),
  learnerId: uuid("learner_id").notNull(),
  data: jsonb().$type<Enrolment>().notNull(),
});
export const catalogue = pgTable("catalogue", {
  id: uuid().primaryKey(),
  identity: text().notNull(),
  version: integer().notNull(),
  status: text().notNull(),
  data: jsonb().$type<Paper>().notNull(),
  issues: jsonb().$type<string[]>().notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});
export const assessments = pgTable("assessments", {
  id: uuid().primaryKey(),
  familyId: uuid("family_id").notNull(),
  learnerId: uuid("learner_id").notNull(),
  submissionId: uuid("submission_id").notNull(),
  state: text().notNull(),
  candidates: jsonb().notNull(),
  effective: jsonb().$type<Result[]>(),
  provenance: jsonb().notNull(),
  errorCode: text("error_code"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});
