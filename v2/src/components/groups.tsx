"use client";
import { useState } from "react";
import { api, date } from "./api";
import { useRead } from "./workspace-data";
import { Button, Dialog, Empty, PageHeading } from "./ui";
import { DesktopHandoff, Pagination, ReadState } from "./desktop-handoff";
import { destinationURL, type Destination } from "../lib/experience";
import type { TeacherGroup, ComparisonRead } from "../lib/workspace-contracts";
export function Groups({
  companion,
  route,
  onRoute,
  onAssessment,
  run,
  busy,
}: {
  companion: boolean;
  route: Destination;
  onRoute: (v: Destination) => void;
  onAssessment: (id: string, family: string) => void;
  run: (fn: () => Promise<void>) => void;
  busy: boolean;
}) {
  const groups = useRead<{ groups: TeacherGroup[] }>("teacher/groups"),
    [editing, setEditing] = useState<any>(null),
    [deleting, setDeleting] = useState<any>(null),
    [selected, setSelected] = useState<
      { familyId: string; learnerId: string }[]
    >([]),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState("");
  const roster = useRead(
    editing
      ? `teacher/workspace?${new URLSearchParams({ view: "students", offset: String(offset), search })}`
      : null,
  );
  const comparison = useRead<ComparisonRead>(
    route.group
      ? `teacher/comparison?${new URLSearchParams({ group: route.group, ...(route.benchmark ? { benchmark: route.benchmark } : {}), ...(route.from ? { from: route.from + "T00:00:00.000Z" } : {}), ...(route.to ? { to: route.to + "T23:59:59.999Z" } : {}) })}`
      : null,
  );
  const comparisonData = comparison.data;
  function edit(group?: any) {
    setEditing(group ?? { id: "", name: "" });
    setSelected(
      (group?.members ?? []).map((m: any) => ({
        familyId: m.family_id,
        learnerId: m.learner_id,
      })),
    );
    setOffset(0);
    setSearch("");
  }
  const current = groups.data?.groups.find((g: any) => g.id === route.group);
  return (
    <>
      <PageHeading
        label="TEACHING / GROUPS"
        title="A clearer picture, together."
        text="Your saved groups organise students you already teach. Comparable evidence keeps the context."
      />
      {!groups.data ? (
        <ReadState error={groups.error} refresh={groups.refresh} />
      ) : (
        <>
          <div className="group-tabs">
            {groups.data.groups.map((g: any) => (
              <button
                className={`button ${route.group === g.id ? "" : "secondary"}`}
                key={g.id}
                onClick={() =>
                  onRoute({ group: g.id, benchmark: "", offset: "0" })
                }
              >
                {g.name} <small>({g.members.length})</small>
              </button>
            ))}
          </div>
          {!companion && (
            <div className="row section">
              <Button onClick={() => edit()}>Create group</Button>
              {current && (
                <>
                  <Button variant="secondary" onClick={() => edit(current)}>
                    Edit group
                  </Button>
                  <button
                    className="link-button"
                    onClick={() => setDeleting(current)}
                  >
                    Delete group
                  </button>
                </>
              )}
            </div>
          )}
          {!groups.data.groups.length && (
            <Empty
              title="Your teaching groups start here"
              text={
                companion
                  ? "Create a group on your computer, then follow it here."
                  : "Create a group from students in your authorised teaching families."
              }
            />
          )}
        </>
      )}
      {route.group &&
        (!comparisonData ? (
          <ReadState error={comparison.error} refresh={comparison.refresh} />
        ) : (
          <>
            <section className="card stack">
              <h2>{comparisonData.group.name}</h2>
              <div className="form-grid">
                <label className="field">
                  From
                  <input
                    type="date"
                    value={route.from || comparisonData.from.slice(0, 10)}
                    onChange={(e) =>
                      onRoute({ from: e.target.value, benchmark: "" })
                    }
                  />
                </label>
                <label className="field">
                  To
                  <input
                    type="date"
                    value={route.to || comparisonData.to.slice(0, 10)}
                    onChange={(e) =>
                      onRoute({ to: e.target.value, benchmark: "" })
                    }
                  />
                </label>
              </div>
              <label className="field">
                Comparable evidence
                <select
                  value={comparisonData.benchmark}
                  onChange={(e) => onRoute({ benchmark: e.target.value })}
                >
                  {!comparisonData.benchmarks.length && (
                    <option value="">No matching published results</option>
                  )}
                  {comparisonData.benchmarks.map((b: any) => (
                    <option key={b.key} value={b.key}>
                      {b.label} · {b.count} student{b.count === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>
              <p className="meta">
                Matches frozen questions and rubric, subject, mode, assistance
                and previous exposure. Each student contributes their latest
                matching result. Published evidence only.
              </p>
              {comparisonData.median === null || !comparisonData.range ? (
                <p className="notice">
                  Not enough comparable evidence. A group summary needs at least
                  three students with matching evidence.
                </p>
              ) : (
                <div className="comparison-stats">
                  <div>
                    <strong>{Math.round(comparisonData.median)}%</strong>
                    <span>Group median</span>
                  </div>
                  <div>
                    <strong>
                      {Math.round(comparisonData.range[0])}–
                      {Math.round(comparisonData.range[1])}%
                    </strong>
                    <span>Observed range</span>
                  </div>
                  <div>
                    <strong>{comparisonData.count}</strong>
                    <span>Comparable students</span>
                  </div>
                </div>
              )}
            </section>
            <section className="section">
              <h2>Published results</h2>
              {companion && (
                <div className="companion-list">
                  {comparisonData.students.map((s: any) => (
                    <article className="comparison-person" key={s.learnerId}>
                      <h3>{s.name}</h3>
                      <strong className="metric-small">
                        {Math.round(s.percentage)}%
                      </strong>
                      <p>
                        {s.awarded}/{s.available} marks · {date(s.at)}
                      </p>
                      <p className="meta">
                        {s.count} matching observation{s.count === 1 ? "" : "s"}{" "}
                        ·{" "}
                        {s.change === null
                          ? "No earlier comparable result"
                          : `${s.change >= 0 ? "+" : ""}${Math.round(s.change)} percentage points from own previous result`}
                      </p>
                      {comparisonData.median !== null && (
                        <p className="meta">
                          {Math.round(s.percentage - comparisonData.median)}{" "}
                          percentage points from group median
                        </p>
                      )}
                      <p className="meta">
                        {s.topics
                          .map((t: string) => t.replaceAll(".", " "))
                          .join(" · ")}
                      </p>
                      <button
                        className="link-button"
                        onClick={() => onAssessment(s.id, s.familyId)}
                      >
                        Read evidence →
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {!companion && !!comparisonData.students.length && (
                <div className="overflow section">
                  <table>
                    <caption>Comparable published evidence, by student</caption>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Latest matching result</th>
                        <th>Evidence date</th>
                        <th>Matching observations</th>
                        <th>Own change</th>
                        <th>Group median difference</th>
                        <th>Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonData.students.map((s: any) => (
                        <tr key={s.learnerId}>
                          <th scope="row">{s.name}</th>
                          <td>
                            {s.awarded}/{s.available} (
                            {Math.round(s.percentage)}%)
                          </td>
                          <td>{date(s.at)}</td>
                          <td>{s.count}</td>
                          <td>
                            {s.change === null
                              ? "First observation"
                              : `${Math.round(s.change)} pp`}
                          </td>
                          <td>
                            {comparisonData.median === null
                              ? "Insufficient evidence"
                              : `${Math.round(s.percentage - comparisonData.median)} pp`}
                          </td>
                          <td>
                            <button
                              className="link-button"
                              onClick={() => onAssessment(s.id, s.familyId)}
                            >
                              Read evidence →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="section">
              <h2>Activity and attention</h2>
              <p className="meta">
                Activity is separate from attainment. These counts are not a
                performance ranking.
              </p>
              <div className="companion-list">
                {comparisonData.activity.map((s: any) => (
                  <article key={s.id} className="monitor-row">
                    <div>
                      <strong>{s.name}</strong>
                      <p className="meta">{s.familyName}</p>
                    </div>
                    <span>
                      {s.submissions} submissions in period · {s.pending}{" "}
                      reviews pending
                    </span>
                    <button
                      className="link-button"
                      onClick={() =>
                        onRoute({
                          page: "Students",
                          student: s.id,
                          filterFamily: s.familyId,
                          offset: "0",
                        })
                      }
                    >
                      Student details →
                    </button>
                  </article>
                ))}
              </div>
            </section>
            {!!comparisonData.coverage?.length && (
              <section className="section">
                <h2>Published topic coverage</h2>
                <p className="meta">
                  Coverage shows where evidence exists; it does not estimate
                  mastery.
                </p>
                {comparisonData.coverage.map((c: any) => (
                  <div className="monitor-row" key={c.topic}>
                    <strong>{c.topic.replaceAll(".", " ")}</strong>
                    <span>
                      {c.students} students · {c.observations} published
                      observations
                    </span>
                  </div>
                ))}
              </section>
            )}
          </>
        ))}
      {companion && (
        <DesktopHandoff
          title="Manage groups on your computer"
          href={destinationURL({
            ...route,
            context: "teacher",
            page: "Groups",
          })}
        />
      )}
      {editing && !companion && (
        <Dialog
          title={editing.id ? "Edit teaching group" : "Create teaching group"}
          onClose={() => setEditing(null)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const result = await api("teacher/groups", {
                  action: "save",
                  id: editing.id || undefined,
                  name: editing.name,
                  members: selected,
                });
                setEditing(null);
                groups.refresh();
                comparison.refresh();
                onRoute({ group: result.id, benchmark: "" });
              });
            }}
          >
            <label className="field">
              Group name
              <input
                autoFocus
                required
                maxLength={100}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label className="field">
              Find students
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
            </label>
            <p>
              {selected.length} students selected. Only your current teaching
              access is included.
            </p>
            {!roster.data ? (
              <ReadState error={roster.error} refresh={roster.refresh} />
            ) : (
              <>
                {roster.data.students.map((s: any) => (
                  <label className="choice-row" key={s.id}>
                    <input
                      type="checkbox"
                      checked={selected.some((m) => m.learnerId === s.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [
                                ...selected,
                                { familyId: s.family_id, learnerId: s.id },
                              ]
                            : selected.filter((m) => m.learnerId !== s.id),
                        )
                      }
                    />
                    <span>
                      {s.name}
                      <small className="meta"> · {s.family_name}</small>
                    </span>
                  </label>
                ))}
                <Pagination
                  offset={offset}
                  total={roster.data.totals.students}
                  limit={25}
                  onChange={setOffset}
                />
              </>
            )}
            <Button disabled={busy}>Save group</Button>
          </form>
        </Dialog>
      )}
      {deleting && (
        <Dialog title="Delete teaching group" onClose={() => setDeleting(null)}>
          <p>
            Delete “{deleting.name}”? Student records and family access stay in
            place.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("teacher/groups", {
                  action: "delete",
                  id: deleting.id,
                });
                setDeleting(null);
                groups.refresh();
                onRoute({ group: "", benchmark: "" });
              })
            }
          >
            Delete group
          </Button>
        </Dialog>
      )}
    </>
  );
}
