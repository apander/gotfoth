import type { Persona } from "./personas";

export type Experience = "companion" | "desktop";
export type Capability =
  | "read"
  | "diary"
  | "planning"
  | "fund"
  | "query"
  | "test"
  | "course"
  | "review"
  | "group"
  | "operate";
export type Destination = {
  context?: string;
  page?: string;
  family?: string;
  learner?: string;
  course?: string;
  attempt?: string;
  assessment?: string;
  topic?: string;
  group?: string;
  date?: string;
  view?: string;
  offset?: string;
  filterFamily?: string;
  student?: string;
  subject?: string;
  status?: string;
  search?: string;
  tab?: string;
  benchmark?: string;
  from?: string;
  to?: string;
  payment?: string;
  paymentId?: string;
};
const rules: Record<
  Capability,
  { roles: readonly Persona[]; desktop?: boolean }
> = {
  read: { roles: ["student", "parent", "teacher", "superuser"] },
  diary: { roles: ["student"] },
  planning: { roles: ["student"] },
  fund: { roles: ["parent"] },
  query: { roles: ["student"] },
  test: { roles: ["student"], desktop: true },
  course: { roles: ["student"], desktop: true },
  review: { roles: ["teacher"], desktop: true },
  group: { roles: ["teacher"], desktop: true },
  operate: { roles: ["superuser"], desktop: true },
};
export function canUse(
  role: Persona,
  experience: Experience,
  capability: Capability,
) {
  const rule = rules[capability];
  return (
    rule.roles.includes(role) && (!rule.desktop || experience === "desktop")
  );
}
// Device identity determines experience once. Window size only affects layout.
export function resolveExperience(device: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  mobile?: boolean;
}): Experience {
  return device.mobile ||
    /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(device.userAgent) ||
    (/Mac/i.test(device.platform ?? "") && (device.maxTouchPoints ?? 0) > 1)
    ? "companion"
    : "desktop";
}
export const companionPages: Record<Persona, string[]> = {
  student: ["Today", "Plan", "Progress", "Subjects", "Reminders"],
  parent: ["Overview", "Progress", "Credit", "Reminders"],
  teacher: ["Overview", "Students", "Groups", "Reminders"],
  superuser: ["Overview", "Families", "Queues", "Reminders"],
};
export function destinationURL(value: Destination) {
  const params = new URLSearchParams();
  const keys: (keyof Destination)[] = [
    "context",
    "page",
    "family",
    "learner",
    "course",
    "attempt",
    "assessment",
    "topic",
    "group",
    "date",
    "view",
    "offset",
    "filterFamily",
    "student",
    "subject",
    "status",
    "search",
    "tab",
    "benchmark",
    "from",
    "to",
    "payment",
    "paymentId",
  ];
  for (const key of keys) {
    const item = value[key];
    if (typeof item === "string" && item) params.set(key, item);
  }
  return `/?${params}`;
}
