"use client";
import { useState } from "react";
import { api } from "./api";
import { useRead } from "./workspace-data";
import { Pagination, ReadState } from "./desktop-handoff";
import { Button, Dialog, Empty, PageHeading } from "./ui";
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
    [notice, setNotice] = useState("");
  return (
    <>
      <PageHeading
        label="YOUR REMINDERS"
        title="Keep the next step in sight."
        text="Updates and actions for this workspace. Calendar reminders work through Google Calendar; this inbox updates when you open it."
      />
      <div className="row">
        <Button
          variant="secondary"
          disabled={!read.data}
          onClick={() => read.data && setSettings({ ...read.data.settings })}
        >
          Reminder settings
        </Button>
        <button className="link-button" onClick={read.refresh}>
          Refresh
        </button>
        {read.data && <span className="meta">{read.data.unread} unread</span>}
      </div>
      <p role="status">{notice}</p>
      {!read.data ? (
        <ReadState error={read.error} refresh={read.refresh} />
      ) : (
        <>
          <div className="reminder-list">
            {read.data.items.map((item: any) => (
              <article
                key={item.key}
                className={`reminder-item ${item.read ? "" : "unread"}`}
              >
                <p className="eyebrow">
                  {item.actionable ? "Needs attention" : "Update"}
                  {item.read ? "" : " · Unread"}
                </p>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
                <div className="row">
                  <button
                    className="button secondary"
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
                    Open
                  </button>
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
    </>
  );
}
