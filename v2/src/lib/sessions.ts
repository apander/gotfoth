const examMonths = ["January", "June", "October"] as const;
const examMonthIndex = { January: 0, June: 5, October: 9 };

// Upcoming January, June and October sittings, from this month through two years ahead.
export function examSessionChoices(now = new Date()) {
  const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowEnd = new Date(windowStart);
  windowEnd.setFullYear(windowEnd.getFullYear() + 2);
  const choices: string[] = [];
  for (let year = windowStart.getFullYear(); year <= windowEnd.getFullYear(); year += 1) {
    for (const month of examMonths) {
      const sitting = new Date(year, examMonthIndex[month], 1);
      if (sitting >= windowStart && sitting <= windowEnd) choices.push(`${month} ${year}`);
    }
  }
  return choices;
}
