"use client";
import { score } from "./revision";
import { date } from "./api";
import { friendlyStatus } from "../lib/personas";

/** Each bar is an individual result, not an inference of comparable attainment. */
export function PerformanceChart({
  items,
  total,
  onOpen,
}: {
  items: any[];
  total: number;
  onOpen: (id: string) => void;
}) {
  const results = items
    .filter((r) => r.state === "published" && score(r.effective))
    .slice()
    .reverse();
  return (
    <section className="performance-overview" aria-label="Performance overview">
      <div className="performance-chart-heading">
        <div>
          <p className="eyebrow">YOUR RESULTS</p>
          <h2>Results over time</h2>
        </div>
        <span className="status-pill">
          {results.length} {results.length === 1 ? "result" : "results"} shown
        </span>
      </div>
      {!results.length ? (
        <div className="performance-no-evidence">
          <span aria-hidden="true">▥</span>
          <h3>Your story starts with practice.</h3>
          <p>
            Published results will appear here. No evidence yet doesn’t mean a
            low score.
          </p>
        </div>
      ) : (
        <>
          <p className="meta">
            Marks earned as a percentage · select a result for feedback
          </p>
          <div
            className="performance-chart-scroll"
            tabIndex={0}
            role="region"
            aria-label="Published result chart, oldest to newest"
          >
            <div className="performance-plot">
              <div className="performance-axis" aria-hidden="true">
                <span>100%</span>
                <span>50%</span>
                <span>0%</span>
              </div>
              <div className="performance-bars">
                {results.map((r) => {
                  const marks = score(r.effective)!;
                  return (
                    <button
                      className={`performance-bar-item ${r.subject === "business" ? "subject-business" : ""}`}
                      key={r.id}
                      onClick={() => onOpen(r.id)}
                      aria-label={`${r.subject}, ${date(r.submitted_at)}, ${marks.percentage}%, ${friendlyStatus(r.mode)}${r.assisted === "true" ? ", assisted" : ""}. Open feedback`}
                    >
                      <span className="performance-bar-track">
                        <span
                          className="performance-bar"
                          style={{
                            height: `${Math.max(0, Math.min(100, marks.percentage))}%`,
                          }}
                        />
                        <strong>{marks.percentage}%</strong>
                      </span>
                      <span className="performance-bar-label capitalize">
                        {r.subject}
                      </span>
                      <span className="performance-bar-date">
                        {new Date(r.submitted_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="performance-chart-note">
            Each bar is a separate piece of work. Papers, topics and help used
            can differ; these results aren’t a predicted grade.
          </p>
          {total > items.length && (
            <p className="meta">
              Showing {items.length} of {total} records in this scope. Use the
              page controls below for earlier evidence.
            </p>
          )}
        </>
      )}
    </section>
  );
}
