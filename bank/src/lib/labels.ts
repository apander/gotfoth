export function paperLabel(input: {
  examDate: string | null;
  series: string;
  subject: string;
  code: string;
}): string {
  const year = input.examDate?.slice(0, 4) || input.series.match(/\d{4}/)?.[0] || input.series;
  return `${year} ${input.subject} Paper ${Number(input.code)}`;
}
