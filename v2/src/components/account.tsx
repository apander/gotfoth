"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Button, Dialog, PageHeading } from "./ui";

export function AccountPage({
  run,
  busy,
  onDeleted,
  onRenamed,
}: {
  run: (fn: () => Promise<void>) => void;
  busy: boolean;
  onDeleted: () => Promise<void>;
  onRenamed: (name: string) => void;
}) {
  const [account, setAccount] = useState<any>(null),
    [name, setName] = useState(""),
    [saved, setSaved] = useState(""),
    [confirming, setConfirming] = useState(false),
    [confirmEmail, setConfirmEmail] = useState(""),
    [formError, setFormError] = useState("");
  useEffect(() => {
    run(async () => {
      const value = await api("account");
      setAccount(value);
      setName(value.name ?? "");
    });
  }, []);
  if (!account) return <div className="loading">Loading your account…</div>;
  return (
    <>
      <PageHeading
        label="ACCOUNT"
        title="Your account."
        text="Update your name, or delete this sign-in. Every signed-in person can do this."
      />
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved("");
          if (!name.trim()) return;
          run(async () => {
            const value = await api("account", { name: name.trim() });
            setAccount(value);
            setName(value.name ?? "");
            onRenamed(value.name ?? name.trim());
            setSaved("Name saved.");
          });
        }}
      >
        <label className="field">
          Name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          Google email
          <input readOnly value={account.email} />
        </label>
        <p className="muted">
          {account.memberships?.length
            ? account.memberships
                .map(
                  (item: { family: string; role: string }) =>
                    `${item.family} · ${item.role[0].toUpperCase()}${item.role.slice(1)}`,
                )
                .join(", ")
            : "You are not in a family yet."}
          {account.superuser ? " · Administrator" : ""}
        </p>
        {saved ? (
          <p role="status" className="muted">
            {saved}
          </p>
        ) : null}
        <Button disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save name"}</Button>
      </form>
      <section className="card stack account-delete">
        <h2>Delete account</h2>
        <p className="muted">
          This removes your sign-in and your access. Family records and study
          work stay in place. You would need a new invitation to return.
        </p>
        <button
          type="button"
          className="button danger"
          disabled={busy}
          onClick={() => {
            setFormError("");
            setConfirmEmail("");
            setConfirming(true);
          }}
        >
          Delete account
        </button>
      </section>
      {confirming ? (
        <Dialog title="Delete account" onClose={() => setConfirming(false)}>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              setFormError("");
              run(async () => {
                try {
                  await api("account/delete", { email: confirmEmail.trim() });
                  setConfirming(false);
                  await onDeleted();
                } catch (error) {
                  setFormError(
                    error instanceof Error
                      ? error.message
                      : "Could not delete this account.",
                  );
                  throw error;
                }
              });
            }}
          >
            <p>
              Type {account.email} to delete this sign-in. This cannot be undone.
            </p>
            <label className="field">
              Email
              <input
                type="email"
                required
                autoFocus
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value)}
              />
            </label>
            {formError ? (
              <p role="alert" className="form-error">
                {formError}
              </p>
            ) : null}
            <div className="row">
              <button
                type="button"
                className="button secondary"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={
                  busy ||
                  confirmEmail.trim().toLowerCase() !== account.email.toLowerCase()
                }
              >
                {busy ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
