"use client";
import { PageHeading, Empty } from "./ui";
import { score } from "./revision";

function subjectName(value: string) {
  return value === "psychology" ? "Psychology" : "Business";
}
function latestResult(data: any, learnerId: string) {
  return data.assessments.find((item: any) => item.learner_id === learnerId);
}
export function suggestion(data: any, learnerId: string) {
  const course = data.enrolments.find((item: any) => item.learner_id === learnerId);
  const open = data.attempts.find(
    (item: any) =>
      item.learner_id === learnerId &&
      ["draft", "in_progress"].includes(item.state),
  );
  const latest = latestResult(data, learnerId);
  if (!course) return "They have not set up a course yet.";
  if (latest?.state === "awaiting_funds")
    return "Marking is waiting for the parent to add credit.";
  if (latest && ["needs_review", "failed"].includes(latest.state))
    return "A submitted paper needs a result check.";
  if (open) return "A practice session is still open.";
  const marks = score(latest?.effective);
  if (!latest || !marks) return "Suggest a first practice session.";
  if (marks.percentage < 60)
    return `Latest result is ${marks.percentage}%. Suggest another short practice before a full paper.`;
  return `Latest result is ${marks.percentage}%. A fresh paper is a reasonable next step.`;
}
export function ParentMonitor({
  data,
  onAssessment,
}: {
  data: any;
  onAssessment: (id: string) => void;
}) {
  return (
    <>
      <PageHeading
        label="PROGRESS"
        title="How study is going."
        text="Published results only. Students choose their own courses and practice."
      />
      {!data.learners.length ? (
        <Empty title="No students yet" text="Students appear here after they join the family." />
      ) : (
        data.learners.map((learner: any) => {
          const courses = data.enrolments.filter(
            (item: any) => item.learner_id === learner.id,
          );
          const results = data.assessments.filter(
            (item: any) =>
              item.learner_id === learner.id && item.state === "published",
          );
          return (
            <section className="card stack" key={learner.id} style={{ marginTop: 16 }}>
              <h2>{learner.name}</h2>
              <p className="muted">
                {courses.length
                  ? courses
                      .map(
                        (item: any) =>
                          `${subjectName(item.data.subject)} · ${item.data.targetSession}`,
                      )
                      .join(" · ")
                  : "No course set up yet."}
              </p>
              {results.slice(0, 4).map((item: any) => {
                const marks = score(item.effective);
                return (
                  <div className="row" key={item.id}>
                    <span>
                      {item.mode} · {new Date(item.submitted_at).toLocaleDateString()}
                    </span>
                    <button className="button secondary small" onClick={() => onAssessment(item.id)}>
                      {marks ? `${marks.percentage}%` : "View"}
                    </button>
                  </div>
                );
              })}
              {!results.length && <p className="muted">No published results yet.</p>}
            </section>
          );
        })
      )}
    </>
  );
}
export function TeacherStudents({
  data,
  onAssessment,
}: {
  data: any;
  onAssessment: (id: string) => void;
}) {
  return (
    <>
      <PageHeading
        label="STUDENTS"
        title="Results."
        text="Published scores and papers that still need a check. Courses stay with the student."
      />
      {!data.learners.length ? (
        <Empty title="No students yet" text="Students appear here after they join the family." />
      ) : (
        <section className="card family-grid">
          <div className="overflow">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Latest result</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.learners.map((learner: any) => {
                  const courses = data.enrolments.filter(
                    (item: any) => item.learner_id === learner.id,
                  );
                  const latest = latestResult(data, learner.id);
                  const marks = score(latest?.effective);
                  const check =
                    latest &&
                    ["needs_review", "failed", "awaiting_funds"].includes(latest.state);
                  return (
                    <tr key={learner.id}>
                      <td>{learner.name}</td>
                      <td>
                        {courses.length
                          ? courses
                              .map((item: any) => subjectName(item.data.subject))
                              .join(", ")
                          : "—"}
                      </td>
                      <td>
                        {marks
                          ? `${marks.percentage}%`
                          : latest
                            ? latest.state.replaceAll("_", " ")
                            : "—"}
                      </td>
                      <td>
                        {latest && (marks || check) && (
                          <button
                            type="button"
                            className="button secondary small"
                            onClick={() => onAssessment(latest.id)}
                          >
                            {check ? "Check" : "View"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
export function TeacherGuidance({ data }: { data: any }) {
  return (
    <>
      <PageHeading
        label="GUIDANCE"
        title="Next best action."
        text="One suggestion per student, from their course and latest result."
      />
      {!data.learners.length ? (
        <Empty title="No students yet" text="Suggestions appear when students join the family." />
      ) : (
        data.learners.map((learner: any) => (
          <section className="card" key={learner.id} style={{ marginTop: 16 }}>
            <h2>{learner.name}</h2>
            <p>{suggestion(data, learner.id)}</p>
          </section>
        ))
      )}
    </>
  );
}
