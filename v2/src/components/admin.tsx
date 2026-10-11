"use client";
import { useEffect, useState } from "react";
import { api, date } from "./api";
import { Dialog, Empty, Icon, PageHeading } from "./ui";
type StudentDraft = { key: string; id?: string; name: string };
type FamilyDraft = {
  id?: string;
  name: string;
  suspended: boolean;
  students: StudentDraft[];
};
function blankFamily(): FamilyDraft {
  return {
    name: "",
    suspended: false,
    students: [{ key: crypto.randomUUID(), name: "" }],
  };
}
function familyDraft(family: any): FamilyDraft {
  const learners = family.learners?.length ? family.learners : [{ name: "" }];
  return {
    id: family.id,
    name: family.name,
    suspended: Boolean(family.suspended),
    students: learners.map((learner: any) => ({
      key: learner.id ?? crypto.randomUUID(),
      id: learner.id,
      name: learner.name ?? "",
    })),
  };
}
export function Admin({
  page,
  run,
  busy,
}: {
  page: string;
  run: (fn: () => Promise<void>) => void;
  busy: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [draft, setDraft] = useState<FamilyDraft | null>(null),
    [removing, setRemoving] = useState<any>(null),
    [formError, setFormError] = useState(""),
    [family, setFamily] = useState(""),
    [learner, setLearner] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("parent"),
    [link, setLink] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [json, setJson] = useState(""),
    [source, setSource] = useState(""),
    [rate, setRate] = useState(
      JSON.stringify(
        {
          label: "Pilot configuration",
          model: "",
          reviewModel: "",
          promptVersion: "ial-v2.1",
          inputMicrosPerMillion: 0,
          outputMicrosPerMillion: 0,
          reviewInputMicrosPerMillion: 0,
          reviewOutputMicrosPerMillion: 0,
          maxOutputTokens: 2000,
          maxAnswerChars: 12000,
          markupBasisPoints: 10000,
        },
        null,
        2,
      ),
    ),
    [check, setCheck] = useState("restore_test"),
    [evidence, setEvidence] = useState("");
  async function refresh() {
    const r = await api("admin");
    setData(r);
    setFamily((f) => f || r.families[0]?.id || "");
    if (r.rates[0]) setRate(JSON.stringify(r.rates[0].data, null, 2));
  }
  useEffect(() => {
    run(refresh);
  }, []);
  useEffect(() => {
    setLearner(
      data?.families.find((f: any) => f.id === family)?.learners[0]?.id ?? "",
    );
  }, [family, data]);
  if (!data) return <div className="loading">Loading administration…</div>;
  return (
    <>
      <PageHeading
        label="ADMINISTRATION"
        title={`${page}.`}
        text="Access, catalogue publication, and operational changes are checked and audited on the server."
      />
      {page === "Families" && (
        <>
          <section className="card family-grid">
            <div className="row">
              <h2>Families</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Add family"
                title="Add family"
                onClick={() => {
                  setFormError("");
                  setDraft(blankFamily());
                }}
              >
                <Icon name="Plus" />
              </button>
            </div>
            {data.families.length === 0 ? (
              <Empty title="No families" text="Add a family to give it students and members." />
            ) : (
              <div className="overflow">
                <table>
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th>Students</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.families.map((f: any) => (
                      <tr key={f.id}>
                        <td>{f.name}</td>
                        <td>
                          {f.learners.length
                            ? f.learners.map((learner: any) => learner.name).join(", ")
                            : "—"}
                        </td>
                        <td>
                          <span className={`badge${f.suspended ? " warm" : ""}`}>
                            {f.suspended ? "Suspended" : "Active"}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Edit ${f.name}`}
                              title={`Edit ${f.name}`}
                              onClick={() => {
                                setFormError("");
                                setDraft(familyDraft(f));
                              }}
                            >
                              <Icon name="Edit" />
                            </button>
                            <button
                              type="button"
                              className="icon-button danger"
                              aria-label={`Delete ${f.name}`}
                              title={`Delete ${f.name}`}
                              onClick={() => {
                                setFormError("");
                                setRemoving(f);
                              }}
                            >
                              <Icon name="Delete" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {draft && (
            <Dialog
              title={draft.id ? "Edit family" : "Add family"}
              onClose={() => setDraft(null)}
            >
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    setFormError("");
                    const students = draft.students
                      .map((student) => ({
                        id: student.id,
                        name: student.name.trim(),
                      }))
                      .filter((student) => student.name);
                    if (!draft.name.trim()) {
                      setFormError("Enter a family name.");
                      return;
                    }
                    if (!draft.id && students.length === 0) {
                      setFormError("Add at least one student.");
                      return;
                    }
                    try {
                      await api(
                        "admin/family",
                        draft.id
                          ? {
                              action: "update",
                              id: draft.id,
                              name: draft.name.trim(),
                              suspended: draft.suspended,
                              learners: students,
                            }
                          : {
                              action: "create",
                              name: draft.name.trim(),
                              learners: students.map((student) => student.name),
                            },
                      );
                      setDraft(null);
                      await refresh();
                    } catch (error) {
                      setFormError(
                        error instanceof Error
                          ? error.message
                          : "Could not save this family.",
                      );
                      throw error;
                    }
                  });
                }}
              >
                <label className="field">
                  Family name
                  <input
                    required
                    autoFocus
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </label>
                <div className="stack">
                  <span className="field">Students</span>
                  {draft.students.map((student) => (
                    <div className="student-row" key={student.key}>
                      <input
                        aria-label="Student name"
                        value={student.name}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            students: draft.students.map((item) =>
                              item.key === student.key
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove ${student.name || "student"}`}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            students: draft.students.filter(
                              (item) => item.key !== student.key,
                            ),
                          })
                        }
                      >
                        <Icon name="Delete" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        students: [
                          ...draft.students,
                          { key: crypto.randomUUID(), name: "" },
                        ],
                      })
                    }
                  >
                    Add student
                  </button>
                </div>
                {formError ? (
                  <p role="alert" className="form-error">
                    {formError}
                  </p>
                ) : null}
                {draft.id ? (
                  <label className="field">
                    <span>
                      <input
                        type="checkbox"
                        checked={draft.suspended}
                        onChange={(event) =>
                          setDraft({ ...draft, suspended: event.target.checked })
                        }
                      />
                      Suspend access
                    </span>
                  </label>
                ) : null}
                <button className="button" disabled={busy}>
                  {busy ? "Saving…" : "Save family"}
                </button>
              </form>
            </Dialog>
          )}
          {removing && (
            <Dialog title="Delete family" onClose={() => setRemoving(null)}>
              <p>
                Delete {removing.name}? People in this family will lose access.
              </p>
              {formError ? (
                <p role="alert" className="form-error">
                  {formError}
                </p>
              ) : null}
              <div className="row">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setRemoving(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      try {
                        await api("admin/family", {
                          action: "delete",
                          id: removing.id,
                        });
                        setRemoving(null);
                        setFormError("");
                        await refresh();
                      } catch (error) {
                        setFormError(
                          error instanceof Error
                            ? error.message
                            : "Could not delete this family.",
                        );
                        throw error;
                      }
                    })
                  }
                >
                  {busy ? "Deleting…" : "Delete family"}
                </button>
              </div>
            </Dialog>
          )}
        </>
      )}
      {page === "Groups" && (
        <>
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await api("admin/member", {
                  action: "set",
                  familyId: family,
                  email,
                  role,
                  learnerId: role === "teacher" ? null : learner,
                });
                setLink(r.url ?? "");
                setEmail("");
                await refresh();
              });
            }}
          >
            <h2>Update a member</h2>
            <p className="muted">
              A person has one role in a group. Saving replaces that role. An email with no account yet receives an invitation link.
            </p>
            <div className="form-grid">
              <label className="field">
                Group
                <select
                  required
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                >
                  {data.families.map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Google email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field">
                Role
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="parent">Parent</option>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                </select>
              </label>
              <label className="field">
                Learner
                <select
                  required={role !== "teacher"}
                  disabled={role === "teacher"}
                  value={role === "teacher" ? "" : learner}
                  onChange={(e) => setLearner(e.target.value)}
                >
                  {role === "teacher" ? (
                    <option value="">Teachers are not linked to a learner</option>
                  ) : (
                    data.families
                      .find((f: any) => f.id === family)
                      ?.learners.map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))
                  )}
                </select>
              </label>
            </div>
            <button className="button" disabled={busy || !family || (role !== "teacher" && !learner)}>
              Save member
            </button>
            {link && (
              <label className="field">
                Share this single-use link
                <input readOnly value={link} />
              </label>
            )}
          </form>
          <div className="grid" style={{ marginTop: 24 }}>
            {data.families.map((f: any) => (
              <section className="card" key={f.id}>
                <h2>{f.name}</h2>
                {f.members?.length ? (
                  f.members.map((member: any) => (
                    <div className="list-item row" key={member.email}>
                      <div>
                        <strong>{member.email}</strong>
                        <p className="muted" style={{ margin: 0 }}>
                          {member.role}
                          {member.learner_name ? ` · ${member.learner_name}` : ""}
                        </p>
                      </div>
                      <button
                        className="link-button"
                        onClick={() =>
                          run(async () => {
                            await api("admin/member", {
                              action: "remove",
                              familyId: f.id,
                              email: member.email,
                            });
                            await refresh();
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">No members yet.</p>
                )}
              </section>
            ))}
          </div>
        </>
      )}
      {page === "Invitations" && (
        <>
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await api("admin/invite", {
                  familyId: family,
                  learnerId: role === "teacher" ? null : learner,
                  email,
                  role,
                });
                setLink(r.url);
                await refresh();
              });
            }}
          >
            <div className="form-grid">
              <label className="field">
                Family
                <select
                  required
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                >
                  {data.families.map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {role === "teacher" ? "Learner" : "Linked learner"}
                <select
                  required={role !== "teacher"}
                  disabled={role === "teacher"}
                  value={role === "teacher" ? "" : learner}
                  onChange={(e) => setLearner(e.target.value)}
                >
                  {role === "teacher" ? (
                    <option value="">Teachers are not linked to a learner</option>
                  ) : (
                    data.families
                      .find((f: any) => f.id === family)
                      ?.learners.map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))
                  )}
                </select>
              </label>
              <label className="field">
                Google email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field">
                Role
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="parent">Parent</option>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                </select>
              </label>
            </div>
            <button className="button" disabled={busy || (role !== "teacher" && !learner)}>
              Create seven-day invitation
            </button>
            {link && (
              <label className="field">
                Share this single-use link
                <input readOnly value={link} />
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => navigator.clipboard.writeText(link)}
                >
                  Copy invitation link
                </button>
              </label>
            )}
          </form>
          <section className="card" style={{ marginTop: 24 }}>
            {data.invitations.map((i: any) => (
              <div className="list-item row" key={i.id}>
                <div>
                  <strong>{i.email}</strong>
                  <p className="muted" style={{ margin: 0 }}>
                    {i.role} · expires {date(i.expires_at)} ·{" "}
                    {i.accepted_at
                      ? "accepted"
                      : i.revoked_at
                        ? "revoked"
                        : "pending"}
                  </p>
                </div>
                {!i.accepted_at && !i.revoked_at && (
                  <button
                    className="link-button"
                    onClick={() =>
                      run(async () => {
                        await api("admin/operation", {
                          action: "revoke",
                          id: i.id,
                        });
                        await refresh();
                      })
                    }
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
      {page === "Catalogue" && (
        <>
          {selected ? (
            <>
              <button className="link-button" onClick={() => setSelected(null)}>
                ← All papers
              </button>
              <h2 style={{ marginTop: 20 }}>
                {selected.data.title} · version {selected.version}
              </h2>
              <div className="catalogue-review">
                <div>
                  <label className="field">
                    Original source
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                    >
                      {selected.data.sourceIds.map((s: string, i: number) => (
                        <option key={s} value={s}>
                          Source document {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <iframe
                    title="Original PDF pages"
                    src={`/api/source/${source}`}
                  />
                </div>
                <div className="stack">
                  <label className="field">
                    Structured paper · compare every question and rubric
                    <textarea
                      className="json-editor"
                      style={{ minHeight: 560 }}
                      value={json}
                      disabled={selected.status === "published"}
                      onChange={(e) => setJson(e.target.value)}
                    />
                  </label>
                  <p className="muted">
                    Confirm exact wording, sources, all permitted mark totals,
                    typed-answer compatibility, and distribution permission.
                    Approval and publication are separate actions.
                  </p>
                </div>
              </div>
              {selected.issues.length > 0 && (
                <div className="error">{selected.issues.join(" ")}</div>
              )}
              <div className="row" style={{ marginTop: 20 }}>
                {selected.status !== "published" && (
                  <>
                    <button
                      className="button secondary"
                      onClick={() =>
                        run(async () => {
                          await api("admin/catalogue", {
                            id: selected.id,
                            action: "save",
                            paper: JSON.parse(json),
                          });
                          setSelected(null);
                          await refresh();
                        })
                      }
                    >
                      Save corrections
                    </button>
                    <button
                      className="button"
                      onClick={() =>
                        run(async () => {
                          await api("admin/catalogue", {
                            id: selected.id,
                            action: "approve",
                            paper: JSON.parse(json),
                          });
                          setSelected(null);
                          await refresh();
                        })
                      }
                    >
                      Approve reviewed content
                    </button>
                    {selected.status === "approved" && (
                      <button
                        className="button"
                        onClick={() =>
                          run(async () => {
                            await api("admin/catalogue", {
                              id: selected.id,
                              action: "publish",
                            });
                            setSelected(null);
                            await refresh();
                          })
                        }
                      >
                        Publish approved version
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              {data.catalogue.length === 0 && (
                <Empty
                  title="Ready for the source collection"
                  text="Run the local importer against your downloaded paper folder, then review staged papers here."
                />
              )}
              {data.catalogue.map((p: any) => (
                <section
                  key={p.id}
                  className="card row"
                  style={{ marginBottom: 15 }}
                >
                  <div>
                    <h3>{p.data.title}</h3>
                    <p className="muted">
                      {p.data.unit} · {p.data.session} {p.data.year} ·{" "}
                      {p.status}
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setSelected(p);
                      setJson(JSON.stringify(p.data, null, 2));
                      setSource(p.data.sourceIds[0]);
                    }}
                  >
                    Review with original
                  </button>
                </section>
              ))}
            </>
          )}
        </>
      )}
      {page === "Operations" && (
        <>
          <div className="grid">
            <section className="card stack">
              <h2>Marking configuration</h2>
              <p className="muted">
                Prices use EUR micro-units per million tokens. New attempts pin
                this configuration. Auto-release remains disabled without a
                passing evaluation.
              </p>
              <label className="field">
                Rate card
                <textarea
                  className="json-editor"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </label>
              <button
                className="button"
                onClick={() =>
                  run(async () => {
                    await api("admin/operation", {
                      action: "rate",
                      rate: JSON.parse(rate),
                    });
                    await refresh();
                  })
                }
              >
                Activate rate card
              </button>
            </section>
            <section className="card stack">
              <h2>Operational evidence</h2>
              <label className="field">
                Check
                <select
                  value={check}
                  onChange={(e) => setCheck(e.target.value)}
                >
                  <option value="restore_test">Backup restore test</option>
                  <option value="merchant_review">
                    Merchant and refund review
                  </option>
                  <option value="catalogue_permission">
                    Catalogue-use permission
                  </option>
                </select>
              </label>
              <label className="field">
                Evidence and outcome
                <textarea
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </label>
              <button
                className="button secondary"
                onClick={() =>
                  run(async () => {
                    await api("admin/operation", {
                      action: "check",
                      key: check,
                      evidence,
                    });
                    await refresh();
                  })
                }
              >
                Record completed check
              </button>
              <hr />
              <h3>Pilot test credit</h3>
              <label className="field">
                Workspace
                <select
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                >
                  {data.families.map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button secondary"
                onClick={() =>
                  run(async () => {
                    await api("admin/operation", {
                      action: "test_credit",
                      familyId: family,
                      micros: 10000000,
                    });
                  })
                }
              >
                Add €10 test credit
              </button>
              <p className="muted">
                Test credit is unavailable when real-money payments are enabled.
              </p>
            </section>
          </div>
          <section className="card" style={{ marginTop: 24 }}>
            <h2>Processing exceptions</h2>
            {data.jobs.map((j: any) => (
              <div className="list-item" key={j.id}>
                {j.kind} · {j.state} · {j.attempts} attempts{" "}
                <span className="muted">{j.last_error}</span>
                {["failed", "running"].includes(j.state) && (
                  <button
                    className="button secondary small"
                    onClick={() =>
                      run(async () => {
                        await api("admin/operation", {
                          action: "recover_job",
                          id: j.id,
                        });
                        await refresh();
                      })
                    }
                  >
                    Recover interrupted job
                  </button>
                )}
              </div>
            ))}
            {!data.jobs.length && <p className="muted">No outstanding jobs.</p>}
          </section>
        </>
      )}
    </>
  );
}
