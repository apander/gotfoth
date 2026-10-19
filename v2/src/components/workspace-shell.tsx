"use client";
import { useState, type ComponentProps } from "react";
import { PersonaShell } from "./persona-shell";
import { Brand, Dialog, Icon } from "./ui";
import { companionPages, type Experience } from "../lib/experience";
import { pageLabels, personas } from "../lib/personas";
import { TestingTools } from "./testing-lab";

export { useExperience } from "./use-experience";
type Props = ComponentProps<typeof PersonaShell> & { experience: Experience };
export function WorkspaceShell(props: Props) {
  return props.experience === "companion" ? (
    <CompanionShell {...props} />
  ) : (
    <PersonaShell {...props} />
  );
}
function CompanionShell({
  role,
  page,
  identity,
  context,
  contexts,
  onContext,
  onPage,
  onSignOut,
  children,
}: Props) {
  const [menu, setMenu] = useState(false);
  const label = (p: string) =>
    p === "Plan"
      ? "Diary"
      : role === "superuser" && p === "Overview"
        ? "Status"
        : (pageLabels[p] ?? p);
  return (
    <div
      className={`companion-shell persona-${role}`}
      data-experience="companion"
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="companion-header">
        <Brand />
        <button
          className="companion-account"
          onClick={() => setMenu(true)}
          aria-label="Your account and workspaces"
        >
          <span className={`account-avatar ${role}`}>
            {(identity.user.name || identity.user.email)
              .slice(0, 1)
              .toUpperCase()}
          </span>
        </button>
      </header>
      <div className="companion-context">
        <strong>{personas[role].label}</strong>
        <span>{contexts.find((c) => c.id === context)?.name}</span>
      </div>
      <main id="main-content" className="companion-main" tabIndex={-1}>
        <TestingTools
          email={identity.user.email}
          role={role}
          familyId={context}
          companion
        />
        {children}
      </main>
      <nav className="companion-nav" aria-label="Main navigation">
        {companionPages[role].map((p) => (
          <button
            key={p}
            aria-current={page === p ? "page" : undefined}
            className={page === p ? "active" : ""}
            onClick={() => onPage(p)}
          >
            <Icon name={p} />
            <span>{label(p)}</span>
          </button>
        ))}
      </nav>
      {menu && (
        <Dialog
          title="Your account and workspaces"
          onClose={() => setMenu(false)}
        >
          <p>{identity.user.name}</p>
          <label className="field">
            Workspace
            <select
              value={context}
              onChange={(e) => {
                onContext(e.target.value);
                setMenu(false);
              }}
            >
              {contexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button secondary"
            onClick={() => {
              onPage("Account");
              setMenu(false);
            }}
          >
            Account settings
          </button>
          <button
            className="button secondary"
            onClick={() => {
              document.documentElement.style.fontSize =
                document.documentElement.style.fontSize === "19px"
                  ? "16px"
                  : "19px";
              localStorage.setItem(
                "gotfoth:large-text",
                String(document.documentElement.style.fontSize === "19px"),
              );
            }}
          >
            Change text size
          </button>
          <button
            className="link-button"
            onClick={() => {
              setMenu(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </Dialog>
      )}
    </div>
  );
}
