"use client";
import { useEffect, useState } from "react";
import { api, date } from "./api";
import { Button, Empty, PageHeading } from "./ui";
import { friendlyStatus } from "../lib/personas";
import { score } from "./revision";
import { useRead } from "./workspace-data";
function guidance(student: any) {
  if (!student.courses.length)
    return "They haven’t added a course yet. Help them find the right starting point.";
  if (student.pending)
    return `${student.pending} assessment${student.pending === 1 ? " needs" : "s need"} your review. Start with the submitted work.`;
  if (student.latest?.state === "awaiting_funds")
    return "Marking is waiting for the parent to add credit.";
  if (student.latest?.state === "failed")
    return "Processing needs attention before feedback can be published.";
  if (student.open_attempts)
    return "A practice session is still open. Encourage them to finish that first.";
  const marks = score(student.latest?.effective);
  if (!marks)
    return "No published evidence yet. Suggest a first short practice session.";
  return marks.percentage < 60
    ? `Their latest result is ${marks.percentage}%. Discuss one improvement before another short practice.`
    : `Their latest result is ${marks.percentage}%. Discuss their feedback and readiness for a fresh paper.`;
}
export type TeacherFilters = {
  group?: string;
  filterFamily?: string;
  student?: string;
  subject?: string;
  status?: string;
  search?: string;
  offset?: string;
};
export function TeacherWorkspace({
  page,
  filters,
  onFilter,
  onPage,
  onAssessment,
}: {
  page: string;
  filters: TeacherFilters;
  onFilter: (value: TeacherFilters) => void;
  onPage: (page: string) => void;
  onAssessment: (id: string, family: string) => void;
}) {
  const groups = useRead("teacher/groups");
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const query = new URLSearchParams({
    view: page.toLowerCase(),
    offset: filters.offset ?? "0",
    ...(filters.filterFamily ? { family: filters.filterFamily } : {}),
    ...(filters.student ? { learner: filters.student } : {}),
    ...(filters.subject ? { subject: filters.subject } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.group ? { group: filters.group } : {}),
  }).toString();
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    api(`teacher/workspace?${query}`)
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [query, retry]);
  const change = (value: TeacherFilters) =>
    onFilter({ ...filters, ...value, offset: "0" });
  const queue = (items: any[]) =>
    items.map((r: any) => (
      <article
        className={`review-row ${r.state === "needs_review" ? "needs-review" : ""}`}
        key={r.id}
      >
        <div>
          <strong>{r.learner_name}</strong>
          {r.has_query && r.state === "needs_review" && (
            <span className="status-pill">Student question</span>
          )}
          <p className="meta">
            {r.family_name} · <span className="capitalize">{r.subject}</span> ·{" "}
            {date(r.submitted_at)}
          </p>
        </div>
        <span className={`status-pill ${r.state}`}>
          {friendlyStatus(r.state)}
        </span>
        <Button
          variant="secondary"
          onClick={() => onAssessment(r.id, r.family_id)}
        >
          {r.state === "needs_review" ? "Review work" : "Open assessment"}
        </Button>
      </article>
    ));
  return (
    <>
      <PageHeading
        label="TEACHING WORKSPACE"
        title={
          page === "Overview"
            ? "Make your attention count."
            : page === "Reviews"
              ? "The work that needs you."
              : "Know where to help."
        }
        text="One view across your authorised families. Every decision stays connected to the student’s work."
      />
      <form
        className="teacher-filters"
        onSubmit={(e) => {
          e.preventDefault();
          change({
            search: String(new FormData(e.currentTarget).get("search") ?? ""),
          });
        }}
      >
        <label className="field">
          Find a student
          <input
            name="search"
            key={filters.search ?? ""}
            defaultValue={filters.search ?? ""}
            placeholder="Search by name"
          />
        </label>
        <Button variant="secondary">Search</Button>
        <label className="field">
          Family
          <select
            value={filters.filterFamily ?? ""}
            onChange={(e) =>
              change({ filterFamily: e.target.value, student: "" })
            }
          >
            <option value="">All my families</option>
            {data?.families.map((f: any) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Subject
          <select
            value={filters.subject ?? ""}
            onChange={(e) => change({ subject: e.target.value })}
          >
            <option value="">All subjects</option>
            <option value="psychology">Psychology</option>
            <option value="business">Business</option>
          </select>
        </label>
        <label className="field">
          Group
          <select
            value={filters.group ?? ""}
            onChange={(e) => change({ group: e.target.value })}
          >
            <option value="">All students</option>
            {groups.data?.groups.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        {page !== "Overview" && (
          <label className="field">
            Status
            <select
              value={filters.status ?? ""}
              onChange={(e) => change({ status: e.target.value })}
            >
              <option value="">All statuses</option>
              {[
                "needs_review",
                "failed",
                "awaiting_funds",
                "queued",
                "marking",
                "validating",
                ...(filters.student ? ["published"] : []),
              ].map((state) => (
                <option value={state} key={state}>
                  {friendlyStatus(state)}
                </option>
              ))}
            </select>
          </label>
        )}
        {(filters.student ||
          filters.search ||
          filters.subject ||
          filters.status ||
          filters.filterFamily) && (
          <button
            type="button"
            className="link-button"
            onClick={() => onFilter({})}
          >
            Clear filters
          </button>
        )}
      </form>
      {error ? (
        <div role="alert" className="error">
          {error}
          <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <div role="status" className="loading">
          Gathering your students’ work…
        </div>
      ) : (
        <>
          {page === "Overview" && (
            <>
              <div className="teacher-metrics">
                <button
                  onClick={() => {
                    onPage("Reviews");
                    change({ status: "needs_review" });
                  }}
                >
                  <strong>{data.totals.actionable}</strong>
                  <span>Need your review</span>
                </button>
                <button onClick={() => onPage("Students")}>
                  <strong>{data.totals.students}</strong>
                  <span>Students in view</span>
                </button>
                <button onClick={() => onPage("Reviews")}>
                  <strong>{data.totals.blocked}</strong>
                  <span>Funding or processing blockers</span>
                </button>
              </div>
              <div className="section-title">
                <h2>Attention queue</h2>
                <button
                  className="link-button"
                  onClick={() => onPage("Reviews")}
                >
                  All reviews →
                </button>
              </div>
              {queue(data.reviews.slice(0, 5))}
              {!data.reviews.length && (
                <Empty
                  title="Nothing waiting here"
                  text="New review requests and processing updates will appear here."
                />
              )}
              <section className="section">
                <h2>Where a conversation could help</h2>
                <div className="guidance-grid">
                  {data.students.slice(0, 6).map((s: any) => (
                    <article key={s.id}>
                      <p className="eyebrow">{s.family_name}</p>
                      <h3>{s.name}</h3>
                      <p>{guidance(s)}</p>
                      <button
                        className="link-button"
                        onClick={() => {
                          onPage("Students");
                          change({ student: s.id, filterFamily: s.family_id });
                        }}
                      >
                        Open student →
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
          {page === "Students" && (
            <>
              {!filters.student ? (
                <div className="student-roster">
                  {data.students.map((s: any) => (
                    <button
                      className="roster-row"
                      key={s.id}
                      onClick={() =>
                        change({ student: s.id, filterFamily: s.family_id })
                      }
                    >
                      <span className="child-avatar">{s.name.slice(0, 1)}</span>
                      <span>
                        <strong>{s.name}</strong>
                        <small>
                          {s.family_name} ·{" "}
                          {s.courses.map((c: any) => c.subject).join(" / ") ||
                            "No courses yet"}
                        </small>
                      </span>
                      <span className="status-pill">
                        {s.pending ? `${s.pending} to review` : "Open progress"}{" "}
                        →
                      </span>
                    </button>
                  ))}
                  {!data.students.length && (
                    <Empty
                      title="No students match"
                      text="Try another name or clear your filters."
                    />
                  )}
                </div>
              ) : (
                <>
                  <button
                    className="link-button"
                    onClick={() => change({ student: "", status: "" })}
                  >
                    ← All students
                  </button>
                  {data.students.map((s: any) => (
                    <section className="student-detail-heading" key={s.id}>
                      <p className="eyebrow">{s.family_name}</p>
                      <h2>{s.name}</h2>
                      <div className="subject-tags">
                        {s.courses.map((c: any, i: number) => (
                          <span key={i} className={`subject-tag ${c.subject}`}>
                            {c.subject} · {c.targetSession}
                          </span>
                        ))}
                      </div>
                      <p>{guidance(s)}</p>
                    </section>
                  ))}
                  <h2>Assessment history</h2>
                  {queue(data.reviews)}
                  {!data.reviews.length && (
                    <Empty
                      title="No assessments match"
                      text="Submitted work and published feedback will appear here."
                    />
                  )}
                </>
              )}
            </>
          )}
          {page === "Reviews" && (
            <>
              <h2>Teacher decisions</h2>
              {queue(
                data.reviews.filter((r: any) => r.state === "needs_review"),
              )}
              {!data.reviews.some((r: any) => r.state === "needs_review") && (
                <p className="empty-inline">
                  No teacher decisions on this page.
                </p>
              )}
              <h2 className="section">Funding and processing</h2>
              <p className="muted">
                Funding is managed by parents. Processing failures may need an
                administrator.
              </p>
              {queue(
                data.reviews.filter((r: any) => r.state !== "needs_review"),
              )}
              {!data.reviews.length && (
                <Empty
                  title="All clear for this selection"
                  text="Change the filters to see other work."
                />
              )}
            </>
          )}
          {page !== "Overview" && (
            <div className="pagination">
              <Button
                variant="secondary"
                disabled={data.offset === 0}
                onClick={() =>
                  onFilter({
                    ...filters,
                    offset: String(Math.max(0, data.offset - data.pageSize)),
                  })
                }
              >
                Previous
              </Button>
              <span>Page {Math.floor(data.offset / data.pageSize) + 1}</span>
              <Button
                variant="secondary"
                disabled={
                  data.offset + data.pageSize >=
                  (page === "Students" && !filters.student
                    ? data.totals.students
                    : data.totals.reviews)
                }
                onClick={() =>
                  onFilter({
                    ...filters,
                    offset: String(data.offset + data.pageSize),
                  })
                }
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
