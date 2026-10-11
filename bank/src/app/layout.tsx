import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paper bank",
  description: "Review and publish exam questions and mark schemes.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
