// Convert a wall time to an instant by matching Intl's IANA-zone rendering. Reject nonexistent DST times.
export function zonedInstant(date: string, time: string, timezone: string) {
  const target = `${date}T${time}`;
  const guess = new Date(`${target}:00Z`).getTime();
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const d = new Date(guess + offset * 60000);
    if (format.format(d).replace(" ", "T") === target) return d.toISOString();
  }
  return null;
}
