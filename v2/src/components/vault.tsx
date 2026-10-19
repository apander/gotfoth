"use client";
import { useEffect, useRef, useState } from "react";
import { createAuthClient } from "better-auth/react";
import { api, date } from "./api";
import dynamic from "next/dynamic";
import { WorkspaceShell, useExperience } from "./workspace-shell";
import {
  CompanionScreens,
  FundingScreen,
  ProgressOverview,
  TeacherStudentEvidence,
} from "./companion-screens";
import { DesktopHandoff } from "./desktop-handoff";
import { Reminders } from "./reminders";
import { Groups } from "./groups";
import { Diary, CoursePlanning } from "./diary";
import { canUse } from "../lib/experience";
import { FamilySettings, Assessment } from "./views";
import { Brand, Button, Dialog, Empty, PageHeading } from "./ui";
import { Subjects, PracticePicker, PaperList } from "./revision";
import { AccountPage } from "./account";
import { StudyCompanion } from "./persona-shell";
import { FamilyDataSettings, ParentSpace } from "./parent-space";
import { OperatorOverview } from "./operator-overview";
import { capabilities, type Persona } from "../lib/personas";
import { TestLoginLink } from "./testing-lab";

import {
  contextsFor,
  resolveRoute,
  routeURL,
  emptyRoute,
  type Route,
} from "../lib/navigation";

const Player = dynamic(() => import("./player").then((m) => m.Player), {
  ssr: false,
});
const Admin = dynamic(() => import("./admin").then((m) => m.Admin), {
  ssr: false,
});
const PaperDesk = dynamic(
  () => import("./paper-desk").then((m) => m.PaperDesk),
  { ssr: false },
);
const StudentToday = dynamic(
  () => import("./student-today").then((m) => m.StudentToday),
  { ssr: false },
);
const TeacherWorkspace = dynamic(
  () => import("./teacher-workspace").then((m) => m.TeacherWorkspace),
  { ssr: false },
);

function authBaseURL() {
  if (typeof window !== "undefined") return window.location.origin;
  try {
    return new URL(process.env.BETTER_AUTH_URL ?? "https://gotfoth.vercel.app")
      .origin;
  } catch {
    return "https://gotfoth.vercel.app";
  }
}
const authClient = createAuthClient({ baseURL: authBaseURL() });

export function Vault() {
  const experience = useExperience();
  const [identity, setIdentity] = useState<any>(null),
    [route, setRoute] = useState<Route>(emptyRoute),
    [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refreshKey, setRefreshKey] = useState(0),
    [signOut, setSignOut] = useState(false),
    [celebrate, setCelebrate] = useState(false);
  const routeRef = useRef(route),
    identityRef = useRef<any>(null),
    saveBeforeLeave = useRef<null | (() => Promise<void>)>(null),
    accepting = useRef<{ token: string; promise: Promise<any> } | null>(null);
  const dataFamily = useRef("");
  const contexts = identity ? contextsFor(identity) : [];
  const role: Persona =
    contexts.find((c) => c.id === route.context)?.role ?? "student";
  const currentFamily = !["teacher", "admin"].includes(route.context)
    ? route.context
    : "";
  const learner = data?.learners.some((l: any) => l.id === route.learner)
    ? route.learner
    : (data?.learners[0]?.id ?? "");
  const selected =
    data?.enrolments.find(
      (c: any) => c.id === route.course && c.learner_id === learner,
    ) ?? data?.enrolments.find((c: any) => c.learner_id === learner);
  function commit(next: Route, replace = false) {
    routeRef.current = next;
    setRoute(next);
    const url = routeURL(next);
    if (`${location.pathname}${location.search}` !== url)
      history[replace ? "replaceState" : "pushState"](null, "", url);
  }
  function navigate(patch: Partial<Route>, replace = false) {
    commit(
      resolveRoute({ ...routeRef.current, ...patch }, identityRef.current),
      replace,
    );
  }
  function onPage(page: string) {
    navigate({ page, attempt: "", assessment: "", offset: "0" });
  }
  function openAssessment(id: string, family = currentFamily) {
    navigate({ assessment: id, family, attempt: "" });
  }
  async function refresh() {
    setRefreshKey((n) => n + 1);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function loadIdentity() {
    try {
      let value = await api("identity");
      const params = new URLSearchParams(location.search),
        token = params.get("invite");
      if (token) {
        try {
          if (accepting.current?.token !== token)
            accepting.current = {
              token,
              promise: api("invitation/accept", { token }),
            };
          const accepted = await accepting.current.promise;
          value = await api("identity");
          if (accepted.familyId) params.set("family", accepted.familyId);
        } catch (e) {
          if (!value.workspaces.length) throw e;
        }
        params.delete("invite");
      }
      identityRef.current = value;
      setIdentity(value);
      commit(resolveRoute(Object.fromEntries(params), value), true);
    } catch (e: any) {
      if (e.code !== "UNAUTHENTICATED") setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void loadIdentity();
    if (localStorage.getItem("gotfoth:large-text") === "true")
      document.documentElement.style.fontSize = "19px";
  }, []);
  useEffect(() => {
    async function pop() {
      if (!identityRef.current) return;
      const requested = resolveRoute(
        Object.fromEntries(new URLSearchParams(location.search)),
        identityRef.current,
      );
      if (
        routeRef.current.attempt &&
        (requested.attempt !== routeRef.current.attempt ||
          requested.family !== routeRef.current.family)
      ) {
        try {
          await saveBeforeLeave.current?.();
        } catch {
          history.pushState(null, "", routeURL(routeRef.current));
          setError(
            "Your writing could not sync. Stay here and try saving again; a recovery copy remains on this device.",
          );
          return;
        }
      }
      commit(requested, true);
    }
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    let alive = true;
    if (dataFamily.current !== currentFamily) {
      setData(null);
      dataFamily.current = currentFamily;
    }
    setError("");
    if (currentFamily && identity && experience === "desktop")
      (role === "parent"
        ? Promise.all([
            api(`family/summary?family=${currentFamily}`),
            api(`family/funding?family=${currentFamily}&limit=1`),
          ]).then(([summary, funding]) => ({
            ...summary,
            wallet: funding.wallet,
          }))
        : api(`family/snapshot?family=${currentFamily}`)
      )
        .then((value) => {
          if (alive) setData(value);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [currentFamily, identity?.user.id, refreshKey, experience, role]);
  useEffect(() => {
    document.title = `${route.attempt ? "Practice" : route.assessment ? "Feedback" : route.page || "Welcome"} · GotFoth`;
    if (!route.attempt)
      document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [route.page, route.assessment, route.attempt, route.context]);
  async function create(
    mode: string,
    paperId?: string,
    topic?: string,
    retryOf?: string,
    subject?: string,
  ) {
    const course = subject
      ? data?.enrolments.find(
          (c: any) => c.learner_id === learner && c.data.subject === subject,
        )
      : selected;
    if (!course) throw new Error("Add your course in My subjects first.");
    const result = await api("family/attempt/create", {
      familyId: currentFamily,
      learnerId: learner,
      enrolmentId: course.id,
      mode,
      paperId,
      topic,
      retryOf,
    });
    navigate({ attempt: result.id, assessment: "", family: currentFamily });
  }
  if (loading || !experience)
    return (
      <main className="loading" role="status">
        Opening your workspace…
      </main>
    );
  if (!identity)
    return (
      <main className="login">
        <section className="login-story">
          <Brand />
          <StudyCompanion />
          <h1>
            A little practice.
            <br />A lot more possibility.
          </h1>
          <p>
            Real exam questions. Feedback that helps. A next step that feels
            possible.
          </p>
          <div className="subject-tags">
            <span className="subject-tag psychology">Psychology</span>
            <span className="subject-tag business">Business</span>
          </div>
          <p className="login-foot">
            GotFoth · Independent revision, supported by the people around you.
          </p>
        </section>
        <section className="login-form">
          <p className="eyebrow">YOUR SPACE TO GROW</p>
          <h2>Good to see you.</h2>
          <p className="muted">
            Sign in with the Google account on your invitation. We’ll open the
            right workspace for you.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await authClient.signIn.social({
                  provider: "google",
                  callbackURL: location.href,
                });
                if (result.error) throw new Error(result.error.message);
              })
            }
          >
            Continue with Google →
          </Button>
          <p className="login-foot muted">
            Invitation only. Ask your GotFoth administrator for access.
          </p>
          <TestLoginLink />
        </section>
      </main>
    );
  const page =
    role === "superuser" && route.page === "Queues" && experience === "desktop"
      ? route.tab === "invitations"
        ? "Invitations"
        : route.tab === "content"
          ? "Content"
          : "Operations"
      : route.page;
  return (
    <WorkspaceShell
      experience={experience}
      role={role}
      page={page}
      identity={identity}
      contexts={contexts}
      context={route.context}
      focus={!!route.attempt && experience === "desktop"}
      onContext={(context) => {
        setCelebrate(false);
        commit(resolveRoute({ ...emptyRoute, context }, identity));
      }}
      onPage={onPage}
      onSignOut={() => setSignOut(true)}
    >
      {error && (
        <div role="alert" className="error">
          {error}
          <button
            className="link-button"
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {page === "Account" ? (
        <>
          {role === "parent" && experience === "desktop" && (
            <div className="account-context-actions">
              <Button
                variant="secondary"
                onClick={() => onPage("FamilySettings")}
              >
                Family settings and data
              </Button>
            </div>
          )}
          <AccountPage
            run={run}
            busy={busy}
            onRenamed={(name) => {
              const next = { ...identity, user: { ...identity.user, name } };
              identityRef.current = next;
              setIdentity(next);
            }}
            onDeleted={async () => {
              try {
                await authClient.signOut();
              } catch {}
              identityRef.current = null;
              setIdentity(null);
              setData(null);
            }}
          />
        </>
      ) : page === "Reminders" ? (
        <Reminders
          key={`${identity.user.id}:${route.context}`}
          context={route.context}
          role={role}
          route={route}
          onRoute={navigate}
          run={run}
          busy={busy}
        />
      ) : route.attempt &&
        role === "student" &&
        !canUse(role, experience, "test") ? (
        <DesktopHandoff
          href={routeURL(route)}
          familyId={currentFamily}
          attempt={route.attempt}
        />
      ) : route.attempt && role === "student" ? (
        <Player
          key={route.attempt}
          familyId={currentFamily}
          userId={identity.user.id}
          id={route.attempt}
          onNavigationReady={(fn) => {
            saveBeforeLeave.current = fn;
          }}
          onDone={(completed) => {
            setCelebrate(!!completed);
            navigate({ attempt: "", page: "Today" });
            void refresh();
          }}
        />
      ) : route.assessment ? (
        <>
          <p className="assessment-context">
            {identity.workspaces.find((w: any) => w.id === route.family)
              ?.name ?? "Student work"}
          </p>
          {role === "teacher" && experience === "companion" && (
            <DesktopHandoff
              title="Review on a computer"
              href={routeURL(route)}
            />
          )}
          <Assessment
            key={`${route.family}:${route.assessment}`}
            familyId={route.family}
            id={route.assessment}
            reviewer={canUse(role, experience, "review")}
            audience={role}
            canQuery={capabilities[role].query}
            run={run}
            onBack={() => {
              navigate({ assessment: "" });
              void refresh();
            }}
            onRetry={
              canUse(role, experience, "test")
                ? (id, topic, subject) =>
                    run(() => create("guided", undefined, topic, id, subject))
                : undefined
            }
          />
        </>
      ) : experience === "companion" ? (
        <CompanionScreens
          key={`${identity.user.id}:${route.context}`}
          role={role}
          identity={identity}
          route={route}
          onRoute={navigate}
          run={run}
          busy={busy}
          revision={refreshKey}
        />
      ) : role === "superuser" ? (
        page === "Overview" ? (
          <OperatorOverview onPage={onPage} />
        ) : page === "Content" ? (
          <>
            <div
              className="segmented"
              role="group"
              aria-label="Content workflow"
            >
              <button
                aria-pressed={route.tab !== "catalogue"}
                onClick={() => navigate({ tab: "papers" })}
              >
                Paper library
              </button>
              <button
                aria-pressed={route.tab === "catalogue"}
                onClick={() => navigate({ tab: "catalogue" })}
              >
                Catalogue publication
              </button>
            </div>
            {route.tab === "catalogue" ? (
              <Admin page="Catalogue" run={run} busy={busy} />
            ) : (
              <PaperDesk
                familyId="00000000-0000-4000-8000-000000000001"
                run={run}
              />
            )}
          </>
        ) : (
          <Admin key={page} page={page} run={run} busy={busy} />
        )
      ) : role === "teacher" && page === "Groups" ? (
        <Groups
          key={identity.user.id}
          companion={false}
          route={route}
          onRoute={navigate}
          onAssessment={openAssessment}
          run={run}
          busy={busy}
        />
      ) : role === "teacher" ? (
        <>
          <TeacherWorkspace
            page={page}
            filters={{
              group: route.group,
              filterFamily: route.filterFamily,
              student: route.student,
              subject: route.subject,
              status: route.status,
              search: route.search,
              offset: route.offset,
            }}
            onFilter={(filters) =>
              navigate({
                filterFamily: "",
                student: "",
                subject: "",
                status: "",
                search: "",
                offset: "0",
                ...filters,
              })
            }
            onPage={onPage}
            onAssessment={openAssessment}
          />
          {page === "Students" && (
            <TeacherStudentEvidence
              route={route}
              onRoute={navigate}
              run={run}
            />
          )}
        </>
      ) : !data ? (
        <Empty
          title={
            currentFamily
              ? error
                ? "Workspace unavailable"
                : "Opening your workspace…"
              : "Your invitation is ready"
          }
          text={
            currentFamily
              ? error
                ? "Try again when you’re ready."
                : "Your work will be here in a moment."
              : "Open your invitation link to get started."
          }
        />
      ) : role === "parent" ? (
        page === "Credit" ? (
          <FundingScreen
            familyId={currentFamily}
            route={route}
            onRoute={navigate}
            run={run}
            busy={busy}
            revision={refreshKey}
          />
        ) : page === "FamilySettings" ? (
          <FamilyDataSettings familyId={currentFamily} run={run} busy={busy} />
        ) : page === "Progress" ? (
          <ProgressOverview
            familyId={currentFamily}
            people={data.learners}
            courses={data.enrolments}
            route={route}
            onRoute={navigate}
            run={run}
          />
        ) : page === "Plan" ? (
          <Diary
            familyId={currentFamily}
            learnerId={learner}
            courses={data.enrolments.filter(
              (c: any) => c.learner_id === learner,
            )}
            calendar={data.calendar}
            route={route}
            onRoute={navigate}
            onAttempt={() => {}}
            run={run}
            busy={busy}
            refresh={refresh}
            readOnly
          />
        ) : (
          <ParentSpace
            page={page}
            data={data}
            learner={learner}
            onLearner={(id: string) => navigate({ learner: id })}
            onPage={onPage}
            onAssessment={openAssessment}
          />
        )
      ) : (
        <>
          {!["Today", "Subjects", "Study"].includes(page) &&
            data.enrolments.length > 0 && (
              <div className="subject-switch" aria-label="Your courses">
                {data.enrolments
                  .filter((c: any) => c.learner_id === learner)
                  .map((c: any) => (
                    <button
                      key={c.id}
                      className={`subject-button ${c.data.subject} ${c.id === selected?.id ? "selected" : ""}`}
                      aria-pressed={c.id === selected?.id}
                      onClick={() => navigate({ course: c.id, topic: "" })}
                    >
                      <strong className="capitalize">{c.data.subject}</strong>
                      <small>{c.data.targetSession}</small>
                    </button>
                  ))}
              </div>
            )}
          {page === "Today" && (
            <>
              <StudentToday
                data={data}
                familyId={currentFamily}
                learner={learner}
                selected={selected}
                busy={busy}
                celebrate={celebrate}
                onAttempt={(id: string) => navigate({ attempt: id })}
                onAssessment={openAssessment}
                onCreate={(mode: string) => run(() => create(mode))}
                onPage={onPage}
              />
              {data.recoveries?.length > 0 && (
                <details className="section">
                  <summary>Recovered writing</summary>
                  {data.recoveries
                    .filter((r: any) => r.learner_id === learner)
                    .map((r: any) => (
                      <section key={r.id}>
                        <h3>Recovered {date(r.created_at)}</h3>
                        <p className="muted">
                          Separate from the original timed result. This writing
                          is saved separately from your submitted work.
                        </p>
                        {Object.entries(r.text).map(([id, text]) => (
                          <p className="question-text" key={id}>
                            {String(text)}
                          </p>
                        ))}
                      </section>
                    ))}
                </details>
              )}
            </>
          )}
          {page === "Subjects" && (
            <>
              <div className="section-title">
                <span className="eyebrow">YOUR SUBJECTS</span>
                <Button variant="secondary" onClick={() => onPage("Study")}>
                  {selected ? "Manage courses" : "Set up a course"}
                </Button>
              </div>
              <Subjects
                data={data}
                learner={learner}
                selected={selected}
                busy={busy}
                onSelect={(id: string) => navigate({ course: id, topic: "" })}
                onPractice={(mode: string, paper?: string) =>
                  run(() => create(mode, paper))
                }
                onTopic={(topic: string) =>
                  run(() => create("independent", undefined, topic))
                }
                onHistory={(topic: string) =>
                  navigate({ topic, page: "Progress", tab: "topics" })
                }
              />
            </>
          )}
          {page === "Study" && (
            <>
              <button
                className="link-button"
                onClick={() => onPage("Subjects")}
              >
                ← My subjects
              </button>
              <FamilySettings
                familyId={currentFamily}
                learnerId={learner}
                learners={data.learners}
                enrolments={data.enrolments}
                papers={data.papers}
                run={run}
                refresh={refresh}
              />
              {data.enrolments
                .filter((c: any) => c.learner_id === learner)
                .map((c: any) => (
                  <CoursePlanning
                    key={c.id}
                    course={c}
                    familyId={currentFamily}
                    learnerId={learner}
                    topics={data.papers
                      .filter((p: any) => p.subject === c.data.subject)
                      .flatMap((p: any) => p.topics)}
                    run={run}
                    busy={busy}
                    refresh={refresh}
                  />
                ))}
            </>
          )}
          {page === "Practice" && (
            <>
              {!selected && (
                <div className="notice">
                  <p>Add your first course to find suitable practice.</p>
                  <Button onClick={() => onPage("Study")}>
                    Set up a course
                  </Button>
                </div>
              )}
              <PracticePicker
                selected={selected}
                busy={busy}
                onCreate={(mode: string) => run(() => create(mode))}
                onPapers={() => onPage("Papers")}
              />
            </>
          )}
          {page === "Papers" && (
            <>
              <button
                className="link-button"
                onClick={() => onPage("Practice")}
              >
                ← Practice
              </button>
              <PageHeading
                label="PAST PAPERS"
                title="Ready for the whole paper?"
                text="Original questions and a fixed deadline. Previously seen content is labelled."
              />
              <PaperList
                papers={data.papers}
                selected={selected}
                learner={learner}
                busy={busy}
                onCreate={(mode: string, paper: string) =>
                  run(() => create(mode, paper))
                }
              />
            </>
          )}
          {page === "Progress" && (
            <ProgressOverview
              familyId={currentFamily}
              people={data.learners}
              courses={data.enrolments}
              route={route}
              onRoute={navigate}
              run={run}
              onPractice={(topic) =>
                run(() => create("independent", undefined, topic))
              }
              onAttempt={(id) => navigate({ attempt: id })}
            />
          )}
          {page === "Plan" && (
            <Diary
              familyId={currentFamily}
              learnerId={learner}
              courses={data.enrolments.filter(
                (c: any) => c.learner_id === learner,
              )}
              calendar={data.calendar}
              route={route}
              onRoute={navigate}
              onAttempt={(id) => navigate({ attempt: id })}
              run={run}
              busy={busy}
              refresh={refresh}
            />
          )}
        </>
      )}
      {signOut && (
        <Dialog title="Sign out of GotFoth" onClose={() => setSignOut(false)}>
          <p>
            {Object.keys(localStorage).some((k) => k.startsWith("sv-draft:"))
              ? "A recovery copy of your writing remains on this device. Signing out keeps it available when you return."
              : "Your saved work will be here when you return."}
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await authClient.signOut();
                setSignOut(false);
                identityRef.current = null;
                setIdentity(null);
                setData(null);
                history.replaceState(null, "", "/");
              })
            }
          >
            Sign out
          </Button>
        </Dialog>
      )}
    </WorkspaceShell>
  );
}
