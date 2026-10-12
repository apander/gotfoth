"use client";
import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";

// One outlined icon family, shared across navigation and actions.
const paths: Record<string, string> = {
  Today: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  Subjects: "M4 4h7v16H4z M13 4h7v16h-7z",
  Practice: "m4 17 11-11 3 3L7 20H4z M14 7l3 3 M16 5l2-2 3 3-2 2",
  Papers: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7",
  Progress: "M4 4v16h17 M7 15l4-5 4 3 5-7",
  Plan: "M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16",
  Reviews: "m5 12 4 4L19 6",
  Family:
    "M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M3 21v-3a6 6 0 0 1 12 0v3 M16 4a3 3 0 0 1 0 6 M17 13a5 5 0 0 1 4 5v3",
  Credit: "M20 6H4v15h16V6 M4 6V3h13 M14 11h6v5h-6z",
  Operations: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
  Arrow: "M4 12h16 m-6-6 6 6-6 6",
  Plus: "M12 5v14 M5 12h14",
  Edit: "M4 20h4L18 10l-4-4L4 16z M13 7l4 4",
  Delete: "M4 7h16 M9 7V5h6v2 M7 7l1 13h8l1-13",
  Copy: "M8 8h12v12H8z M4 4h12v12",
  Check: "m5 12 4 4L19 6",
};
export function Icon({ name }: { name: string }) {
  const aliases: Record<string, string> = {
    Overview: "Today",
    Families: "Family",
    Invitations: "Arrow",
    Catalogue: "Papers",
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[aliases[name] ?? name] ?? paths.Operations} />
    </svg>
  );
}
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      {...props}
      className={`button ${variant === "secondary" ? "secondary" : ""} ${className}`}
    />
  );
}
export function Status({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function Meter({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  return (
    <progress
      className="meter"
      aria-label={label}
      value={value}
      max={Math.max(1, max)}
    />
  );
}
export function PageHeading({
  label,
  title,
  text,
}: {
  label: string;
  title: string;
  text?: string;
}) {
  return (
    <header className="heading">
      <p className="eyebrow">{label}</p>
      <h1 tabIndex={-1}>{title}</h1>
      {text && <p className="muted">{text}</p>}
    </header>
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <section className="empty">
      <Icon name="Papers" />
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </section>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon" aria-hidden>
        g<span>f</span>
      </span>
      GotFoth
      <span className="brand-dot" aria-hidden />
    </div>
  );
}
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog ref={ref} aria-label={title} onCancel={onClose}>
      <div className="row">
        <h2>{title}</h2>
        <button
          className="button secondary small"
          onClick={onClose}
          aria-label="Close dialog"
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
