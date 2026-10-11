"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { QuestionExtracts } from "./extracts";
import { PageHeading } from "./ui";

function questionGroups(questions: any[]) {
  const groups: { parent: number; section: string; items: any[] }[] = [];
  for (const item of questions) {
    const found = groups.find((group) => group.parent === item.parent_number);
    if (found) found.items.push(item);
    else groups.push({ parent: item.parent_number, section: item.section, items: [item] });
  }
  return groups;
}

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
  const [receipt, setReceipt] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function openPaper(id: string, stay = false) {
    const detail = await api(`family/exam-paper?family=${familyId}&id=${id}`);
    setPaper(detail);
    if (!stay) setQuestion(null);
  }
  async function openQuestion(id: string) {
    const detail = await api(`family/exam-question?family=${familyId}&id=${id}`);
    setQuestion(detail);
    setNote(detail.review?.note ?? "");
    setTopicId(detail.linkedTopicIds?.[0] ?? detail.topics?.[0]?.id ?? "");
  }
  async function publishAccepted(paperId: string) {
    setSaving(true);
    setReceipt("Publishing accepted parts…");
    try {
      const result = await api("family/exam-publish", { familyId, paperId });
      if (question) await openPaper(paperId, true);
      else await openPaper(paperId);
      await loadPapers();
      const count = Number(result.published);
      setReceipt(`Published ${count} accepted part${count === 1 ? "" : "s"}.`);
    } catch (error) {
      setReceipt("");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  if (!papers) return <p className="muted">Loading papers…</p>;
  if (question) {
    const sequence: any[] = paper?.questions ?? [];
    const place = sequence.findIndex((item) => item.id === question.question.id);
    const earlier = sequence[place - 1];
    const later = sequence[place + 1];
    const label = `${question.question.parent_number}(${question.question.part})`;
    async function decide(decision: "accept" | "reject") {
      setSaving(true);
      setReceipt(`Saving ${label}…`);
      try {
        await api("family/exam-review", {
          familyId,
          revisionId: question.question.revision_id,
          paperId: question.question.paper_id,
          decision,
          note,
        });
        await openPaper(question.question.paper_id, true);
        await openQuestion(question.question.id);
        setReceipt(decision === "accept" ? `${label} accepted.` : `${label} rejected.`);
      } catch (error) {
        setReceipt("");
        throw error;
      } finally {
        setSaving(false);
      }
    }
    return (
      <>
        <PageHeading
          label="PAPER MANAGEMENT"
          title={question.question.label}
          text={`Section ${question.question.section} · ${question.question.parent_number}(${question.question.part}) · ${question.question.marks} marks`}
        />
        <div className="row review-bar">
          <button className="link-button" onClick={() => setQuestion(null)}>
            Back to paper
          </button>
          <button
            className="button secondary"
            disabled={saving || !earlier}
            onClick={() =>
              earlier &&
              run(async () => {
                setReceipt("");
                await openQuestion(earlier.id);
              })
            }
          >
            Back
          </button>
          <button
            className="button secondary"
            disabled={saving || !later}
            onClick={() =>
              later &&
              run(async () => {
                setReceipt("");
                await openQuestion(later.id);
              })
            }
          >
            Forward
          </button>
          {question.review?.decision === "accept" ? <span className="badge">Accepted</span> : null}
          {question.review?.decision === "reject" ? <span className="badge">Rejected</span> : null}
          <button className="button" disabled={saving} onClick={() => run(() => decide("accept"))}>
            {saving ? "Saving…" : "Accept"}
          </button>
          <button className="button secondary" disabled={saving} onClick={() => run(() => decide("reject"))}>
            Reject
          </button>
          <button
            className="button secondary"
            disabled={saving || question.review?.decision !== "accept"}
            onClick={() => run(() => publishAccepted(question.question.paper_id))}
          >
            Publish accepted
          </button>
        </div>
        {receipt ? (
          <p role="status" className="notice">
            {receipt}
          </p>
        ) : null}
        {question.review ? (
          <p className="muted">
            Latest review: {question.review.decision}. {question.review.note}
          </p>
        ) : null}
        <section className="card" style={{ marginTop: 8 }}>
          <label className="field">
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
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
        </section>
        <div className="approval">
          <div className="player">
            <section className="question-panel">
              <div className="section-advice">
                <p className="eyebrow">SECTION {question.question.section}</p>
                {question.question.instruction ? <p>{question.question.instruction}</p> : null}
              </div>
              <div className="row">
                <span className="eyebrow">
                  QUESTION {question.question.parent_number}({question.question.part})
                </span>
                <span className="badge">{question.question.marks} marks</span>
              </div>
              <p className="question-text" style={{ marginTop: 24 }}>
                {question.question.stem}
              </p>
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
          <div className="extract-column">
            <p className="eyebrow">
              SECTION {question.question.section} · QUESTION {question.question.parent_number}
            </p>
            <QuestionExtracts extracts={question.extracts} />
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
      </>
    );
  }
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
          <p>
            {(paper.questions as any[]).filter((item) => item.decision === "accept").length} of{" "}
            {paper.questions.length} parts accepted. You can publish the accepted parts before the
            rest are reviewed.
          </p>
          {receipt ? (
            <p role="status" className="notice">
              {receipt}
            </p>
          ) : null}
          <button
            className="button"
            disabled={
              saving || !(paper.questions as any[]).some((item) => item.decision === "accept")
            }
            onClick={() => run(() => publishAccepted(paper.paper.id))}
          >
            {saving ? "Publishing…" : "Publish accepted parts"}
          </button>
        </section>
        {questionGroups(paper.questions).map((group) => (
          <section key={group.parent} style={{ marginTop: 28 }}>
            <h2>
              Question {group.parent}
              <span className="muted"> · Section {group.section}</span>
            </h2>
            {group.items.map((item: any) => (
              <button
                className="list-item"
                key={item.id}
                style={{ display: "block", width: "100%", textAlign: "left", marginTop: 12 }}
                onClick={() => run(() => openQuestion(item.id))}
              >
                <strong>
                  {item.parent_number}({item.part})
                </strong>
                <span className="muted">
                  {" "}
                  · {item.marks} marks · {item.decision ?? "pending"}
                </span>
                <div>{item.stem.slice(0, 180)}</div>
              </button>
            ))}
          </section>
        ))}
      </>
    );
  return (
    <>
      <PageHeading
        label="PAPER MANAGEMENT"
        title="Exam papers."
        text="Accept a part, then publish the accepted parts. The rest of the paper can follow later."
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
