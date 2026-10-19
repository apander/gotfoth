"use client";
import { useState } from "react";
import { useRead } from "./workspace-data";
import { friendlyStatus } from "../lib/personas";
import { Icon } from "./ui";
export function DesktopHandoff({
  title = "Continue on a computer",
  href,
  familyId,
  attempt,
  children,
}: {
  title?: string;
  href: string;
  familyId?: string;
  attempt?: string;
  children?: React.ReactNode;
}) {
  const { data, error } = useRead(
    attempt && familyId
      ? `family/attempt-summary?family=${familyId}&id=${attempt}`
      : null,
  );
  const [message, setMessage] = useState("");
  const absolute =
    typeof location === "undefined"
      ? href
      : new URL(href, location.origin).href;
  return (
    <section className="desktop-handoff" aria-label="Continue on a computer">
      <Icon name="Desktop" />
      <h2>{title}</h2>
      <p>
        Use a laptop or desktop for this workspace. Your plans, progress and
        feedback are available in this companion.
      </p>
      {children}
      {data && (
        <dl className="handoff-details">
          <dt>Subject</dt>
          <dd className="capitalize">{data.subject}</dd>
          <dt>Task</dt>
          <dd>
            {friendlyStatus(data.mode)} · {data.duration_minutes} minutes
          </dd>
          <dt>Status</dt>
          <dd>{friendlyStatus(data.state)}</dd>
          <dt>Saved</dt>
          <dd>
            {data.saved_at
              ? new Date(data.saved_at).toLocaleString()
              : "Ready to start"}
          </dd>
          {data.deadline && (
            <>
              <dt>Deadline</dt>
              <dd>
                {new Date(data.deadline).toLocaleString()} — keeps running while
                this screen is open.
              </dd>
            </>
          )}
        </dl>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="row">
        <button
          className="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(absolute);
              setMessage("Link copied. Open it on your computer and sign in.");
            } catch {
              setMessage("Copy the link below and open it on your computer.");
            }
          }}
        >
          Copy computer link
        </button>
        {typeof navigator !== "undefined" && !!navigator.share && (
          <button
            className="button secondary"
            onClick={() =>
              navigator.share({ title, url: absolute }).catch(() => {})
            }
          >
            Share link
          </button>
        )}
      </div>
      <label className="field">
        Computer link
        <input readOnly value={absolute} onFocus={(e) => e.target.select()} />
      </label>
      <p role="status">{message}</p>
    </section>
  );
}
export function ReadState({
  error,
  refresh,
}: {
  error: string;
  refresh: () => void;
}) {
  return error ? (
    <div className="error" role="alert">
      {error}
      <button className="button secondary" onClick={refresh}>
        Try again
      </button>
    </div>
  ) : (
    <p role="status" className="loading">
      Opening your workspace…
    </p>
  );
}
export function Pagination({
  offset,
  total,
  limit,
  onChange,
}: {
  offset: number;
  total: number;
  limit: number;
  onChange: (offset: number) => void;
}) {
  return total > limit ? (
    <nav className="pagination row" aria-label="Results pages">
      <button
        className="button secondary"
        disabled={!offset}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        Previous
      </button>
      <span>
        {offset + 1}–{Math.min(total, offset + limit)} of {total}
      </span>
      <button
        className="button secondary"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        Next
      </button>
    </nav>
  ) : null;
}
