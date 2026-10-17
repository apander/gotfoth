"use client";
import { useEffect, useRef, useState } from "react";
import { api, euro } from "./api";
import { QuestionExtracts } from "./extracts";
import { Dialog, Meter } from "./ui";
export function Player({
  familyId,
  id,
  onDone,
  onNavigationReady,
}: {
  familyId: string;
  id: string;
  onDone: (completed?: boolean) => void;
  onNavigationReady?: (save: (() => Promise<void>) | null) => void;
}) {
  const [attempt, setAttempt] = useState<any>(null),
    [discardRecovery, setDiscardRecovery] = useState(false),
    [index, setIndex] = useState(0),
    [answers, setAnswers] = useState<Record<string, any>>({}),
    [token, setToken] = useState(""),
    [status, setStatus] = useState("Loading…"),
    [error, setError] = useState(""),
    [quote, setQuote] = useState<any>(null),
    [remaining, setRemaining] = useState<number | null>(null),
    [hints, setHints] = useState<string[]>([]),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [recovery, setRecovery] = useState<Record<string, string> | null>(null);
  const current = useRef<Record<string, any>>({}),
    dirty = useRef(new Set<string>()),
    queue = useRef(Promise.resolve()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    tokenRef = useRef(""),
    deadline = useRef<number | null>(null),
    expired = useRef(false);
  const lastFlush = useRef(0);
  const draftKey = `sv-draft:${familyId}:${id}`,
    tokenKey = `sv-editor:${id}`;
  function action(data: unknown) {
    return api("family/attempt/action", { familyId, id, ...(data as object) });
  }
  async function load() {
    const a = await api(`family/attempt?family=${familyId}&id=${id}`);
    setAttempt(a);
    const map = Object.fromEntries(
      a.answers.map((x: any) => [
        x.question_id,
        { ...x, submitted: a.submittedQuestionIds?.includes(x.question_id) },
      ]),
    );
    current.current = map;
    setAnswers(map);
    dirty.current.clear();
    const first = a.data.questions.findIndex(
      (q: any) => !a.submittedQuestionIds?.includes(q.id),
    );
    if (first >= 0) setIndex(first);
    setStatus("Saved to account");
    const saved = sessionStorage.getItem(tokenKey) ?? "";
    tokenRef.current = saved;
    setToken(saved);
    if (a.deadline) {
      deadline.current =
        performance.now() +
        new Date(a.deadline).getTime() -
        new Date(a.serverNow).getTime();
    }
    const local = localStorage.getItem(draftKey);
    if (local) {
      try {
        const recovered = JSON.parse(local);
        if (
          Object.entries(recovered).some(
            ([qid, text]) => map[qid]?.text !== text,
          )
        )
          setRecovery(recovered);
        else localStorage.removeItem(draftKey);
      } catch {
        setError("A local recovery copy could not be read.");
      }
    }
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);
  useEffect(() => {
    onNavigationReady?.(async () => {
      await flush();
      if (dirty.current.size) throw new Error("Writing has not synced yet.");
    });
    return () => onNavigationReady?.(null);
  }, [id]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (dirty.current.size && performance.now() - lastFlush.current >= 5000)
        void flush().catch(() => {});
      if (deadline.current !== null) {
        const seconds = Math.max(
          0,
          Math.ceil((deadline.current - performance.now()) / 1000),
        );
        setRemaining(seconds);
        if (seconds === 0 && !expired.current) {
          expired.current = true;
          void api(`family/attempt?family=${familyId}&id=${id}`)
            .then((a) => {
              setAttempt(a);
              setStatus("Deadline reached. On-time saved answers are frozen.");
            })
            .catch((e) => setError(e.message));
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [id]);
  useEffect(() => {
    function unload(e: BeforeUnloadEvent) {
      if (dirty.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  async function flush() {
    lastFlush.current = performance.now();
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (!tokenRef.current || expired.current) return;
        for (const qid of [...dirty.current]) {
          const value = { ...current.current[qid] };
          try {
            const r = await action({
              action: "save",
              questionId: qid,
              text: value.text,
              revision: value.revision,
              flagged: value.flagged,
              editorToken: tokenRef.current,
            });
            if (r.expired) {
              expired.current = true;
              setStatus(
                "Deadline reached. Local writing is available for recovery.",
              );
              return;
            }
            current.current[qid] = {
              ...current.current[qid],
              revision: r.revision,
            };
            if (
              current.current[qid].text === value.text &&
              current.current[qid].flagged === value.flagged
            )
              dirty.current.delete(qid);
            setAnswers({ ...current.current });
          } catch (e: any) {
            if (e.code === "EDITOR_CONFLICT") {
              tokenRef.current = "";
              setToken("");
            }
            setStatus("Not yet saved to account");
            setError(e.message);
            throw e;
          }
        }
        if (!dirty.current.size) setStatus("Saved to account");
      });
    return queue.current;
  }
  function edit(
    qid: string,
    text: string,
    flagged = current.current[qid].flagged,
  ) {
    current.current[qid] = { ...current.current[qid], text, flagged };
    setAnswers({ ...current.current });
    dirty.current.add(qid);
    localStorage.setItem(
      draftKey,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(current.current).map(([key, v]) => [key, v.text]),
        ),
      ),
    );
    setStatus("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 1000);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    await flush();
    if (dirty.current.size)
      throw new Error(
        "Some writing is not saved. Reconnect and save before submitting.",
      );
    const result = await action({
      action: "submit",
      editorToken: tokenRef.current,
      questionId: attempt.mode === "guided" ? question.id : undefined,
    });
    if (result.submission) {
      if (attempt.mode === "guided") {
        delete current.current[question.id];
        localStorage.removeItem(draftKey);
      } else localStorage.removeItem(draftKey);
      onDone(true);
    }
  }
  if (!attempt)
    return (
      <section className="loading">
        <p role={error ? "alert" : "status"}>
          {error || "Opening your practice…"}
        </p>
        {error && (
          <button className="button secondary" onClick={() => onDone()}>
            Back to study
          </button>
        )}
      </section>
    );
  const question = attempt.data.questions[index],
    answer = answers[question.id] ?? { text: "", flagged: false };
  const editable =
    attempt.state === "in_progress" &&
    !!token &&
    !expired.current &&
    !answer.submitted;
  return (
    <>
      <div className="row player-toolbar">
        <button
          className="link-button"
          onClick={() =>
            run(async () => {
              await flush();
              if (dirty.current.size)
                throw new Error(
                  "Your writing has not synced. A recovery copy remains on this device.",
                );
              onDone();
            })
          }
        >
          ← Back to study
        </button>
        <span className="badge">
          {attempt.mode.toUpperCase()}
          {attempt.data.assisted ? " · ASSISTED" : ""}
        </span>
        {remaining !== null && (
          <span className="timer" role="timer" aria-label="Time remaining">
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")}
          </span>
        )}
      </div>
      <h1 className="player-heading">
        {attempt.data.subject ? `${attempt.data.subject} / ` : ""}
        {attempt.mode === "mock" ? "Full paper" : "Practice session"}
      </h1>
      <div className="question-context">
        <span>
          Question {index + 1} of {attempt.data.questions.length}
        </span>
        <span>
          {
            attempt.data.questions.filter((q: any) =>
              answers[q.id]?.text?.trim(),
            ).length
          }{" "}
          answered
        </span>
      </div>
      <Meter
        value={
          attempt.data.questions.filter((q: any) => answers[q.id]?.text?.trim())
            .length
        }
        max={attempt.data.questions.length}
        label="Questions answered"
      />
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {recovery && (
        <>
          {discardRecovery && (
            <Dialog
              title="Discard recovered writing?"
              onClose={() => setDiscardRecovery(false)}
            >
              <p>
                This removes the recovery copy on this device. Your saved
                account answers stay intact.
              </p>
              <button
                className="button"
                onClick={() => {
                  localStorage.removeItem(draftKey);
                  setRecovery(null);
                  setDiscardRecovery(false);
                }}
              >
                Discard local copy
              </button>
            </Dialog>
          )}
          <div className="notice">
            <strong>Writing was recovered on this device.</strong>
            <p>It has not replaced the saved answer.</p>
            <div className="row">
              <button
                className="button secondary"
                onClick={() =>
                  run(async () => {
                    await action({ action: "recover", answers: recovery });
                    if (editable)
                      for (const [qid, text] of Object.entries(recovery))
                        if (current.current[qid]) edit(qid, text);
                    setRecovery(null);
                    if (!editable) localStorage.removeItem(draftKey);
                  })
                }
              >
                {editable
                  ? "Restore into this practice"
                  : "Save as interrupted practice revision"}
              </button>
              <button
                className="link-button"
                onClick={() => setDiscardRecovery(true)}
              >
                Discard recovery
              </button>
            </div>
          </div>
        </>
      )}
      {attempt.state === "draft" && (
        <section className="card stack" style={{ marginBottom: 25 }}>
          <h2>Before you start</h2>
          <p className="question-text">{attempt.data.instructions}</p>
          <p>
            {attempt.data.questions.length} questions ·{" "}
            {attempt.data.durationMinutes} minutes
            {attempt.mode !== "mock" ? " (estimate)" : ""}
            {attempt.data.extraTimePercent
              ? ` + ${attempt.data.extraTimePercent}% configured allowance`
              : ""}
          </p>
          {["mock", "timed"].includes(attempt.mode) && (
            <p className="muted">
              The timer cannot pause. Only answers acknowledged by the server
              before the deadline count toward this result.
            </p>
          )}
          {quote ? (
            <>
              <p>
                Maximum marking charge:{" "}
                <strong>{euro(quote.maxChargeMicros)}</strong>. The unused
                amount will be released.
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await action({
                      action: "start",
                      quoteId: quote.id,
                    });
                    sessionStorage.setItem(tokenKey, result.editorToken);
                    await load();
                  })
                }
              >
                Accept maximum charge and start →
              </button>
            </>
          ) : (
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                run(async () => setQuote(await action({ action: "quote" })))
              }
            >
              Get marking quote
            </button>
          )}
        </section>
      )}
      {attempt.state === "in_progress" && !token && (
        <div className="notice">
          <p>Take over editing explicitly to continue on this device.</p>
          <button
            className="button"
            onClick={() =>
              run(async () => {
                const r = await action({ action: "takeover" });
                sessionStorage.setItem(tokenKey, r.editorToken);
                tokenRef.current = r.editorToken;
                setToken(r.editorToken);
                await load();
              })
            }
          >
            Take over editing
          </button>
        </div>
      )}
      {attempt.state === "submitted" && (
        <div className="notice">
          Your submission is preserved. Marking status is available from Today.
        </div>
      )}
      <nav className="question-nav" aria-label="Questions">
        {attempt.data.questions.map((q: any, i: number) => (
          <button
            key={q.id}
            aria-current={i === index ? "step" : undefined}
            className={i === index ? "active" : ""}
            onClick={() =>
              run(async () => {
                await flush();
                setIndex(i);
                setHints([]);
              })
            }
            aria-label={`Question ${q.number}, ${answers[q.id]?.text ? "answered" : "blank"}${answers[q.id]?.flagged ? ", flagged" : ""}`}
          >
            {q.number}
            {answers[q.id]?.text ? " ✓" : ""}
            {answers[q.id]?.flagged ? " ⚑" : ""}
          </button>
        ))}
      </nav>
      {attempt.data.choices.length > 0 && (
        <section className="card" style={{ marginBottom: 20 }}>
          {attempt.data.choices.map((group: any) => (
            <fieldset key={group.id}>
              <legend>
                Choose {group.choose} in {group.id}
              </legend>
              {group.questionIds.map((qid: string) => (
                <label key={qid} style={{ marginRight: 20 }}>
                  <input
                    type="checkbox"
                    disabled={!editable}
                    checked={attempt.data.selected.includes(qid)}
                    onChange={(e) =>
                      run(async () => {
                        const selected = e.target.checked
                          ? [...attempt.data.selected, qid]
                          : attempt.data.selected.filter(
                              (x: string) => x !== qid,
                            );
                        await action({
                          action: "choices",
                          selected,
                          editorToken: tokenRef.current,
                        });
                        setAttempt({
                          ...attempt,
                          data: { ...attempt.data, selected },
                        });
                      })
                    }
                  />{" "}
                  {
                    attempt.data.questions.find((q: any) => q.id === qid)
                      ?.number
                  }
                </label>
              ))}
            </fieldset>
          ))}
        </section>
      )}
      <div className="player">
        <section className="question-panel">
          <div className="row">
            <span className="eyebrow">QUESTION {question.number}</span>
            <span className="badge">{question.marks} marks</span>
          </div>
          <p className="question-text" style={{ marginTop: 24 }}>
            {question.text}
          </p>
          <QuestionExtracts
            key={question.id}
            extracts={(question.extracts ?? []).filter(
              (extract: any) => extract.cited !== false,
            )}
            reveal
          />
          {attempt.data.resources
            .filter((r: any) => question.resourceIds.includes(r.id))
            .map((r: any) => (
              <section className="source" key={r.id}>
                <h3>{r.title}</h3>
                {r.text}
                {r.fileId && (
                  <p>
                    <a
                      className="link-button"
                      target="_blank"
                      rel="noreferrer"
                      href={`/api/resource/${r.fileId}?family=${familyId}&attempt=${id}#page=${r.pages?.[0] ?? 1}`}
                    >
                      Open original source pages (reveals the paper)
                    </a>
                  </p>
                )}
              </section>
            ))}
          {attempt.mode === "guided" && editable && (
            <button
              className="link-button"
              onClick={() =>
                run(async () => {
                  const r = await action({
                    action: "hint",
                    questionId: question.id,
                  });
                  setHints(r.hints);
                })
              }
            >
              Show an approved hint
            </button>
          )}
          {hints.map((h, i) => (
            <p className="notice" key={i}>
              {h}
            </p>
          ))}
        </section>
        <section className="answer-panel">
          <label htmlFor="answer" className="eyebrow">
            YOUR ANSWER
          </label>
          {question.format === "table" ? (
            <TableAnswer
              value={answer.text}
              columns={question.tableColumns ?? ["Item", "Answer"]}
              disabled={!editable}
              onChange={(text) => edit(question.id, text)}
            />
          ) : (
            <textarea
              id="answer"
              className="editor"
              aria-label="Your answer"
              spellCheck
              value={answer.text}
              disabled={!editable}
              onChange={(e) => edit(question.id, e.target.value)}
              placeholder="Write your answer…"
            />
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <span role="status" aria-live="polite" className="muted">
              {status}
            </span>
            <label>
              <input
                type="checkbox"
                checked={answer.flagged}
                disabled={!editable}
                onChange={(e) =>
                  edit(question.id, answer.text, e.target.checked)
                }
              />{" "}
              Flag for review
            </label>
          </div>
          <div className="row answer-actions" style={{ marginTop: 24 }}>
            {index > 0 && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await flush();
                    setIndex(index - 1);
                    setHints([]);
                  })
                }
              >
                Previous
              </button>
            )}
            <button
              className="button secondary"
              disabled={!editable || busy}
              onClick={() =>
                run(async () => {
                  await flush();
                  setReview(true);
                })
              }
            >
              Review before submitting
            </button>
            {index < attempt.data.questions.length - 1 && (
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await flush();
                    setIndex(index + 1);
                    setHints([]);
                  })
                }
              >
                Next question →
              </button>
            )}
          </div>
        </section>
      </div>
      {review && (
        <Dialog title="Ready to submit?" onClose={() => setReview(false)}>
          <p>
            {attempt.mode === "guided" ? "This answer" : "These answers"} will
            become immutable. You can make a separate correction after feedback.
          </p>
          <ul>
            {attempt.data.questions
              .filter(
                (q: any) => attempt.mode !== "guided" || q.id === question.id,
              )
              .map((q: any) => (
                <li key={q.id}>
                  {q.number}:{" "}
                  {answers[q.id]?.text
                    ? "Answered"
                    : "Blank — receives zero if selected"}
                  {answers[q.id]?.flagged ? " · flagged" : ""}
                </li>
              ))}
          </ul>
          <div className="row">
            <button
              className="button"
              disabled={busy}
              onClick={() => run(submit)}
            >
              Submit {attempt.mode === "guided" ? "answer" : "set"}
            </button>
            <button className="link-button" onClick={() => setReview(false)}>
              Keep working
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function TableAnswer({
  value,
  columns,
  disabled,
  onChange,
}: {
  value: string;
  columns: string[];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  let rows: string[][];
  try {
    rows = JSON.parse(value);
  } catch {
    rows = [columns.map(() => "")];
  }
  if (!Array.isArray(rows) || !rows.length) rows = [columns.map(() => "")];
  return (
    <div className="card overflow">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c, j) => (
                <td key={j}>
                  <input
                    aria-label={`${c}, row ${i + 1}`}
                    disabled={disabled}
                    value={row[j] ?? ""}
                    onChange={(e) => {
                      const next = rows.map((r) => [...r]);
                      next[i][j] = e.target.value;
                      onChange(JSON.stringify(next));
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="button secondary small"
        disabled={disabled}
        onClick={() =>
          onChange(JSON.stringify([...rows, columns.map(() => "")]))
        }
      >
        Add row
      </button>
    </div>
  );
}
