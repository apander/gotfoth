import type { Metadata } from "next";
import "./globals.css";
import "./personas.css";
import "./companion.css";
export const metadata: Metadata = {
  title: "GotFoth · Focused revision",
  description: "A focused workspace for International A Level practice.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
