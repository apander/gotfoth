import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmPermission, logout, publish } from "@/server/actions";
import { paperLabel } from "@/lib/labels";
import { paperDetail } from "@/server/papers";
import { operator } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function PaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await operator())) redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const detail = await paperDetail(id);
  if (!detail) redirect("/papers");
  const { paper, questions, issues } = detail;
  const accepted = questions.filter((question) => question.decision === "accept").length;
  return (
    <>
      <header className="bar">
        <strong><Link href="/papers">Paper bank</Link></strong>
        <form action={logout}><button className="secondary" type="submit">Sign out</button></form>
      </header>
      <main>
        <h1>
          {paperLabel({
            examDate: paper.exam_date,
            series: paper.series,
            subject: paper.subject,
            code: paper.code,
          })}
        </h1>
        <p className="muted">{paper.title} · {paper.series} · {paper.exam_date} · scheme {paper.revised_on}</p>
        {query.error ? <p className="warn">{query.error}</p> : null}
        {issues.length ? (
          <div className="card">
            <h2>Checks</h2>
            <ul>{[...new Set(issues)].map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </div>
        ) : <p>Mark totals, schemes, and extracts check out.</p>}
        <form className="card" action={confirmPermission}>
          <input type="hidden" name="paperId" value={paper.id} />
          <label>
            <input type="checkbox" name="permission" value="yes" defaultChecked={paper.permission_confirmed} />
            {" "}I confirm these papers may be stored for this tutoring app.
          </label>
          <button type="submit">Save permission</button>
        </form>
        <form action={publish}>
          <input type="hidden" name="paperId" value={paper.id} />
          <button type="submit">Publish ({accepted}/{questions.length} accepted)</button>
        </form>
        <div className="card">
          <table>
            <thead>
              <tr><th>Part</th><th>Marks</th><th>Command</th><th>Review</th></tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <tr key={question.id}>
                  <td>
                    <Link href={`/papers/${paper.id}/questions/${question.id}`}>
                      {question.section} {question.parent_number}({question.part})
                    </Link>
                    <div className="muted prose">{question.stem.slice(0, 160)}</div>
                  </td>
                  <td>{question.marks}</td>
                  <td>{question.command_word}</td>
                  <td>{question.decision ?? "pending"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paper.guidance ? (
          <details className="card">
            <summary>General marking guidance</summary>
            <div className="prose">{paper.guidance.slice(0, 2500)}</div>
          </details>
        ) : null}
        {paper.instructions ? <p className="muted">{paper.instructions}</p> : null}
      </main>
    </>
  );
}
