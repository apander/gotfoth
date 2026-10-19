import { zonedInstant } from "./time";
export type Reminder = {
  key: string;
  title: string;
  detail: string;
  href: string;
  at: string;
  actionable: boolean;
  read?: boolean;
  snoozedUntil?: string | null;
};
export function tomorrowInZone(timezone: string, now = new Date()) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return (
    zonedInstant(next.toISOString().slice(0, 10), "00:00", timezone) ??
    zonedInstant(next.toISOString().slice(0, 10), "01:00", timezone)!
  );
}
