import { AppError, requireThat } from "../lib/errors";

const roleLine = {
  student: "After you sign in, your study desk is ready.",
  parent: "After you sign in, you can follow your family's study.",
  teacher: "After you sign in, you can review papers.",
} as const;

export function welcomeLetter(input: {
  name: string;
  email: string;
  role: keyof typeof roleLine;
  familyName: string;
  url: string;
}) {
  const greeting = input.name.trim() ? `Hello ${input.name.trim()},` : "Hello,";
  return {
    subject: "Welcome to GotFoth",
    text: `${greeting}\n\n${input.familyName} has invited you to GotFoth as a ${input.role}.\n\n${roleLine[input.role]}\n\nOpen this link and continue with Google using ${input.email}:\n\n${input.url}\n\nThe link expires in seven days and can be used once.\n`,
  };
}

export async function deliverWelcome(message: {
  to: string;
  subject: string;
  text: string;
}) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  requireThat(key && from, "MAIL", "Welcome email is not set up yet.", 503);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!response.ok)
    throw new AppError("MAIL", "The welcome email could not be sent.", 502);
}
