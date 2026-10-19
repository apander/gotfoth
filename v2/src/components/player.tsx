"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { api } from "./api";
import { SourceDesk, hasQuestionSources } from "./exam-sources";
import {
  newExamWorkspace,
  readExamWorkspace,
  type ExamWorkspaceState,
} from "./exam-workspace-state";
import { Dialog, Meter } from "./ui";
export function Player({
  familyId,
  userId,
  id,
  onDone,
  onNavigationReady,
}: {
  familyId: string;
  userId: string;
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
  const sessionRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [workspace, setWorkspace] = useState(newExamWorkspace);
  const workspaceRef = useRef(workspace);
  const workspaceKey = `gotfoth:exam-workspace:${userId}:${familyId}:${id}`;
  const [expandedQuestion, setExpandedQuestion] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const update = () =>
      setCompact(
        window.innerWidth <
          Math.max(
            1024,
            parseFloat(getComputedStyle(document.documentElement).fontSize) *
              64,
          ),
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  function changeWorkspace(
    update: (previous: ExamWorkspaceState) => ExamWorkspaceState,
  ) {
    workspaceRef.current = update(workspaceRef.current);
    setWorkspace(workspaceRef.current);
  }
  function rememberAnswer() {
    const editor = editorRef.current,
      qid = attempt?.data.questions[index]?.id;
    if (!qid) return;
    const table =
      answerRef.current?.querySelector<HTMLElement>(".exam-table-answer");
    if (!editor && table?.clientHeight) {
      const active = document.activeElement;
      const input =
        active instanceof HTMLInputElement && table.contains(active)
          ? active
          : null;
      changeWorkspace((previous) => ({
        ...previous,
        answers: {
          ...previous.answers,
          [qid]: {
            top: table.scrollTop,
            start: input?.selectionStart ?? previous.answers[qid]?.start ?? 0,
            end: input?.selectionEnd ?? previous.answers[qid]?.end ?? 0,
            direction:
              input?.selectionDirection ??
              previous.answers[qid]?.direction ??
              "none",
            field:
              input?.getAttribute("aria-label") ?? previous.answers[qid]?.field,
          },
        },
      }));
      return;
    }
    if (!editor?.clientHeight) return;
    const position = {
      top: editor.scrollTop,
      start: editor.selectionStart,
      end: editor.selectionEnd,
      direction: editor.selectionDirection,
    };
    changeWorkspace((previous) => ({
      ...previous,
      answers: { ...previous.answers, [qid]: position },
    }));
  }
  const lastFlush = useRef(0);
  function showQuestion(next: number) {
    rememberAnswer();
    changeWorkspace((previous) => ({
      ...previous,
      question: attempt.data.questions[next].id,
    }));
    setIndex(next);
    setHints([]);
    setExpandedQuestion(false);
    requestAnimationFrame(() => {
      sessionRef.current
        ?.querySelector<HTMLElement>(
          `.${workspaceRef.current.view === "source" && compact && hasQuestionSources(attempt.data.questions[next], attempt.data.resources ?? []) ? "exam-mobile-question" : "exam-writing-pane"} h2`,
        )
        ?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    try {
      changeWorkspace(() =>
        readExamWorkspace(localStorage.getItem(workspaceKey)),
      );
    } catch {}
    function persist() {
      try {
        localStorage.setItem(
          workspaceKey,
          JSON.stringify(workspaceRef.current),
        );
      } catch {}
    }
    window.addEventListener("pagehide", persist);
    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
    };
  }, [workspaceKey]);
  useEffect(() => {
    const persist = setTimeout(() => {
      try {
        localStorage.setItem(
          workspaceKey,
          JSON.stringify(workspaceRef.current),
        );
      } catch {}
    }, 250);
    return () => clearTimeout(persist);
  }, [workspace, workspaceKey]);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    const position =
      workspaceRef.current.answers[attempt?.data.questions[index]?.id];
    const table =
      answerRef.current?.querySelector<HTMLElement>(".exam-table-answer");
    if (!editor && table?.clientHeight) {
      table.scrollTop = position?.top ?? 0;
      const input = Array.from(
        table.querySelectorAll<HTMLInputElement>("input"),
      ).find((el) => el.getAttribute("aria-label") === position?.field);
      input?.setSelectionRange(
        position?.start ?? 0,
        position?.end ?? 0,
        position?.direction ?? "none",
      );
      return;
    }
    if (!editor || !editor.clientHeight) return;
    editor.setSelectionRange(
      position?.start ?? 0,
      position?.end ?? 0,
      position?.direction ?? "none",
    );
    editor.scrollTop = position?.top ?? 0;
  }, [index, attempt?.id, workspace.view, compact]);
  useEffect(() => {
    function resize() {
      const element = sessionRef.current;
      if (!element) return;
      const height = window.visualViewport?.height ?? window.innerHeight;
      element.style.setProperty(
        "--exam-height",
        `${Math.max(280, height - Math.max(0, element.getBoundingClientRect().top) - 12)}px`,
      );
    }
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [attempt?.id]);
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
    const remembered = a.data.questions.findIndex(
      (q: any) => q.id === workspaceRef.current.question,
    );
    if (
      remembered >= 0 &&
      (a.state !== "in_progress" ||
        first < 0 ||
        !a.submittedQuestionIds?.includes(a.data.questions[remembered].id))
    )
      setIndex(remembered);
    else if (first >= 0) setIndex(first);
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
      setError(
        ["AWAITING_FUNDS", "STUDENT_CAP", "RATE_REQUIRED"].includes(e.code)
          ? "Practice is being prepared. Your saved work is safe. Please try again shortly."
          : e.message,
      );
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
  const hasSources = hasQuestionSources(question, attempt.data.resources ?? []);
  const questionPrompt = (
    <QuestionPrompt
      question={question}
      expanded={expandedQuestion}
      onExpand={() => setExpandedQuestion((v) => !v)}
    />
  );
  return (
    <div
      className={`exam-session ${compact ? "is-compact" : ""}`}
      ref={sessionRef}
    >
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
      <div className="exam-session-heading">
        <h1 className="player-heading">
          {attempt.data.subject
            ? `${attempt.data.subject.charAt(0).toUpperCase() + attempt.data.subject.slice(1)} / `
            : ""}
          {attempt.mode === "mock"
            ? "Full paper"
            : attempt.mode === "timed"
              ? "Timed section"
              : "Practice session"}
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
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await action({ action: "start" });
                sessionStorage.setItem(tokenKey, result.editorToken);
                await load();
              })
            }
          >
            {busy ? "Opening your practice…" : "Start practice →"}
          </button>
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
      <div className="exam-navigation">
        <nav className="question-nav" aria-label="Questions">
          {attempt.data.questions.map((q: any, i: number) => (
            <button
              key={q.id}
              aria-current={i === index ? "step" : undefined}
              className={i === index ? "active" : ""}
              onClick={() =>
                run(async () => {
                  await flush();
                  showQuestion(i);
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
        {hasSources && (
          <div
            className="exam-mobile-tabs"
            role="tablist"
            aria-label="Workspace view"
          >
            {(["source", "answer"] as const).map((view) => (
              <button
                type="button"
                role="tab"
                key={view}
                id={`workspace-tab-${view}`}
                aria-selected={workspace.view === view}
                tabIndex={workspace.view === view ? 0 : -1}
                aria-controls={
                  view === "source" ? "exam-sources" : "exam-writing"
                }
                onClick={() => {
                  rememberAnswer();
                  changeWorkspace((previous) => ({ ...previous, view }));
                }}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "source"
                      : event.key === "End"
                        ? "answer"
                        : view === "source"
                          ? "answer"
                          : "source";
                  rememberAnswer();
                  changeWorkspace((previous) => ({ ...previous, view: next }));
                  document.getElementById(`workspace-tab-${next}`)?.focus();
                }}
              >
                {view === "source" ? "Source" : "Answer"}
              </button>
            ))}
          </div>
        )}
      </div>
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
      <div
        ref={deskRef}
        className={`exam-desk ${hasSources ? "" : "no-sources"}`}
        data-view={hasSources ? workspace.view : "answer"}
        style={{ "--source-width": `${workspace.width}%` } as CSSProperties}
      >
        {hasSources && (
          <>
            <div
              className="exam-source-pane"
              id="exam-sources"
              hidden={compact && workspace.view !== "source"}
            >
              <div
                className={`exam-mobile-question ${expandedQuestion ? "is-expanded" : ""}`}
              >
                {questionPrompt}
              </div>
              <SourceDesk
                question={question}
                resources={attempt.data.resources ?? []}
                state={workspace.sources}
                onChange={(update) =>
                  changeWorkspace((previous) => ({
                    ...previous,
                    sources: update(previous.sources),
                  }))
                }
                familyId={familyId}
                attemptId={id}
                visible={!compact || workspace.view === "source"}
              />
            </div>
            <div
              className="exam-divider"
              title="Drag or use arrow keys to resize. Press Enter or double-click to reset."
              role="separator"
              aria-label="Resize source and answer panes"
              aria-orientation="vertical"
              tabIndex={0}
              aria-valuemin={35}
              aria-valuemax={65}
              aria-valuenow={Math.round(workspace.width)}
              aria-valuetext={`${Math.round(workspace.width)}% source, ${Math.round(100 - workspace.width)}% answer`}
              onDoubleClick={() =>
                changeWorkspace((previous) => ({ ...previous, width: 50 }))
              }
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const width =
                  event.key === "Home"
                    ? 35
                    : event.key === "End"
                      ? 65
                      : event.key === "Enter"
                        ? 50
                        : Math.max(
                            35,
                            Math.min(
                              65,
                              workspace.width +
                                (event.key === "ArrowLeft" ? -2 : 2),
                            ),
                          );
                changeWorkspace((previous) => ({ ...previous, width }));
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (
                  !event.currentTarget.hasPointerCapture(event.pointerId) ||
                  !deskRef.current
                )
                  return;
                const box = deskRef.current.getBoundingClientRect();
                const width = Math.max(
                  35,
                  Math.min(65, ((event.clientX - box.x) / box.width) * 100),
                );
                changeWorkspace((previous) => ({ ...previous, width }));
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            >
              <span aria-hidden="true">⋮</span>
            </div>
          </>
        )}
        <section
          className="exam-writing-pane"
          id="exam-writing"
          hidden={compact && hasSources && workspace.view !== "answer"}
          aria-label="Answer booklet"
          ref={answerRef}
        >
          <div
            className={`exam-question ${expandedQuestion ? "is-expanded" : ""}`}
          >
            {questionPrompt}
            {attempt.mode === "guided" && editable && (
              <div className="exam-hints">
                <button
                  type="button"
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
                {hints.map((hint, i) => (
                  <p className="notice" key={i}>
                    {hint}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div
            className="exam-answer-body"
            onScrollCapture={rememberAnswer}
            onSelect={rememberAnswer}
            onBlurCapture={rememberAnswer}
          >
            <label htmlFor="answer" className="eyebrow">
              YOUR ANSWER
            </label>
            {question.format === "table" ? (
              <TableAnswer
                key={question.id}
                value={answer.text}
                columns={question.tableColumns ?? ["Item", "Answer"]}
                disabled={!editable}
                onChange={(text) => edit(question.id, text)}
              />
            ) : (
              <textarea
                key={question.id}
                ref={editorRef}
                id="answer"
                className="editor"
                onSelect={rememberAnswer}
                onScroll={rememberAnswer}
                onBlur={rememberAnswer}
                aria-label="Your answer"
                spellCheck={!["timed", "mock"].includes(attempt.mode)}
                value={answer.text}
                disabled={!editable}
                onChange={(e) => edit(question.id, e.target.value)}
                placeholder="Write your answer…"
              />
            )}
          </div>
          <div className="row exam-save-row">
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
          <div className="row answer-actions exam-answer-actions">
            {index > 0 && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await flush();
                    showQuestion(index - 1);
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
                    showQuestion(index + 1);
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
    </div>
  );
}
function QuestionPrompt({
  question,
  expanded,
  onExpand,
}: {
  question: any;
  expanded: boolean;
  onExpand: () => void;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    const measure = () => {
      if (!expanded)
        setOverflows(element.scrollHeight > element.clientHeight + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [question.text, expanded]);
  return (
    <>
      <div className="exam-question-heading">
        <h2 tabIndex={-1}>Question {question.number}</h2>
        <span className="exam-marks">
          [{question.marks} {question.marks === 1 ? "mark" : "marks"}]
        </span>
      </div>
      <div
        ref={textRef}
        className={`exam-question-text ${expanded ? "expanded" : ""}`}
        role="region"
        aria-label="Question text"
        tabIndex={overflows || expanded ? 0 : undefined}
      >
        <p className="question-text">{question.text}</p>
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          className="link-button"
          aria-expanded={expanded}
          onClick={onExpand}
        >
          {expanded ? "Reduce question area" : "Expand question area"}
        </button>
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
    <div className="card overflow exam-table-answer">
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
