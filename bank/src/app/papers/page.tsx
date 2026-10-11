import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/server/actions";
import { paperLabel } from "@/lib/labels";
import { listPapers } from "@/server/papers";
import { operator } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function PapersPage() {
  if (!(await operator())) redirect("/login");
  const papers = await listPapers();
  return (
    <>
      <header className="bar">
        <strong>Paper bank</strong>
        <form action={logout}><button className="secondary" type="submit">Sign out</button></form>
      </header>
      <main>
        <h1>Summer 2025</h1>
        {papers.length === 0 ? <p>No papers have been loaded yet.</p> : null}
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Paper</th>
                <th>Exam</th>
                <th>Status</th>
                <th>Accepted</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((paper) => (
                <tr key={paper.id}>
                  <td>
                    <Link href={`/papers/${paper.id}`}>
                      {paperLabel({
                        examDate: paper.exam_date,
                        series: paper.series,
                        subject: paper.subject,
                        code: paper.code,
                      })}
                    </Link>
                    <div className="muted">{paper.title}</div>
                  </td>
                  <td>{paper.exam_date}</td>
                  <td>{paper.status}</td>
                  <td>{paper.accepted}/{paper.questions}</td>
                  <td>{paper.issues?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
