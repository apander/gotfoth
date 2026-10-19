"use client";
import { useState } from "react";
import { Dialog } from "./ui";

type Figure = { id: string; width?: number; height?: number; page?: number };
type Extract = {
  label: string;
  heading?: string;
  text?: string;
  figures?: Figure[];
};

function PrintedFigure({
  figure,
  label,
  onUnavailable,
}: {
  figure: Figure;
  label: string;
  onUnavailable: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  return (
    <figure className="printed-figure">
      {failed ? (
        <div className="source-error" role="status">
          <p>
            The printed image could not load. Any available text is shown below.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setFailed(false);
              setRetry((n) => n + 1);
            }}
          >
            Retry source image
          </button>
        </div>
      ) : (
        <img
          alt={`Extract ${label} as printed${figure.page ? ` · page ${figure.page}` : ""}`}
          src={`/api/figures/${figure.id}${retry ? `?retry=${retry}` : ""}`}
          width={figure.width}
          height={figure.height}
          onError={() => {
            setFailed(true);
            onUnavailable();
          }}
        />
      )}
      {figure.page && <figcaption>Source page {figure.page}</figcaption>}
    </figure>
  );
}
function Printed({ extract }: { extract: Extract }) {
  const [unavailable, setUnavailable] = useState(false);
  const paragraphs = (extract.text ?? "").split("\n").filter(Boolean);
  if (extract.figures?.length)
    return (
      <>
        <div>
          {extract.figures.map((figure) => (
            <PrintedFigure
              key={figure.id}
              figure={figure}
              label={extract.label}
              onUnavailable={() => setUnavailable(true)}
            />
          ))}
        </div>
        {paragraphs.length > 0 && (
          <details
            className="source-transcript"
            open={unavailable || undefined}
          >
            <summary>Read Extract {extract.label} as text</summary>
            {paragraphs.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </details>
        )}
      </>
    );
  return (
    <>
      {paragraphs.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </>
  );
}

export function QuestionExtracts({
  extracts,
  reveal = false,
}: {
  extracts: Extract[];
  reveal?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Extract | null>(null);
  const [magnification, setMagnification] = useState(1);
  if (!extracts?.length) return null;
  return (
    <>
      {extracts.map((extract, index) => {
        const shown = !reveal || open[extract.label];
        return (
          <div key={`${extract.heading ?? extract.label}-${index}`}>
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
              <section
                className="source exam-extract"
                aria-label={`Extract ${extract.label}`}
              >
                <div className="row source-heading">
                  <h3>
                    {extract.heading?.includes(":")
                      ? `Section ${extract.heading.replace(":", " · Extract ")}`
                      : `Extract ${extract.label}`}
                  </h3>
                  {extract.figures?.length ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setMagnification(1);
                        setExpanded(extract);
                      }}
                    >
                      Enlarge Extract {extract.label}
                    </button>
                  ) : null}
                </div>
                <Printed extract={extract} />
              </section>
            ) : null}
          </div>
        );
      })}
      {expanded && (
        <Dialog
          title={`Extract ${expanded.label} · enlarged source`}
          className="source-viewer"
          onClose={() => setExpanded(null)}
        >
          <label className="field source-zoom-control">
            Source magnification
            <select
              value={magnification}
              onChange={(event) => setMagnification(Number(event.target.value))}
            >
              <option value={1}>Fit to width</option>
              <option value={1.5}>150%</option>
              <option value={2}>200%</option>
              <option value={3}>300%</option>
            </select>
          </label>
          <p className="muted field-help">
            Zoom in to read small details. Scroll across the source when
            enlarged.
          </p>
          <div
            className="source-zoom-viewport"
            tabIndex={0}
            role="region"
            aria-label="Enlarged source, scroll to read"
          >
            <div style={{ width: `${magnification * 100}%` }}>
              <Printed extract={expanded} />
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
