"use client";
import { useState, type ReactNode } from "react";
import { Brand, Dialog, Icon } from "./ui";
import { pageLabels, personas, type Persona } from "../lib/personas";
import { TestingTools } from "./testing-lab";

export function PersonaShell({
  role,
  page,
  identity,
  context,
  contexts,
  focus,
  onContext,
  onPage,
  onSignOut,
  children,
}: {
  role: Persona;
  page: string;
  identity: any;
  context: string;
  contexts: { id: string; name: string }[];
  focus: boolean;
  onContext: (id: string) => void;
  onPage: (page: string) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const config = personas[role];
  const active =
    page === "Study" ? "Subjects" : page === "Papers" ? "Practice" : page;
  const navigation = (
    <nav className="persona-nav" aria-label="Main navigation">
      {config.pages.map((item) => (
        <button
          key={item}
          className={`nav-button ${active === item && !focus ? "active" : ""}`}
          aria-current={active === item && !focus ? "page" : undefined}
          disabled={focus}
          onClick={() => {
            onPage(item);
            setMenu(false);
          }}
        >
          <Icon name={item === "Content" ? "Catalogue" : item} />
          <span>{pageLabels[item] ?? item}</span>
        </button>
      ))}
    </nav>
  );
  const contextPicker =
    contexts.length > 1 ? (
      <label className="field context-picker">
        Workspace
        <select
          value={context}
          disabled={focus}
          onChange={(e) => {
            onContext(e.target.value);
            setMenu(false);
          }}
        >
          {contexts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
    ) : (
      <p className="workspace-name">{contexts[0]?.name}</p>
    );
  return (
    <div className={`shell persona-${role} ${focus ? "focus-mode" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="persona-mark">
            <Icon
              name={
                role === "superuser"
                  ? "Operations"
                  : role[0].toUpperCase() + role.slice(1)
              }
            />
          </span>
          <strong>{config.label}</strong>
        </div>
        {contextPicker}
        {navigation}
        <div className="sidebar-footer">
          <strong>{config.description}</strong>
          <br />
          GotFoth · Made for your next step
        </div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div className="row">
            <button
              className="button secondary mobile-menu"
              onClick={() => setMenu(true)}
              disabled={focus}
              aria-expanded={menu}
            >
              Menu
            </button>
            <span className="context-title">
              {config.label}
              <small>
                {contexts.find((item) => item.id === context)?.name}
              </small>
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="link-button"
              disabled={focus}
              onClick={() => onPage("Reminders")}
            >
              Reminders
            </button>
            <button
              className="link-button"
              aria-label="Toggle larger text"
              onClick={() => {
                const enlarged =
                  document.documentElement.style.fontSize === "19px";
                document.documentElement.style.fontSize = enlarged
                  ? "16px"
                  : "19px";
                localStorage.setItem(
                  "gotfoth:large-text",
                  enlarged ? "false" : "true",
                );
              }}
            >
              Aa
            </button>
            <button
              disabled={focus}
              aria-label="Your account"
              className="account-link link-button"
              onClick={() => onPage("Account")}
            >
              <span className={`account-avatar ${role}`}>
                {(identity.user.name || identity.user.email)
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <span className="account-who">
                <strong>{identity.user.name || identity.user.email}</strong>
                <span>
                  {role === "superuser"
                    ? "Administrator"
                    : role[0].toUpperCase() + role.slice(1)}
                </span>
              </span>
            </button>
            <button
              disabled={focus}
              className="link-button sign-out"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </header>
        {!focus && (
          <TestingTools
            email={identity.user.email}
            role={role}
            familyId={context}
          />
        )}
        {children}
      </main>
      {!focus && role === "student" && (
        <div className="student-bottom-nav">{navigation}</div>
      )}
      {menu && (
        <Dialog title="Your workspace" onClose={() => setMenu(false)}>
          <Brand />
          {contextPicker}
          {navigation}
          <button
            className="button secondary"
            onClick={() => {
              setMenu(false);
              onPage("Account");
            }}
          >
            Account
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

// A small book companion drawn as a native vector so it stays sharp at every size.
export function StudyCompanion({ celebrate = false }: { celebrate?: boolean }) {
  return (
    <svg
      className={`study-companion ${celebrate ? "celebrate" : ""}`}
      viewBox="0 0 200 180"
      role="img"
      aria-label={
        celebrate
          ? "Your study companion celebrates a completed session"
          : "Your friendly study companion"
      }
    >
      <circle cx="101" cy="89" r="77" fill="var(--companion-halo, #e4ecf6)" />
      <path
        d="M35 57Q65 36 97 51V136Q64 121 35 136Z"
        fill="#fff"
        stroke="#183b67"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M97 51Q132 37 163 57V136Q129 120 97 136Z"
        fill="#dce7f4"
        stroke="#183b67"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M97 52V137M54 70L76 68M121 67L144 72"
        fill="none"
        stroke="#183b67"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="75" cy="90" r="5" fill="#142b50" />
      <circle cx="122" cy="90" r="5" fill="#142b50" />
      <path
        d="M87 105Q99 118 111 105"
        fill="none"
        stroke="#142b50"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M56 137L49 151M139 137L148 151M34 97L21 88M164 97L178 81"
        stroke="#183b67"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M164 22L167 31L177 34L167 37L164 47L161 37L151 34L161 31Z"
        fill="#b31f3a"
      />
      <circle cx="24" cy="40" r="5" fill="#b31f3a" />
    </svg>
  );
}
