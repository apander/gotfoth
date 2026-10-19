"use client";
import { useState } from "react";
import { api } from "./api";
import { useRead } from "./workspace-data";
import { Pagination, ReadState } from "./desktop-handoff";
import { Button, Dialog, Empty, Icon } from "./ui";
import type { Destination } from "../lib/experience";
import type { Persona } from "../lib/personas";
export function Reminders({
  context,
  role,
  route,
  onRoute,
  run,
  busy,
}: {
  context: string;
  role: Persona;
  route: Destination;
  onRoute: (v: Destination) => void;
  run: (fn: () => Promise<void>) => void;
  busy: boolean;
}) {
  const read = useRead<import("../lib/workspace-contracts").ReminderInbox>(
    `reminders?${new URLSearchParams({ context, offset: route.offset ?? "0" })}`,
  );
  const [settings, setSettings] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  return (
    <section className="reminder-inbox" aria-label="Reminder inbox">
      <header className="reminder-inbox-header">
        <div className="reminder-inbox-title">
          <h1 tabIndex={-1}>Reminders</h1>
          {read.data && (
            <span className="reminder-unread-count">
              {read.data.unread} unread
            </span>
          )}
        </div>
        <div className="reminder-header-actions">
          <button
            className="reminder-icon-button"
            aria-label="Refresh reminders"
            title="Refresh reminders"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              await read.refresh();
              setRefreshing(false);
            }}
          >
            <Icon name="Refresh" />
          </button>
          <button
            className="reminder-icon-button"
            aria-label="Reminder settings"
            title="Reminder settings"
            disabled={!read.data}
            onClick={() => read.data && setSettings({ ...read.data.settings })}
          >
            <Icon name="Operations" />
          </button>
        </div>
      </header>
      <p role="status" className={notice ? "reminder-notice" : "sr-only"}>
        {refreshing ? "Refreshing reminders…" : notice}
      </p>
      {!read.data ? (
        <ReadState error={read.error} refresh={read.refresh} />
      ) : (
        <>
          <div
            className="reminder-list"
            aria-label="Current reminders"
            aria-busy={refreshing}
          >
            {read.data.items.map((item: any) => (
              <article
                key={item.key}
                className={`reminder-item ${item.read ? "" : "unread"}`}
              >
                <div className="reminder-item-content">
                  <span className="reminder-kind">
                    {item.actionable ? "Needs attention" : "Update"}
                    {!item.read && <span className="sr-only"> · Unread</span>}
                  </span>
                  <h2>
                    <button
                      className="reminder-open"
                      disabled={busy}
                      aria-label={`Open reminder: ${item.title}`}
                      onClick={() => {
                        run(async () => {
                          await api("reminders/action", {
                            context,
                            key: item.key,
                            action: "read",
                          });
                          const params = Object.fromEntries(
                            new URL(item.href, location.origin).searchParams,
                          );
                          onRoute({ attempt: "", assessment: "", ...params });
                        });
                      }}
                    >
                      <span>{item.title}</span>
                      <Icon name="Arrow" />
                    </button>
                  </h2>
                  <p className="reminder-detail">{item.detail}</p>
                  <div className="reminder-quick-actions">
                    {!item.read && (
                      <button
                        className="link-button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api("reminders/action", {
                              context,
                              key: item.key,
                              action: "read",
                            });
                            read.refresh();
                          })
                        }
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      className="link-button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api("reminders/action", {
                            context,
                            key: item.key,
                            action: "snooze",
                          });
                          read.refresh();
                          setNotice(
                            "Snoozed until tomorrow. The underlying task is unchanged.",
                          );
                        })
                      }
                    >
                      Until tomorrow
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!read.data.items.length && (
            <Empty
              title="You’re up to date"
              text="Current reminders will appear here when there is something to check."
            />
          )}
          <Pagination
            {...read.data}
            onChange={(offset) => onRoute({ offset: String(offset) })}
          />
        </>
      )}
      {settings && (
        <Dialog title="Reminder settings" onClose={() => setSettings(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("reminders/preferences", { context, settings });
                setSettings(null);
                read.refresh();
                setNotice("Reminder settings saved.");
              });
            }}
          >
            <p className="meta">
              This inbox updates when you open or refresh it. Calendar reminders
              work through Google Calendar.
            </p>
            <label className="field">
              Your timezone
              <input
                value={settings.timezone}
                required
                onChange={(e) =>
                  setSettings({ ...settings, timezone: e.target.value })
                }
              />
            </label>
            <p className="meta">
              “Until tomorrow” uses this timezone. Course diary timezones and
              weekly goals have their own settings.
            </p>
            {role === "student" && (
              <label className="field">
                Google Calendar reminder
                <select
                  value={settings.calendarTiming}
                  onChange={(e) =>
                    setSettings({ ...settings, calendarTiming: e.target.value })
                  }
                >
                  <option value="default">Use calendar defaults</option>
                  <option value="10">10 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="off">Off</option>
                </select>
              </label>
            )}
            {role === "parent" && (
              <label className="field">
                Remind me below available credit (EUR)
                <input
                  required
                  type="number"
                  min="0"
                  max="1000"
                  step="0.01"
                  value={settings.lowCreditMicros / 1e6}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      lowCreditMicros: Math.round(Number(e.target.value) * 1e6),
                    })
                  }
                />
              </label>
            )}
            <Button disabled={busy}>Save settings</Button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
