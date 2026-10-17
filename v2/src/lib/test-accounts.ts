export const testAccounts = [
  {
    key: "alex",
    name: "Alex River",
    role: "student",
    family: "River",
    scenario: "Resume saved work; published feedback and weekly goals.",
  },
  {
    key: "jamie",
    name: "Jamie River",
    role: "student",
    family: "River",
    scenario: "Feedback questions and an assessment awaiting teacher review.",
  },
  {
    key: "sam",
    name: "Sam Hill",
    role: "student",
    family: "Hill",
    scenario: "Older pending review, processing blockers and mixed subjects.",
  },
  {
    key: "casey",
    name: "Casey Green",
    role: "student",
    family: "Green",
    scenario: "New student: set up a course and start first practice.",
  },
  {
    key: "taylor",
    name: "Taylor Brook",
    role: "student",
    family: "Brook",
    scenario: "Course ready, but no credit available.",
  },
  {
    key: "jordan",
    name: "Jordan River",
    role: "parent",
    family: "River",
    scenario: "Two children, published feedback and a funded wallet.",
  },
  {
    key: "robin",
    name: "Robin Hill",
    role: "parent",
    family: "Hill",
    scenario: "Follow progress, processing status and upcoming sessions.",
  },
  {
    key: "chris",
    name: "Chris Green",
    role: "parent",
    family: "Green",
    scenario: "A child with no practice evidence yet.",
  },
  {
    key: "pat",
    name: "Pat Brook",
    role: "parent",
    family: "Brook",
    scenario: "Add test credit and adjust the student’s monthly limit.",
  },
  {
    key: "morgan",
    name: "Morgan Reed",
    role: "teacher",
    family: "River + Hill",
    scenario: "Review across families, including an older pending assessment.",
  },
  {
    key: "lee",
    name: "Lee Park",
    role: "teacher",
    family: "Hill + Green + Brook",
    scenario:
      "Separate teacher decisions from funding and processing blockers.",
  },
  {
    key: "avery",
    name: "Avery Cole",
    role: "mixed",
    family: "River + Hill",
    scenario: "Switch between parent in River and teacher in Hill.",
  },
].map((account) => ({
  ...account,
  id: `ux-fixture-${account.key}`,
  email: `${account.key}@ux.gotfoth.test`,
}));
export const isTestAccount = (email: string) =>
  testAccounts.some((a) => a.email === email.toLowerCase());
export const testFamilyIds = {
  River: "7e570000-0000-4000-8000-000000000001",
  Hill: "7e570000-0000-4000-8000-000000000002",
  Green: "7e570000-0000-4000-8000-000000000003",
  Brook: "7e570000-0000-4000-8000-000000000004",
};
export const testLearnerId = (index: number) =>
  `7e571000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
export const testQuestionIds = new Set(
  ["psychology", "business"].flatMap((subject) =>
    [1, 2, 3, 4].map((n) => `ux-${subject}-q${n}`),
  ),
);
