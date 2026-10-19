"use client";
import { useState } from "react";
import { api, date, euro } from "./api";
import { Button, Dialog, Empty, PageHeading } from "./ui";
import { friendlyStatus } from "../lib/personas";
import { score } from "./revision";

export function ParentSpace({
  page,
  data,
  learner,
  onLearner,
  onPage,
  onAssessment,
}: any) {
  const people =
    page === "Overview"
      ? data.learners
      : data.learners.filter((l: any) => l.id === learner);
  const funding = data.assessments.some(
    (a: any) => a.state === "awaiting_funds",
  );
  const available =
    Number(data.wallet?.balance ?? 0) - Number(data.wallet?.reserved ?? 0);
  const lowBalance = !!data.wallet && available < 1000000;
  return (
    <>
      <PageHeading
        label="HERE TO SUPPORT THEM"
        title={
          page === "Overview"
            ? "A window into their week."
            : "Progress, at their pace."
        }
        text="See what they’ve been working on, celebrate their effort, and help when it’s needed."
      />
      {page === "Overview" && (
        <section
          className={`parent-banner ${funding || lowBalance ? "attention" : ""}`}
        >
          <div>
            <h2>
              {funding
                ? "A little help is needed."
                : lowBalance
                  ? "Family credit is running low."
                  : "Room to learn. Support when it matters."}
            </h2>
            <p>
              {funding
                ? "Your child’s work is saved. Review the balance and monthly limits to let marking continue. They can keep practising."
                : lowBalance
                  ? `${euro(available)} is available for marking. You can add credit here; your child can keep practising.`
                  : "Your child chooses their subjects and practice. You can follow their progress here."}
            </p>
          </div>
          <button className="button secondary" onClick={() => onPage("Credit")}>
            {funding || lowBalance ? "Review funding" : "Manage funding"}
          </button>
        </section>
      )}
      {page === "Progress" && (
        <label className="field child-selector">
          Child
          <select value={learner} onChange={(e) => onLearner(e.target.value)}>
            {data.learners.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="parent-children">
        {people.map((l: any) => {
          const results = data.assessments.filter(
            (a: any) => a.learner_id === l.id && a.state === "published",
          );
          const attempts = data.attempts.filter(
            (a: any) => a.learner_id === l.id,
          );
          const sessions = data.sessions.filter(
            (s: any) =>
              s.learner_id === l.id &&
              s.state === "approved" &&
              new Date(s.data.start) >= new Date(),
          );
          return (
            <section className="child-story" key={l.id}>
              <div className="section-title">
                <div>
                  <p className="eyebrow">THEIR LEARNING</p>
                  <h2>{l.name}</h2>
                </div>
                <span className="child-avatar">{l.name.slice(0, 1)}</span>
              </div>
              <div className="subject-tags">
                {data.enrolments
                  .filter((e: any) => e.learner_id === l.id)
                  .map((e: any) => (
                    <span
                      className={`subject-tag ${e.data.subject}`}
                      key={e.id}
                    >
                      {e.data.subject} · {e.data.targetSession}
                    </span>
                  ))}
              </div>
              <p>
                {attempts.length
                  ? `Last practice activity: ${date(attempts[0].started_at ?? attempts[0].created_at)}.`
                  : "No practice activity yet. There’s plenty of room for a first step."}
              </p>
              {page === "Progress" && (
                <div className="parent-subject-summaries">
                  {data.enrolments
                    .filter((e: any) => e.learner_id === l.id)
                    .map((e: any) => {
                      const latest = results.find(
                        (r: any) => r.subject === e.data.subject,
                      );
                      const marks = score(latest?.effective);
                      return (
                        <section key={e.id}>
                          <h3 className="capitalize">{e.data.subject}</h3>
                          <p>
                            {marks
                              ? `Latest published result: ${marks.awarded} of ${marks.available} marks. Practice conditions and question difficulty matter.`
                              : "No published evidence for this subject yet."}
                          </p>
                        </section>
                      );
                    })}
                </div>
              )}
              <h3>Published feedback</h3>
              {results.slice(0, page === "Overview" ? 2 : 12).map((a: any) => {
                const marks = score(a.effective);
                return (
                  <button
                    className="parent-result"
                    key={a.id}
                    onClick={() => onAssessment(a.id)}
                  >
                    <span>
                      {a.subject && (
                        <span className="capitalize">{a.subject} · </span>
                      )}
                      {friendlyStatus(a.mode)}
                      <small>{date(a.submitted_at)}</small>
                    </span>
                    <strong>
                      {marks
                        ? `${marks.awarded} / ${marks.available}`
                        : "View feedback"}{" "}
                      →
                    </strong>
                  </button>
                );
              })}
              {!results.length && (
                <p className="empty-inline">
                  No published feedback yet. This is missing evidence, not a low
                  score.
                </p>
              )}
              <h3>Coming up</h3>
              {sessions.slice(0, 3).map((s: any) => (
                <p key={s.id}>
                  {s.data.title}
                  <small className="meta">
                    {" "}
                    {date(s.data.start)} · {s.data.minutes} minutes
                  </small>
                </p>
              ))}
              {!sessions.length && (
                <p className="muted">No upcoming study sessions planned.</p>
              )}
              {page === "Overview" && (
                <button
                  className="link-button"
                  onClick={() => {
                    onLearner(l.id);
                    onPage("Progress");
                  }}
                >
                  See {l.name.split(" ")[0]}’s progress →
                </button>
              )}
            </section>
          );
        })}
      </div>
      {!people.length && (
        <Empty
          title="Your family space is ready"
          text="Your children will appear here when their access is set up."
        />
      )}
    </>
  );
}

export function Funding({ familyId, data, refresh, run, busy }: any) {
  const [saved, setSaved] = useState("");
  return (
    <>
      <PageHeading
        label="FAMILY FUNDING"
        title="A clear view of your credit."
        text="You decide the budget. No automatic top-ups."
      />
      {data.wallet?.awaiting?.length > 0 && (
        <section className="card stack" style={{ marginBottom: 24 }}>
          <h2>Work waiting for marking</h2>
          <p>
            Your child’s answers are saved. Adding credit or increasing a
            monthly limit resumes eligible marking automatically. They do not
            need to resubmit.
          </p>
          {data.wallet.awaiting.map((item: any) => (
            <div className="list-item" key={item.id}>
              <strong>
                {item.name} · {item.subject}
              </strong>
              <p>
                Maximum marking cost: {euro(item.max_charge)}.{" "}
                {Number(item.remaining_cap) < Number(item.max_charge)
                  ? "Increase this child’s monthly limit below."
                  : "Check that the available balance covers this work."}
              </p>
            </div>
          ))}
        </section>
      )}
      <div className="funding-grid">
        <section className="balance-panel">
          <p className="eyebrow">AVAILABLE TO SPEND</p>
          <div className="metric">
            {euro(
              Number(data.wallet?.balance ?? 0) -
                Number(data.wallet?.reserved ?? 0),
            )}
          </div>
          <p>
            {euro(data.wallet?.reserved ?? 0)} reserved for marking already
            authorised.
          </p>
          <p className="muted">
            Total balance: {euro(data.wallet?.balance ?? 0)}
          </p>
          <div className="row">
            {[1000, 2500].map((cents) => (
              <Button
                key={cents}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await api("family/checkout", {
                      familyId,
                      cents,
                    });
                    location.assign(result.url);
                  })
                }
              >
                Add €{cents / 100}
              </Button>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>Monthly limits</h2>
          <p className="muted">Adding credit does not change these limits.</p>
          {data.learners.map((l: any) => (
            <form
              key={`${l.id}:${l.monthly_cap}`}
              className="limit-form"
              onSubmit={(e) => {
                e.preventDefault();
                const input = new FormData(e.currentTarget);
                run(async () => {
                  await api("family/action", {
                    familyId,
                    action: "cap",
                    learnerId: l.id,
                    micros: Math.round(Number(input.get("limit")) * 1e6),
                  });
                  await refresh();
                  setSaved(`Monthly limit saved for ${l.name}.`);
                });
              }}
            >
              <label className="field">
                {l.name} · EUR
                <input
                  name="limit"
                  required
                  type="number"
                  min="0"
                  max="1000"
                  step="1"
                  defaultValue={Number(l.monthly_cap) / 1e6}
                />
              </label>
              <Button variant="secondary" disabled={busy}>
                Save limit
              </Button>
            </form>
          ))}
          {saved && (
            <p role="status" className="notice">
              {saved}
            </p>
          )}
        </section>
      </div>
      <section className="section">
        <h2>Account activity</h2>
        {data.wallet?.ledger?.map((l: any, i: number) => (
          <div className="list-item row" key={i}>
            <span>
              {date(l.created_at)} · {String(l.kind).replaceAll("_", " ")}
            </span>
            <strong>{euro(l.amount)}</strong>
          </div>
        ))}
        {!data.wallet?.ledger?.length && (
          <Empty
            title="No transactions yet"
            text="Credit purchases and marking charges will appear here."
          />
        )}
      </section>
    </>
  );
}

export function FamilyDataSettings({ familyId, run, busy }: any) {
  const [confirming, setConfirming] = useState(false),
    [confirmation, setConfirmation] = useState("");
  return (
    <>
      <PageHeading
        label="FAMILY SETTINGS"
        title="Your family’s data."
        text="Download your records or request removal of this family’s workspace."
      />
      <section className="card stack">
        <h2>Keep a copy</h2>
        <p>Export the learner records you’re authorised to access.</p>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const result = await api("family/action", {
                familyId,
                action: "export",
              });
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(result, null, 2)], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "gotfoth-family.json";
              link.click();
              URL.revokeObjectURL(url);
            })
          }
        >
          Export family records
        </Button>
      </section>
      <section className="danger-zone">
        <h2>Remove family workspace</h2>
        <p>
          This requests removal within 30 days. The server checks that you are
          linked to every learner.
        </p>
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Request family deletion
        </Button>
      </section>
      {confirming && (
        <Dialog
          title="Request family deletion"
          onClose={() => setConfirming(false)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("family/action", {
                  familyId,
                  action: "delete",
                  confirmation,
                });
                location.reload();
              });
            }}
          >
            <p>
              Everyone in this family will lose access. Type DELETE FAMILY to
              confirm your request.
            </p>
            <label className="field">
              Confirmation
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <Button disabled={busy || confirmation !== "DELETE FAMILY"}>
              Request deletion
            </Button>
          </form>
        </Dialog>
      )}
    </>
  );
}
