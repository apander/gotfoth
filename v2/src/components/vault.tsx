"use client";
import { useEffect, useRef, useState } from "react";
import { createAuthClient } from "better-auth/react";
import { api, euro, date } from "./api";
import { Player } from "./player";
import { Progress, FamilySettings, Plan, Assessment } from "./views";
import { Admin } from "./admin";
import { Brand, PageHeading, Empty, Icon } from "./ui";
import { Home, Subjects, PracticePicker, PaperList } from "./revision";
import { PaperDesk } from "./paper-desk";
import { AccountPage } from "./account";
function authBaseURL() {
  if (typeof window !== "undefined") return window.location.origin;
  const configured = process.env.BETTER_AUTH_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch {
      // A production pull can replace this sensitive value with a non-URL placeholder.
    }
  }
  return "https://gotfoth.vercel.app";
}
const authClient = createAuthClient({ baseURL: authBaseURL() });
export function Vault() {
  const acceptingInvitation = useRef<{
    token: string;
    promise: Promise<unknown>;
  } | null>(null);
  const [identity, setIdentity] = useState<any>(null),
    [family, setFamily] = useState(""),
    [data, setData] = useState<any>(null),
    [page, setPage] = useState("Today"),
    [learner, setLearner] = useState(""),
    [course, setCourse] = useState(""),
    [historyTopic, setHistoryTopic] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(""),
    [assessment, setAssessment] = useState(""),
    [notice, setNotice] = useState("");
  async function loadIdentity() {
    try {
      const value = await api("identity");
      setIdentity(value);
      const params = new URLSearchParams(location.search);
      const linkedPage = params.get("page");
      if (
        linkedPage &&
        [
          "Today",
          "Subjects",
          "Practice",
          "Papers",
          "Progress",
          "Plan",
          "Overview",
          "Reviews",
          "Family",
          "Credit",
          "Families",
          "Invitations",
          "Catalogue",
          "Operations",
          "Account",
        ].includes(linkedPage)
      )
        setPage(linkedPage);
      const linkedFamily = params.get("family");
      if (
        linkedFamily &&
        value.workspaces.some((w: any) => w.id === linkedFamily)
      )
        setFamily(linkedFamily);
      if (params.get("attempt")) setAttempt(params.get("attempt")!);
      const invite = new URLSearchParams(location.search).get("invite");
      if (invite) {
        // Share the request when React replays the mount effect in development.
        if (acceptingInvitation.current?.token !== invite)
          acceptingInvitation.current = {
            token: invite,
            promise: api("invitation/accept", { token: invite }),
          };
        await acceptingInvitation.current.promise;
        history.replaceState(null, "", "/");
        return loadIdentity();
      }
      setFamily((current) =>
        value.workspaces.some((w: any) => w.id === current)
          ? current
          : (value.workspaces[0]?.id ?? ""),
      );
      if (!value.workspaces.length && value.superuser) setPage("Families");
    } catch (e: any) {
      if (e.code !== "UNAUTHENTICATED") setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function refresh() {
    if (!family) return;
    const value = await api(`family/snapshot?family=${family}`);
    setData(value);
    setPage((current) =>
      current === "Account"
        ? current
        : value.role === "teacher"
          ? "Papers"
          : value.role === "parent" && current === "Today"
            ? "Overview"
            : value.role === "student" &&
                ["Overview", "Reviews", "Family", "Credit"].includes(current)
              ? "Today"
              : current,
    );
    setLearner((current) =>
      value.learners.some((l: any) => l.id === current)
        ? current
        : (value.learners[0]?.id ?? ""),
    );
    setCourse((current) =>
      value.enrolments.some((e: any) => e.id === current)
        ? current
        : (value.enrolments[0]?.id ?? ""),
    );
  }
  useEffect(() => {
    void loadIdentity();
  }, []);
  useEffect(() => {
    setData(null);
    void refresh().catch((e) => setError(e.message));
  }, [family]);
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
  const selected =
    data?.enrolments.find(
      (c: any) => c.id === course && c.learner_id === learner,
    ) ?? data?.enrolments.find((c: any) => c.learner_id === learner);
  const student = data?.learners.find((l: any) => l.id === learner);
  const isAdmin = [
    "Families",
    "Invitations",
    "Catalogue",
    "Operations",
  ].includes(page);
  const paperDesk =
    page === "Papers" && (identity?.superuser || data?.role === "teacher");
  const nav =
    data?.role === "teacher"
      ? ["Papers"]
      : data?.role === "parent"
        ? ["Overview", "Reviews", "Family", "Credit", "Progress", "Plan"]
        : ["Today", "Subjects", "Practice", "Progress"];
  async function create(
    mode: string,
    paperId?: string,
    topic?: string,
    retryOf?: string,
  ) {
    if (!selected) throw new Error("A parent needs to add your course first.");
    const result = await api("family/attempt/create", {
      familyId: family,
      learnerId: learner,
      enrolmentId: selected.id,
      mode,
      paperId,
      topic,
      retryOf,
    });
    setAttempt(result.id);
  }
  useEffect(() => {
    document.title = `${attempt ? "Question" : assessment ? "Results" : page === "Today" ? "Home" : page} · GotFoth`;
  }, [page, attempt, assessment]);
  if (loading) return <main className="loading">Opening your workspace…</main>;
  if (!identity)
    return (
      <main className="login">
        <section className="login-story">
          <Brand />
          <h1>
            Find your focus.
            <br />
            Make it count.
          </h1>
          <p>Past-paper practice. Clear feedback. A precise next step.</p>
          <div
            className="row"
            style={{ justifyContent: "flex-start", marginTop: 30 }}
          >
            <span className="badge">PSYCHOLOGY</span>
            <span className="badge">BUSINESS</span>
          </div>
          <p className="login-foot">
            Pearson Edexcel International A Level · Independent revision
          </p>
        </section>
        <section className="login-form">
          <p className="eyebrow">YOUR NEXT SESSION</p>
          <h2>Welcome to GotFoth.</h2>
          <p className="muted">
            Sign in with the Google account on your invitation. Your work stays
            in your family’s private workspace.
          </p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await authClient.signIn.social({
                  provider: "google",
                  callbackURL: location.href,
                });
                if (r.error) throw new Error(r.error.message);
              })
            }
          >
            Continue with Google <span aria-hidden>→</span>
          </button>
          <p className="login-foot muted">
            Invitation only. Ask your Study Vault administrator for access.
          </p>
        </section>
      </main>
    );
  return (
    <div className={`shell ${attempt ? "focus-mode" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        {identity.workspaces.length > 0 && (
          <select
            className="workspace"
            disabled={!!attempt}
            aria-label="Family workspace"
            value={family}
            onChange={(e) => {
              setFamily(e.target.value);
              setAttempt("");
              setAssessment("");
            }}
          >
            {identity.workspaces.map((w: any) => (
              <option value={w.id} key={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
        <nav className="primary-nav" aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n}
              aria-current={page === n && !attempt ? "page" : undefined}
              disabled={!!attempt}
              className={`nav-button ${page === n && !attempt ? "active" : ""}`}
              onClick={() => {
                setPage(n);
                setAttempt("");
                setAssessment("");
              }}
            >
              <Icon name={n} />
              {n === "Today" ? "Home" : n}
            </button>
          ))}
        </nav>
        {data?.role === "student" && (
          <nav className="secondary-nav" aria-label="Planning">
            <button
              disabled={!!attempt}
              className={`nav-button ${page === "Plan" ? "active" : ""}`}
              onClick={() => {
                setPage("Plan");
                setAttempt("");
                setAssessment("");
              }}
            >
              <Icon name="Plan" />
              Plan
            </button>
          </nav>
        )}
        {identity.superuser && (
          <>
            <p className="eyebrow" style={{ marginBottom: -20 }}>
              ADMINISTRATION
            </p>
            <nav aria-label="Administration">
              {["Papers", "Families", "Invitations", "Catalogue", "Operations"].map(
                (n) => (
                  <button
                    key={n}
                    disabled={!!attempt}
                    className={`nav-button ${page === n ? "active" : ""}`}
                    onClick={() => {
                      setPage(n);
                      setAttempt("");
                      setAssessment("");
                    }}
                  >
                    <Icon name={n} />
                    {n}
                  </button>
                ),
              )}
            </nav>
          </>
        )}
        <div className="sidebar-footer">
          A focused place to work.
          <br />
          GotFoth / IAL
        </div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <span>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <div className="topbar-actions">
            <button
              className="link-button"
              aria-label="Increase text size"
              onClick={() =>
                (document.documentElement.style.fontSize =
                  document.documentElement.style.fontSize === "19px"
                    ? "16px"
                    : "19px")
              }
            >
              Aa
            </button>
            <button
              className="link-button account-link"
              aria-current={page === "Account" ? "page" : undefined}
              aria-label={`Account for ${identity.user.name || identity.user.email}`}
              onClick={() => {
                setPage("Account");
                setAttempt("");
                setAssessment("");
              }}
            >
              <span className="avatar" aria-hidden>
                {(identity.user.name || identity.user.email)[0].toUpperCase()}
              </span>
              <span className="account-who">
                <strong>{identity.user.name || identity.user.email}</strong>
                {identity.user.name ? <span>{identity.user.email}</span> : null}
              </span>
            </button>
            <button
              className="link-button"
              onClick={() =>
                run(async () => {
                  if (
                    Object.keys(localStorage).some((k) =>
                      k.startsWith("sv-draft:"),
                    ) &&
                    !confirm(
                      "Unsynced writing may remain on this device. Sign out without clearing it?",
                    )
                  )
                    return;
                  await authClient.signOut();
                  setIdentity(null);
                  setData(null);
                })
              }
            >
              Sign out
            </button>
          </div>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
            <button
              className="link-button"
              style={{ float: "right" }}
              onClick={() => setError("")}
            >
              Dismiss
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {page === "Account" ? (
          <AccountPage
            run={run}
            busy={busy}
            onDeleted={async () => {
              try {
                await authClient.signOut();
              } catch {
                // The sign-in is already gone.
              }
              setIdentity(null);
              setData(null);
              setPage("Today");
            }}
          />
        ) : paperDesk ? (
          <PaperDesk
            familyId={family || "00000000-0000-4000-8000-000000000001"}
            run={run}
          />
        ) : isAdmin ? (
          <Admin page={page} run={run} busy={busy} />
        ) : attempt ? (
          <Player
            familyId={family}
            id={attempt}
            onDone={() => {
              setAttempt("");
              void refresh();
            }}
          />
        ) : assessment ? (
          <Assessment
            familyId={family}
            id={assessment}
            parent={data?.role === "parent"}
            run={run}
            onBack={() => {
              setAssessment("");
              void refresh();
            }}
            onRetry={(id, topic) =>
              run(() => create("guided", undefined, topic, id))
            }
          />
        ) : !data ? (
          <div className="empty">
            <h3>
              {family ? "Loading your workspace…" : "Your invitation is ready"}
            </h3>
            <p>
              {family
                ? "One moment."
                : "Open your invitation link to join the family workspace."}
            </p>
          </div>
        ) : (
          <>
            <div className="row">
              {data.learners.length > 1 && (
                <label className="field">
                  Learner
                  <select
                    value={learner}
                    onChange={(e) => setLearner(e.target.value)}
                  >
                    {data.learners.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {data.enrolments.filter((e: any) => e.learner_id === learner)
                .length > 0 && (
                <label className="field">
                  Course
                  <select
                    value={selected?.id ?? ""}
                    onChange={(e) => setCourse(e.target.value)}
                  >
                    {data.enrolments
                      .filter((e: any) => e.learner_id === learner)
                      .map((e: any) => (
                        <option key={e.id} value={e.id}>
                          {e.data.subject === "psychology"
                            ? "Psychology"
                            : "Business"}{" "}
                          · {e.data.targetSession}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            {["Today", "Overview"].includes(page) && (
              <Home
                data={data}
                learner={learner}
                selected={selected}
                busy={busy}
                onAttempt={setAttempt}
                onAssessment={setAssessment}
                onCreate={(mode: string) => run(() => create(mode))}
                onPage={setPage}
              />
            )}
            {["Today", "Overview"].includes(page) &&
              data.recoveries?.filter((r: any) => r.learner_id === learner)
                .length > 0 && (
                <section className="card" style={{ marginTop: 24 }}>
                  <h2>Interrupted practice revisions</h2>
                  <p className="muted">
                    Recovered writing is separate from the original timed result
                    and has not been charged or marked.
                  </p>
                  {data.recoveries
                    .filter((r: any) => r.learner_id === learner)
                    .map((r: any) => (
                      <details className="list-item" key={r.id}>
                        <summary>Recovered {date(r.created_at)}</summary>
                        {Object.entries(r.text).map(([questionId, text]) => (
                          <label className="field" key={questionId}>
                            Question {questionId}
                            <textarea readOnly value={String(text)} />
                          </label>
                        ))}
                      </details>
                    ))}
                </section>
              )}
            {page === "Subjects" && (
              <Subjects
                data={data}
                learner={learner}
                selected={selected}
                busy={busy}
                onSelect={setCourse}
                onPractice={(mode: string, paper?: string) =>
                  run(() => create(mode, paper))
                }
                onTopic={(topic: string) =>
                  run(() => create("independent", undefined, topic))
                }
                onHistory={(topic: string) => {
                  setHistoryTopic(topic);
                  setPage("Progress");
                }}
              />
            )}
            {page === "Practice" && (
              <PracticePicker
                selected={selected}
                busy={busy}
                onCreate={(mode: string) => run(() => create(mode))}
                onPapers={() => setPage("Papers")}
              />
            )}
            {page === "Papers" && data.role !== "teacher" && (
              <>
                <PageHeading
                  label="PAST PAPERS"
                  title="Train under exam conditions."
                  text="Complete papers, original choices and a fixed deadline. Previously seen content is labelled."
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
              <Progress
                initialTopic={historyTopic}
                familyId={family}
                learnerId={learner}
                course={selected}
                run={run}
                onAssessment={setAssessment}
                onPractice={(topic) =>
                  run(() => create("independent", undefined, topic))
                }
              />
            )}
            {page === "Family" && (
              <FamilySettings
                familyId={family}
                learners={data.learners}
                enrolments={data.enrolments}
                papers={data.papers}
                run={run}
                refresh={refresh}
              />
            )}
            {page === "Reviews" && (
              <>
                <PageHeading
                  label="CAREFUL, SUPPORTIVE ASSESSMENT"
                  title="Marking reviews."
                  text="Check the answer against the rubric. Preserve earned marks and give one useful next step."
                />
                {data.assessments
                  .filter((a: any) =>
                    ["needs_review", "failed", "awaiting_funds"].includes(
                      a.state,
                    ),
                  )
                  .map((a: any) => (
                    <section
                      className="list-item row"
                      style={{ marginBottom: 15 }}
                      key={a.id}
                    >
                      <div>
                        <strong>
                          {
                            data.learners.find(
                              (l: any) => l.id === a.learner_id,
                            )?.name
                          }
                        </strong>
                        <p className="muted" style={{ margin: 0 }}>
                          {date(a.submitted_at)} ·{" "}
                          {a.state.replaceAll("_", " ")}
                        </p>
                      </div>
                      <button
                        className="button"
                        onClick={() => setAssessment(a.id)}
                      >
                        Review
                      </button>
                    </section>
                  ))}
                {!data.assessments.some((a: any) =>
                  ["needs_review", "failed", "awaiting_funds"].includes(
                    a.state,
                  ),
                ) && (
                  <Empty
                    title="Nothing needs your attention"
                    text="Marking exceptions and student queries will appear here."
                  />
                )}
              </>
            )}
            {page === "Credit" && (
              <>
                <PageHeading
                  label="FAMILY FUNDING"
                  title="Credit and spending."
                  text="Prepaid credit, clear limits, and no automatic top-ups."
                />
                <div className="grid">
                  <section className="card">
                    <p className="eyebrow">FAMILY BALANCE</p>
                    <div className="metric">
                      {euro(data.wallet?.balance ?? 0)}
                    </div>
                    <p className="muted">
                      {euro(data.wallet?.reserved ?? 0)} reserved for authorised
                      marking.
                    </p>
                    <div className="row">
                      {[1000, 2500].map((cents) => (
                        <button
                          key={cents}
                          className="button"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const r = await api("family/checkout", {
                                familyId: family,
                                cents,
                              });
                              location.assign(r.url);
                            })
                          }
                        >
                          Add €{cents / 100}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="card">
                    <p className="eyebrow">MONTHLY STUDENT LIMITS</p>
                    {data.learners.map((l: any) => (
                      <label className="field" key={l.id}>
                        {l.name} · EUR
                        <input
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={Number(l.monthly_cap) / 1e6}
                          onBlur={(e) =>
                            run(async () => {
                              await api("family/action", {
                                familyId: family,
                                action: "cap",
                                learnerId: l.id,
                                micros: Math.round(
                                  Number(e.target.value) * 1e6,
                                ),
                              });
                              await refresh();
                            })
                          }
                        />
                      </label>
                    ))}
                    <p className="muted">
                      Adding credit does not change these limits.
                    </p>
                  </section>
                </div>
                <section className="card" style={{ marginTop: 25 }}>
                  <h2>Account activity</h2>
                  {data.wallet?.ledger.map((l: any, i: number) => (
                    <div key={i} className="list-item row">
                      <span>
                        {date(l.created_at)} · {l.kind}
                      </span>
                      <strong>{euro(l.amount)}</strong>
                    </div>
                  ))}
                </section>
              </>
            )}
            {page === "Plan" && (
              <Plan
                familyId={family}
                learnerId={learner}
                course={selected}
                sessions={data.sessions}
                calendar={data.calendar}
                run={run}
                refresh={refresh}
                onAttempt={setAttempt}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
