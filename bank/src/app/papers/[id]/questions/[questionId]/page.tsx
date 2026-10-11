import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmTopic, logout, removeTopic, reviewQuestion } from "@/server/actions";
import { paperLabel } from "@/lib/labels";
import { questionDetail } from "@/server/papers";
import { operator } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string; questionId: string }>;
}) {
  if (!(await operator())) redirect("/login");
  const { id, questionId } = await params;
  const detail = await questionDetail(questionId);
  if (!detail || detail.question.paper_id !== id) redirect(`/papers/${id}`);
  const { question } = detail;
  const label = paperLabel({
    examDate: question.exam_date,
    series: question.series,
    subject: question.subject,
    code: question.code,
  });
  return (
    <>
      <header className="bar">
        <strong><Link href={`/papers/${id}`}>{label}</Link></strong>
        <form action={logout}><button className="secondary" type="submit">Sign out</button></form>
      </header>
      <main>
        <h1>{label}</h1>
        <p className="muted">
          Section {question.section} · {question.parent_number}({question.part}) · {question.marks} marks · {question.command_word} · {question.response_format}
        </p>
        <div className="review">
        <section>
          {detail.review ? <p>Latest review: {detail.review.decision}. {detail.review.note}</p> : <p>Not reviewed yet.</p>}
          <div className="card prose">{question.stem}</div>
          <div className="card">
            <h2>Mark scheme</h2>
            <p>
              Knowledge {question.ao_knowledge}, Application {question.ao_application}, Analysis {question.ao_analysis}, Evaluation {question.ao_evaluation}
              {question.quantitative_skills?.length ? ` · ${question.quantitative_skills.join(", ")}` : ""}
            </p>
            {detail.credits.map((credit) => (
              <div key={credit.strand}>
                <p><strong>{credit.strand}</strong> ({credit.marks})</p>
                <div className="prose">{credit.examples || credit.criterion}</div>
                {credit.award_note ? <p className="muted">{credit.award_note}</p> : null}
              </div>
            ))}
            {detail.indicative.map((point, index) => (
              <p key={`${point.role}-${index}`}><strong>{point.role}.</strong> {point.text}</p>
            ))}
            {detail.bands.map((band) => (
              <p key={band.level}><strong>Level {band.level}</strong> {band.min_mark}–{band.max_mark}. {band.descriptor}</p>
            ))}
            <details>
              <summary>Scheme text</summary>
              <div className="prose">{question.source_text}</div>
            </details>
          </div>
          <div className="card">
            <h2>Topics</h2>
            <ul>
              {detail.linked.map((topic) => (
                <li key={topic.id}>
                  {topic.theme}: {topic.label}
                  <form action={removeTopic}>
                    <input type="hidden" name="questionId" value={question.id} />
                    <input type="hidden" name="paperId" value={id} />
                    <input type="hidden" name="topicId" value={topic.id} />
                    <button className="secondary" type="submit">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={confirmTopic} className="row">
              <input type="hidden" name="questionId" value={question.id} />
              <input type="hidden" name="paperId" value={id} />
              <select name="topicId" aria-label="Topic">
                {detail.topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.theme}: {topic.label}</option>
                ))}
              </select>
              <button type="submit">Confirm topic</button>
            </form>
          </div>
          <form className="card" action={reviewQuestion}>
            <input type="hidden" name="revisionId" value={question.revision_id} />
            <input type="hidden" name="questionId" value={question.id} />
            <input type="hidden" name="paperId" value={id} />
            <label htmlFor="note">Note</label>
            <textarea id="note" name="note" />
            <div className="row">
              <button type="submit" name="decision" value="accept">Accept</button>
              <button className="secondary" type="submit" name="decision" value="reject">Reject</button>
            </div>
          </form>
        </section>
        <aside>
          <h2>Source pages</h2>
          {detail.pages.map((page) => (
            <article className="card" key={page.page_number}>
              <h3>Page {page.page_number}</h3>
              <div className="prose">{page.text}</div>
            </article>
          ))}
          <h2>Extracts</h2>
          {detail.extracts.map((extract) => (
            <article className="card" key={extract.label}>
              <h3>Extract {extract.label}{extract.cited ? "" : " (section)"}</h3>
              {extract.figures.length ? (
                extract.figures.map((figure) => (
                  <img
                    key={figure.id}
                    className="paper-figure"
                    src={`/api/figures/${figure.id}`}
                    width={figure.width}
                    height={figure.height}
                    alt={`Extract ${extract.label} as printed`}
                  />
                ))
              ) : (
                <div className="prose">{extract.text || "The wording is on the figure page."}</div>
              )}
            </article>
          ))}
        </aside>
        </div>
      </main>
    </>
  );
}
