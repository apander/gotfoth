"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Empty, PageHeading } from "./ui";
export function OperatorOverview({
  onPage,
}: {
  onPage: (page: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api("admin")
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!data) return <p role="status">Loading operational overview…</p>;
  const pending = data.invitations.filter(
    (i: any) =>
      !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date(),
  );
  const unpublished = data.catalogue.filter(
    (p: any) => p.status !== "published",
  );
  const failures = data.jobs.filter(
    (j: any) => j.state === "failed" || j.last_error,
  );
  return (
    <>
      <PageHeading
        label="ADMINISTRATION / OVERVIEW"
        title="Keep learning moving."
        text="Access, content and processing. The queues that need an operator’s attention."
      />
      <div className="operator-metrics">
        {[
          [data.families.length, "Family workspaces", "Families"],
          [pending.length, "Pending invitations", "Invitations"],
          [unpublished.length, "Catalogue versions to publish", "Content"],
          [failures.length, "Processing exceptions", "Operations"],
        ].map(([count, label, page]) => (
          <button key={String(page)} onClick={() => onPage(String(page))}>
            <span>{label}</span>
            <strong>{count}</strong>
            <small>Open queue →</small>
          </button>
        ))}
      </div>
      <section className="operator-worklist">
        <div>
          <p className="eyebrow">WORKSPACE ACCESS</p>
          <h2>Give every person the right place.</h2>
          <p>Manage families, review membership and track invitations.</p>
          <button
            className="button secondary"
            onClick={() => onPage("Families")}
          >
            Manage families
          </button>
        </div>
        <div>
          <p className="eyebrow">CONTENT WORKFLOW</p>
          <h2>From source paper to practice.</h2>
          <p>
            Browse papers, review extracted questions and publish checked
            catalogue versions.
          </p>
          <button
            className="button secondary"
            onClick={() => onPage("Content")}
          >
            Open content desk
          </button>
        </div>
      </section>
      <section className="section">
        <h2>Processing attention</h2>
        {failures.slice(0, 6).map((job: any, i: number) => (
          <div className="list-item row" key={job.id ?? i}>
            <span>
              {job.kind ?? "Processing job"} · {job.state ?? "Needs attention"}
            </span>
            <button
              className="link-button"
              onClick={() => onPage("Operations")}
            >
              Inspect exception →
            </button>
          </div>
        ))}
        {!failures.length && (
          <Empty
            title="No processing exceptions in the current queue"
            text="Operational failures will appear here when action is needed."
          />
        )}
      </section>
    </>
  );
}
