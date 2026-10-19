export type Persona = "student" | "teacher" | "parent" | "superuser";
export const personas = {
  student: {
    label: "My learning",
    description: "Small steps. Real progress.",
    home: "Today",
    pages: ["Today", "Subjects", "Practice", "Progress", "Plan"],
  },
  teacher: {
    label: "Teaching workspace",
    description: "Your students. Your expertise.",
    home: "Overview",
    pages: ["Overview", "Students", "Groups", "Reviews"],
  },
  parent: {
    label: "Family space",
    description: "A little support goes a long way.",
    home: "Overview",
    pages: ["Overview", "Progress", "Credit"],
  },
  superuser: {
    label: "Administration",
    description: "Keep learning running smoothly.",
    home: "Overview",
    pages: ["Overview", "Families", "Invitations", "Content", "Operations"],
  },
} satisfies Record<
  Persona,
  { label: string; description: string; home: string; pages: string[] }
>;
export const pageLabels: Record<string, string> = {
  Subjects: "My subjects",
  Plan: "My week",
  Credit: "Funding",
  Study: "Course settings",
  FamilySettings: "Family settings",
};
export const capabilities = {
  student: { review: false, query: true, fund: false, courses: true },
  teacher: { review: true, query: false, fund: false, courses: false },
  parent: { review: false, query: false, fund: true, courses: false },
  superuser: { review: false, query: false, fund: false, courses: false },
} as const;
export function pageForRole(page: string, role: Persona) {
  const aliases: Record<string, string> = {
    Home: "Today",
    Funding: "Credit",
    "My subjects": "Subjects",
    "My week": "Plan",
    Diary: "Plan",
    Status: "Overview",
    Guidance: "Overview",
    Family: role === "student" ? "Study" : "FamilySettings",
  };
  const value = aliases[page] ?? page;
  if (["Account", "Reminders"].includes(value)) return value;
  if (role === "superuser" && value === "Queues") return value;
  if (role === "student" && ["Study", "Papers"].includes(value)) return value;
  if (role === "parent" && value === "FamilySettings") return value;
  if (role === "parent" && value === "Plan") return value;
  if (role === "superuser" && ["Papers", "Catalogue"].includes(value))
    return "Content";
  return (personas[role].pages as readonly string[]).includes(value)
    ? value
    : personas[role].home;
}
export const statusLabels: Record<string, string> = {
  needs_review: "Teacher review needed",
  awaiting_funds: "Waiting for funding",
  failed: "Processing needs attention",
  queued: "Waiting to be marked",
  marking: "Marking in progress",
  validating: "Checking feedback",
  published: "Feedback ready",
  cancelled: "Cancelled",
  draft: "Ready to start",
  in_progress: "In progress",
  submitted: "Submitted",
  proposed: "Suggested",
  approved: "Planned",
  completed: "Completed",
  guided: "Guided practice",
  independent: "Independent practice",
  timed: "Timed section",
  mock: "Full paper",
};
export const friendlyStatus = (state: string) =>
  statusLabels[state] ?? "Awaiting an update";
export const learnerStatus = (state: string) =>
  state === "awaiting_funds" ? "Feedback pending" : friendlyStatus(state);
