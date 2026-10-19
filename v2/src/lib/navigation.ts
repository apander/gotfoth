import type { TeacherFilters } from "../components/teacher-workspace";
import { pageForRole, type Persona } from "./personas";
import { destinationURL } from "./experience";
export type Route = TeacherFilters & {
  context: string;
  page: string;
  family: string;
  learner: string;
  course: string;
  attempt: string;
  assessment: string;
  topic: string;
  tab: string;
  group: string;
  date: string;
  view: string;
  benchmark: string;
  from: string;
  to: string;
  payment: string;
  paymentId: string;
};
export const emptyRoute: Route = {
  context: "",
  page: "",
  family: "",
  learner: "",
  course: "",
  attempt: "",
  assessment: "",
  topic: "",
  tab: "",
  group: "",
  date: "",
  view: "",
  benchmark: "",
  from: "",
  to: "",
  payment: "",
  paymentId: "",
};
export function contextsFor(identity: any) {
  return [
    ...(identity.superuser
      ? [{ id: "admin", name: "Administration", role: "superuser" }]
      : []),
    ...(identity.workspaces.some((w: any) => w.role === "teacher")
      ? [{ id: "teacher", name: "All my teaching families", role: "teacher" }]
      : []),
    ...identity.workspaces
      .filter((w: any) => ["student", "parent"].includes(w.role))
      .map((w: any) => ({ ...w, name: `${w.name} · ${w.role}` })),
  ];
}
export function resolveRoute(input: Partial<Route>, identity: any): Route {
  const contexts = contextsFor(identity);
  let context = contexts.find((c) => c.id === input.context);
  if (!context && input.family) {
    const workspace = identity.workspaces.find(
      (w: any) => w.id === input.family,
    );
    context = contexts.find(
      (c) =>
        c.id === (workspace?.role === "teacher" ? "teacher" : workspace?.id),
    );
  }
  context ??= contexts[0];
  const role: Persona = context?.role ?? "student";
  const route = {
    ...emptyRoute,
    ...input,
    context: context?.id ?? "",
    page: pageForRole(input.page ?? "", role),
  };
  if (!["admin", "teacher"].includes(route.context))
    route.family = route.context;
  if (role !== "student") route.attempt = "";
  if (role === "superuser") {
    route.family = "";
    route.assessment = "";
  }
  if (input.page === "Catalogue" && role === "superuser")
    route.tab = "catalogue";
  return route;
}
export function routeURL(route: Route) {
  return destinationURL(route);
}
