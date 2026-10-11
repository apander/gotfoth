"use client";
import { useState } from "react";

type Figure = { id: string };
type Extract = {
  label: string;
  text?: string;
  figures?: Figure[];
};

function printed(extract: Extract) {
  if (extract.figures?.length)
    return extract.figures.map((figure) => (
      <img
        key={figure.id}
        alt={`Extract ${extract.label} as printed`}
        src={`/api/figures/${figure.id}`}
        style={{ width: "100%", height: "auto", background: "white" }}
      />
    ));
  return (extract.text ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => <p key={line}>{line}</p>);
}

export function QuestionExtracts({
  extracts,
  reveal = false,
}: {
  extracts: Extract[];
  reveal?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!extracts?.length) return null;
  return (
    <>
      {extracts.map((extract) => {
        const shown = !reveal || open[extract.label];
        return (
          <div key={extract.label}>
            {reveal ? (
              <button
                className="button secondary"
                style={{ marginTop: 16 }}
                aria-expanded={shown}
                onClick={() =>
                  setOpen((current) => ({
                    ...current,
                    [extract.label]: !current[extract.label],
                  }))
                }
              >
                {shown ? "Hide" : "Show"} Extract {extract.label}
              </button>
            ) : null}
            {shown ? (
              <section className="source">
                <h3>Extract {extract.label}</h3>
                {printed(extract)}
              </section>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
