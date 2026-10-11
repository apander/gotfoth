"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { PageHeading } from "./ui";

export function PaperDesk({
  familyId,
  run,
}: {
  familyId: string;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [papers, setPapers] = useState<any[] | null>(null);
  const [paper, setPaper] = useState<any>(null);
  const [question, setQuestion] = useState<any>(null);
  const [note, setNote] = useState("");
  const [topicId, setTopicId] = useState("");

  async function loadPapers() {
    const rows = await api(`family/exam-papers?family=${familyId}`);
    setPapers(rows);
  }
  useEffect(() => {
    setPapers(null);
    setPaper(null);
    setQuestion(null);
    void loadPapers().catch(() => setPapers([]));
  }, [familyId]);

  async function openPaper(id: string) {
    const detail = await api(`family/exam-paper?family=${familyId}&id=${id}`);
    setPaper(detail);
    setQuestion(null);
  }
  async function openQuestion(id: string) {
    const detail = await api(`family/exam-question?family=${familyId}&id=${id}`);
    setQuestion(detail);
    setNote(detail.review?.note ?? "");
    setTopicId(detail.linkedTopicIds?.[0] ?? detail.topics?.[0]?.id ?? "");
  }

  if (!papers) return <p className="muted">Loading papers…</p>;
  if (question)
    return (
      <>
        <PageHeading
          label="PAPER MANAGEMENT"
          title={question.question.label}
          text={`Section ${question.question.section} · ${question.question.parent_number}(${question.question.part}) · ${question.question.marks} marks`}
        />
        <button className="link-button" onClick={() => setQuestion(null)}>
          Back to paper
        </button>
        <div className="approval">
          <div className="player">
            <section className="question-panel">
              <div className="row">
                <span className="eyebrow">
                  QUESTION {question.question.parent_number}({question.question.part})
                </span>
                <span className="badge">{question.question.marks} marks</span>
              </div>
              <p className="question-text" style={{ marginTop: 24 }}>
                {question.question.stem}
              </p>
              {question.extracts.map((extract: any) => (
                <section className="source" key={extract.label}>
                  <h3>Extract {extract.label}</h3>
                  {extract.figures.length
                    ? extract.figures.map((figure: any) => (
                        <img
                          key={figure.id}
                          alt={`Extract ${extract.label} as printed`}
                          src={`/api/figures/${figure.id}`}
                          style={{ width: "100%", height: "auto", background: "white" }}
                        />
                      ))
                    : extract.text
                        .split("\n")
                        .filter(Boolean)
                        .map((line: string) => <p key={line}>{line}</p>)}
                </section>
              ))}
            </section>
            <section className="answer-panel">
              <label className="eyebrow" htmlFor="student-answer">
                YOUR ANSWER
              </label>
              <textarea
                id="student-answer"
                className="editor"
                readOnly
                aria-label="Student answer"
                placeholder="Write your answer…"
              />
            </section>
          </div>
          <div>
            <p className="eyebrow">ORIGINAL PAPER</p>
            <iframe
              className="paper-frame"
              title="Original question paper"
              src={`/api/exam-papers/${question.question.paper_id}#page=${question.question.source_pages?.[0] ?? 1}`}
            />
          </div>
        </div>
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Topic</h2>
          <label className="field">
            Specification topic
            <select value={topicId} onChange={(event) => setTopicId(event.target.value)}>
              {question.topics.map((topic: any) => (
                <option key={topic.id} value={topic.id}>
                  {topic.theme}: {topic.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button secondary"
            onClick={() =>
              run(async () => {
                await api("family/exam-topic", {
                  familyId,
                  questionId: question.question.id,
                  topicId,
                  confirmed: true,
                });
                await openQuestion(question.question.id);
              })
            }
          >
            Confirm topic
          </button>
          <label className="field">
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="row">
            <button
              className="button"
              onClick={() =>
                run(async () => {
                  await api("family/exam-review", {
                    familyId,
                    revisionId: question.question.revision_id,
                    paperId: question.question.paper_id,
                    decision: "accept",
                    note,
                  });
                  await openQuestion(question.question.id);
                  await openPaper(question.question.paper_id);
                })
              }
            >
              Accept
            </button>
            <button
              className="button secondary"
              onClick={() =>
                run(async () => {
                  await api("family/exam-review", {
                    familyId,
                    revisionId: question.question.revision_id,
                    paperId: question.question.paper_id,
                    decision: "reject",
                    note,
                  });
                  await openQuestion(question.question.id);
                })
              }
            >
              Reject
            </button>
          </div>
          {question.review ? (
            <p className="muted">
              Latest review: {question.review.decision}. {question.review.note}
            </p>
          ) : null}
        </section>
      </>
    );
  if (paper)
    return (
      <>
        <PageHeading
          label="PAPER MANAGEMENT"
          title={paper.paper.label}
          text={`${paper.paper.status} · ${paper.questions.length} parts`}
        />
        <button className="link-button" onClick={() => setPaper(null)}>
          All papers
        </button>
        <section className="card" style={{ marginTop: 16 }}>
          <label className="field">
            <input
              type="checkbox"
              checked={paper.paper.permission_confirmed}
              onChange={(event) =>
                run(async () => {
                  await api("family/exam-permission", {
                    familyId,
                    paperId: paper.paper.id,
                    confirmed: event.target.checked,
                  });
                  await openPaper(paper.paper.id);
                })
              }
            />{" "}
            I confirm these papers may be stored for this tutoring app.
          </label>
          <button
            className="button"
            onClick={() =>
              run(async () => {
                await api("family/exam-publish", { familyId, paperId: paper.paper.id });
                await openPaper(paper.paper.id);
                await loadPapers();
              })
            }
          >
            Publish
          </button>
        </section>
        {paper.questions.map((item: any) => (
          <button
            className="list-item"
            key={item.id}
            style={{ display: "block", width: "100%", textAlign: "left", marginTop: 12 }}
            onClick={() => run(() => openQuestion(item.id))}
          >
            <strong>
              {item.section} {item.parent_number}({item.part})
            </strong>
            <span className="muted">
              {" "}
              · {item.marks} marks · {item.decision ?? "pending"}
            </span>
            <div>{item.stem.slice(0, 180)}</div>
          </button>
        ))}
      </>
    );
  return (
    <>
      <PageHeading
        label="PAPER MANAGEMENT"
        title="Exam papers."
        text="Review each question against the printed paper, then publish it for students and parents."
      />
      {papers.length === 0 ? (
        <p className="muted">No exam papers have been loaded yet.</p>
      ) : (
        papers.map((item) => (
          <button
            className="list-item"
            key={item.id}
            style={{ display: "block", width: "100%", textAlign: "left", marginTop: 12 }}
            onClick={() => run(() => openPaper(item.id))}
          >
            <strong>{item.label}</strong>
            <span className="muted">
              {" "}
              · {item.status} · {item.accepted}/{item.questions} accepted
            </span>
          </button>
        ))
      )}
    </>
  );
}
