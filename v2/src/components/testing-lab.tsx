"use client";
import { useEffect, useState } from "react";
import { createAuthClient } from "better-auth/react";
import { testAccounts, isTestAccount } from "../lib/test-accounts";
import { Brand, Button } from "./ui";
async function testingRequest(body?: object) {
  const response = await fetch("/api/testing", {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "The test action could not complete.");
  return data;
}
export function TestingLab() {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function enter(email: string, exam = false) {
    setBusy(email);
    setError("");
    try {
      const client = createAuthClient({ baseURL: location.origin });
      await client.signOut();
      const result = await client.signIn.email({ email, password });
      if (result.error)
        throw new Error(result.error.message ?? "Check the test password.");
      if (exam) {
        const example = await testingRequest({
          action: "exam",
          subject: "psychology",
          requestId: crypto.randomUUID(),
        });
        location.assign(example.url);
      } else location.assign("/");
    } catch (e: any) {
      setError(e.message);
      setBusy("");
    }
  }
  return (
    <main className="testing-lab">
      <Brand />
      <p className="eyebrow">TEST WORKSPACES</p>
      <h1>Choose a person. Try their day.</h1>
      <p>
        Populated fictional families for UX and workflow testing. These accounts
        use the application’s normal permissions. Marking is simulated and
        always goes to teacher review.
      </p>
      <label className="field test-password">
        Shared test password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="test-account-grid">
        {testAccounts.map((account) => (
          <article
            className={`test-account persona-${account.role === "mixed" ? "teacher" : account.role}`}
            key={account.id}
          >
            <p className="eyebrow">
              {account.role === "mixed"
                ? "PARENT + TEACHER"
                : account.role.toUpperCase()}{" "}
              · {account.family}
            </p>
            <h2>{account.name}</h2>
            <p>{account.scenario}</p>
            <small>{account.email}</small>
            <Button
              disabled={!password || !!busy}
              onClick={() => enter(account.email)}
            >
              {busy === account.email
                ? "Signing in…"
                : `Sign in as ${account.name.split(" ")[0]}`}
            </Button>
            {account.role === "student" && account.key !== "casey" && (
              <Button
                variant="secondary"
                disabled={!password || !!busy}
                onClick={() => enter(account.email, true)}
              >
                Open exam example as {account.name.split(" ")[0]}
              </Button>
            )}
          </article>
        ))}
      </div>
      <p>
        <a href="/">Return to normal sign-in</a>
      </p>
    </main>
  );
}
export function TestLoginLink() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/testing")
      .then((r) => {
        if (r.ok) setEnabled(true);
      })
      .catch(() => {});
  }, []);
  return enabled ? (
    <p className="login-foot">
      <a href="/testing">Open test workspaces · no Google account needed</a>
    </p>
  ) : null;
}
export function TestingTools({
  email,
  role,
  familyId,
}: {
  email: string;
  role: string;
  familyId: string;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (!isTestAccount(email)) return null;
  async function run(action: string) {
    setBusy(true);
    setNotice("");
    try {
      const result = await testingRequest({
        action,
        familyId,
        requestId: crypto.randomUUID(),
      });
      if (result.url) {
        location.assign(result.url);
        return;
      }
      setNotice(result.message);
      if (action === "credit") location.reload();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="testing-tools" aria-label="Test workspace tools">
      <strong>UX test account · simulated data</strong>
      <a href="/testing">Switch test account</a>
      {role === "student" && (
        <Button variant="secondary" disabled={busy} onClick={() => run("exam")}>
          Open exam example
        </Button>
      )}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => run("process")}
      >
        Run test processing
      </Button>
      {role === "parent" && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => run("credit")}
        >
          Add €10 test credit
        </Button>
      )}
      {notice && <span role="status">{notice}</span>}
    </aside>
  );
}
