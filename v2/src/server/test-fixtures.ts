import { createHash } from "node:crypto";
import type { Tx } from "./db";
import {
  testAccounts,
  testFamilyIds,
  testLearnerId,
} from "../lib/test-accounts";
import { Paper, Enrolment } from "../lib/contracts";
import { validatePaper, validateResult } from "../lib/domain";
import { simulatedFeedback } from "../lib/test-feedback";
import { RateCard } from "./finance";
export const fixtureId = (label: string) => {
  const h = createHash("sha256")
    .update(`gotfoth-ux-fixtures:${label}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const fixtureRate = RateCard.parse({
  label: "UX TEST ONLY · simulated marking",
  model: "gotfoth-ux-simulator",
  reviewModel: "gotfoth-ux-simulator",
  promptVersion: "ux-fixture-v1",
  inputMicrosPerMillion: 0,
  outputMicrosPerMillion: 1,
  reviewInputMicrosPerMillion: 0,
  reviewOutputMicrosPerMillion: 1,
  maxOutputTokens: 500,
  maxAnswerChars: 10000,
  markupBasisPoints: 10000,
});
export function fixturePaper(subject: "psychology" | "business") {
  const topics =
    subject === "psychology"
      ? ["research.methods", "clinical.psychology"]
      : ["business.strategy", "business.finance"];
  const questions = [1, 2, 3, 4].map((n) => ({
    id: `ux-${subject}-q${n}`,
    number: String(n),
    text:
      subject === "psychology"
        ? [
            "Explain one limitation of using a small sample in research.",
            "Explain how a psychologist could improve the reliability of an interview.",
            "Describe one ethical consideration when researching mental health.",
            "Evaluate one strength and one limitation of using case studies.",
          ][n - 1]
        : [
            "Explain one reason a business might expand into a new market.",
            "Explain how cash-flow forecasts can support a business decision.",
            "Describe one limitation of market research.",
            "Evaluate one advantage and one risk of a growth strategy.",
          ][n - 1],
    marks: n % 2 ? 4 : 6,
    format: "essay",
    section: "A",
    resourceIds: [],
    topics: [topics[(n - 1) % 2]],
    pages: [1],
    rubric: {
      id: `ux-${subject}-rubric${n}`,
      text: "Credit a clear explanation supported by a relevant example.",
      levels: false,
      pages: [1],
    },
    hints: ["Make a clear point, explain it, then give a relevant example."],
  }));
  const paper = Paper.parse({
    id: fixtureId(`paper-${subject}`),
    version: 1,
    subject,
    qualification: subject === "psychology" ? "YPS01" : "YBS11",
    specification: "2026",
    unit: subject === "psychology" ? "WPS04/01" : "WBS14/01",
    year: 2026,
    session: "June",
    variant: "UX",
    title: `UX test practice · ${subject} (synthetic)`,
    durationMinutes: 20,
    totalMarks: 20,
    instructions:
      "Fictional questions for workflow testing. Answer all questions. No qualification grade is implied.",
    generalRubric:
      "Credit a clear explanation supported by a relevant example.",
    permittedMaterials: "No additional materials needed.",
    resources: [],
    questions,
    choices: [],
    compatibleSpecifications: ["2026"],
    sourceIds: [
      fixtureId(`source-${subject}-questions`),
      fixtureId(`source-${subject}-rubric`),
    ],
    fullMockEligible: true,
    permissionConfirmed: true,
  });
  const issues = validatePaper(paper);
  if (issues.length) throw new Error(issues.join(" "));
  return paper;
}
export function fixtureExamPaper(subject: "psychology" | "business") {
  const base = fixturePaper(subject);
  const sourceId = `ux-${subject}-exam-source`;
  const questions = base.questions.map((q, i) => ({
    ...q,
    id: `ux-${subject}-exam-q${i + 1}`,
    number: `1(${String.fromCharCode(97 + i)})`,
    resourceIds: [sourceId],
    text: (subject === "psychology"
      ? [
          "Using Study A, explain one limitation of the sampling method used by the researcher.",
          "Using Study A, explain how the researcher could improve the reliability of the interviews.",
          "Explain one ethical issue the researcher should consider when carrying out Study A.",
          "Evaluate the use of interviews to investigate stress. Refer to Study A in your answer.",
        ]
      : [
          "Using Extract A, explain one reason why Aster Cycles might expand into a new market.",
          "Using the data in Extract A, explain how a cash-flow forecast could help Aster Cycles decide whether to expand.",
          "Using Extract A, explain one limitation of the market research conducted by Aster Cycles.",
          "Evaluate whether Aster Cycles should expand overseas. Use the information in Extract A in your answer.",
        ])[i],
    rubric: { ...q.rubric, id: `ux-${subject}-exam-rubric${i + 1}` },
  }));
  const resource =
    subject === "psychology"
      ? {
          id: sourceId,
          title: "Study A · fictional psychology study",
          text: "A researcher investigated stress among students at one sixth-form school. Twelve volunteers, all aged 17, took part after a teacher asked one psychology class for volunteers.\nEach student completed a stress questionnaire and a 15-minute interview. The researcher asked open-ended questions about schoolwork, sleep and coping strategies. Some follow-up questions differed between interviews.\nInterviews were recorded and students’ names were written on the transcripts. The researcher intended to discuss the findings with the students’ teachers.\nThe table summarises the questionnaire responses. Higher scores indicate greater reported stress. These are fictional data for UX testing, not findings from a real study.",
          table: {
            caption: "Table 1 · Reported stress (synthetic data)",
            columns: ["Stress score", "Number of students"],
            rows: [
              ["0–3", "2"],
              ["4–6", "7"],
              ["7–10", "3"],
              ["Total", "12"],
            ],
          },
        }
      : {
          id: sourceId,
          title: "Extract A · Aster Cycles (fictional business)",
          text: "Aster Cycles designs and sells bicycles in the UK. Its directors are considering investing £2 million to enter an overseas market.\nSales revenue and UK market share have increased, but operating costs have also risen. The directors expect overseas demand to grow; exchange-rate changes could increase costs.\nThe marketing manager surveyed 20 existing UK customers about buying bicycles abroad. Most said they liked the company’s products. The business has not yet surveyed customers in the proposed overseas market.\nThese are fictional figures for UX testing, not an official examination extract.",
          table: {
            caption: "Table 1 · Business performance (synthetic data)",
            columns: ["Measure", "2024", "2025"],
            rows: [
              ["Sales revenue (£m)", "12.0", "13.5"],
              ["Operating costs (£m)", "9.0", "10.8"],
              ["UK market share (%)", "8.0", "9.2"],
              ["Closing cash balance (£m)", "2.0", "1.3"],
            ],
          },
        };
  return Paper.parse({
    ...base,
    id: fixtureId(`exam-paper-${subject}`),
    title: `Exam workspace example · ${subject} (synthetic)`,
    variant: "UX-EXAM",
    instructions:
      "Fictional exam-style practice for UX testing. Read the supporting study or extract and answer all four parts. This is not an official examination paper. Marking is simulated.",
    questions,
    resources: [resource],
    fullMockEligible: true,
  });
}
export async function seedExamExamples(tx: Tx) {
  for (const subject of ["psychology", "business"] as const) {
    const paper = fixtureExamPaper(subject);
    const issues = validatePaper(paper);
    if (issues.length) throw new Error(issues.join(" "));
    await tx.query(
      "INSERT INTO catalogue(id,identity,version,status,data,approved_by,published_at) VALUES($1,$2,1,'published',$3,'ux-fixture-system',now()) ON CONFLICT(id) DO NOTHING",
      [paper.id, `ux-exam-example-${subject}`, JSON.stringify(paper)],
    );
    for (const familyId of Object.values(testFamilyIds))
      await tx.query(
        "INSERT INTO catalogue_releases(family_id,paper_id,released_by) VALUES($1,$2,'ux-fixture-system') ON CONFLICT DO NOTHING",
        [familyId, paper.id],
      );
  }
}
export async function seedTestFixtures(tx: Tx, reset = false) {
  const ids = Object.values(testFamilyIds);
  const existing = (
    await tx.query("SELECT id,name FROM families WHERE id=ANY($1::uuid[])", [
      ids,
    ])
  ).rows;
  for (const f of existing)
    if (!f.name.startsWith("[Test] "))
      throw new Error("A reserved fixture family ID belongs to non-test data.");
  const owners = (
    await tx.query('SELECT id,email FROM "user" WHERE id=ANY($1::text[])', [
      testAccounts.map((a) => a.id),
    ])
  ).rows;
  for (const user of owners)
    if (!testAccounts.some((a) => a.id === user.id && a.email === user.email))
      throw new Error("A reserved fixture account ID has a different email.");
  if (reset) {
    const outside = await tx.query(
      "SELECT user_id FROM memberships WHERE user_id=ANY($1::text[]) AND NOT(family_id=ANY($2::uuid[]))",
      [testAccounts.map((a) => a.id), ids],
    );
    if (outside.rows.length)
      throw new Error(
        "A test account belongs to a non-fixture family; reset refused.",
      );
    const owner = (
      await tx.query(
        "SELECT current_user=pg_get_userbyid(relowner) AS allowed FROM pg_class WHERE oid='submissions'::regclass",
      )
    ).rows[0];
    if (!owner.allowed) throw new Error("Reset requires the owner connection.");
    await tx.query("SELECT set_config('app.privacy_purge','true',true)");
    for (const table of [
      "corrective_tasks",
      "review_decisions",
      "usage_events",
      "assessments",
      "recovered_work",
      "submissions",
      "reservations",
      "quotes",
      "answers",
      "study_sessions",
      "attempts",
      "exposure",
      "enrolments",
      "catalogue_releases",
      "parent_links",
      "invitations",
      "memberships",
      "ledger",
      "learners",
      "payments",
      "funding_accounts",
      "outbox",
      "audit_events",
    ])
      await tx.query(`DELETE FROM ${table} WHERE family_id=ANY($1::uuid[])`, [
        ids,
      ]);
    await tx.query("DELETE FROM families WHERE id=ANY($1::uuid[])", [ids]);
    await tx.query('DELETE FROM session WHERE "userId"=ANY($1::text[])', [
      testAccounts.map((a) => a.id),
    ]);
  }
  for (const a of testAccounts) {
    await tx.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true) ON CONFLICT(id) DO NOTHING',
      [a.id, a.name, a.email],
    );
  }
  await tx.query(
    'DELETE FROM account WHERE "providerId"=\'credential\' AND "userId"=ANY($1::text[])',
    [testAccounts.map((account) => account.id)],
  );
  await tx.query(
    `INSERT INTO "user"(id,name,email,"emailVerified") VALUES('ux-fixture-system','UX fixture setup','system@ux.gotfoth.test',true) ON CONFLICT DO NOTHING`,
  );
  const cardId = fixtureId("rate");
  await tx.query(
    "INSERT INTO rate_cards(id,data,active) VALUES($1,$2,false) ON CONFLICT(id) DO UPDATE SET active=false",
    [cardId, JSON.stringify(fixtureRate)],
  );
  for (const subject of ["psychology", "business"] as const) {
    const paper = fixturePaper(subject);
    for (const [n, id] of paper.sourceIds.entries())
      await tx.query(
        "INSERT INTO source_documents(id,fingerprint,filename,metadata) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
        [
          id,
          `ux-source-${subject}-${n}`,
          `UX synthetic ${subject} ${n ? "rubric" : "questions"}`,
          JSON.stringify({ synthetic: true }),
        ],
      );
    await tx.query(
      "INSERT INTO catalogue(id,identity,version,status,data,approved_by,published_at) VALUES($1,$2,1,'published',$3,'ux-fixture-system',now()) ON CONFLICT(id) DO NOTHING",
      [paper.id, `ux-fixture-${subject}`, JSON.stringify(paper)],
    );
  }
  for (const [name, id] of Object.entries(testFamilyIds)) {
    await tx.query(
      "INSERT INTO families(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
      [id, `[Test] ${name} family`],
    );
    await tx.query(
      "INSERT INTO funding_accounts(family_id,balance) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, name === "Brook" ? 0 : 25000000],
    );
    for (const subject of ["psychology", "business"] as const)
      await tx.query(
        "INSERT INTO catalogue_releases(family_id,paper_id,released_by) VALUES($1,$2,'ux-fixture-system') ON CONFLICT DO NOTHING",
        [id, fixtureId(`paper-${subject}`)],
      );
    await tx.query(
      "INSERT INTO ledger(id,family_id,amount,kind,idempotency_key,reference) VALUES($1,$2,$3,'test_credit',$4,'UX fixture opening credit') ON CONFLICT DO NOTHING",
      [
        fixtureId(`opening-${name}`),
        id,
        name === "Brook" ? 0 : 25000000,
        `ux-opening-${name}`,
      ],
    );
  }
  const students = testAccounts.filter((a) => a.role === "student");
  for (const [index, a] of students.entries()) {
    const familyId = testFamilyIds[a.family as keyof typeof testFamilyIds],
      learner = testLearnerId(index);
    await tx.query(
      "INSERT INTO learners(id,family_id,name,email,weekly_goal,goal_timezone) VALUES($1,$2,$3,$4,3,'Europe/Amsterdam') ON CONFLICT(id) DO NOTHING",
      [learner, familyId, a.name, a.email],
    );
    await tx.query(
      "INSERT INTO memberships(user_id,family_id,role,learner_id) VALUES($1,$2,'student',$3) ON CONFLICT DO NOTHING",
      [a.id, familyId, learner],
    );
    if (a.key !== "casey")
      for (const subject of [
        "psychology",
        ...(a.key === "sam" ? ["business"] : []),
      ] as ("psychology" | "business")[]) {
        const course = Enrolment.parse({
          subject,
          specification: "2026",
          targetSession: "June 2027",
          taughtTopics: [
            ...new Set(fixturePaper(subject).questions.map((q) => q.topics[0])),
          ],
          timezone: "Europe/Amsterdam",
          availability: [
            { day: 1, start: "17:00", minutes: 20 },
            { day: 4, start: "17:00", minutes: 20 },
          ],
          examDates: [],
          blockedDates: [],
        });
        await tx.query(
          "INSERT INTO enrolments(id,family_id,learner_id,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [
            fixtureId(`course-${a.key}-${subject}`),
            familyId,
            learner,
            JSON.stringify(course),
          ],
        );
      }
  }
  const memberships = [
    ["jordan", "River", "parent"],
    ["robin", "Hill", "parent"],
    ["chris", "Green", "parent"],
    ["pat", "Brook", "parent"],
    ["morgan", "River", "teacher"],
    ["morgan", "Hill", "teacher"],
    ["lee", "Hill", "teacher"],
    ["lee", "Green", "teacher"],
    ["lee", "Brook", "teacher"],
    ["avery", "River", "parent"],
    ["avery", "Hill", "teacher"],
  ];
  for (const [key, name, role] of memberships) {
    const familyId = testFamilyIds[name as keyof typeof testFamilyIds];
    await tx.query(
      "INSERT INTO memberships(user_id,family_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [`ux-fixture-${key}`, familyId, role],
    );
    if (role === "parent")
      await tx.query(
        "INSERT INTO parent_links(user_id,family_id,learner_id) SELECT $1,$2,id FROM learners WHERE family_id=$2 ON CONFLICT DO NOTHING",
        [`ux-fixture-${key}`, familyId],
      );
  }
  async function work(
    key: string,
    state: string,
    days: number,
    variant: string,
    subject: "psychology" | "business" = "psychology",
  ) {
    const index = students.findIndex((a) => a.key === key),
      a = students[index],
      familyId = testFamilyIds[a.family as keyof typeof testFamilyIds],
      learner = testLearnerId(index),
      paper = fixturePaper(subject),
      id = fixtureId(`attempt-${variant}`),
      quote = fixtureId(`quote-${variant}`),
      submission = fixtureId(`submission-${variant}`),
      assessment = fixtureId(`assessment-${variant}`);
    if (
      (await tx.query("SELECT id FROM attempts WHERE id=$1", [id])).rows.length
    )
      return id;
    const questions = paper.questions.slice(0, 2),
      stamp = new Date(Date.now() - days * 86400000).toISOString();
    const data = {
      questions,
      paperIds: [paper.id],
      specification: "2026",
      subject,
      resources: [],
      generalRubrics: [paper.generalRubric],
      choices: [],
      instructions: paper.instructions,
      durationMinutes: 10,
      extraTimePercent: 0,
      assisted: false,
      seenQuestionIds: [],
      selected: [],
      quoteId: quote,
      boundaries: null,
    };
    const attemptState = ["draft", "in_progress"].includes(state)
      ? state
      : "submitted";
    await tx.query(
      "INSERT INTO attempts(id,family_id,learner_id,mode,state,data,created_at,started_at,editor_token) VALUES($1,$2,$3,'independent',$4,$5,$6,$6,$7)",
      [
        id,
        familyId,
        learner,
        attemptState,
        JSON.stringify(data),
        stamp,
        state === "in_progress" ? "fixture-editor" : null,
      ],
    );
    await tx.query(
      "INSERT INTO quotes(id,family_id,learner_id,attempt_id,max_charge,rate_card_id,configuration,expires_at,accepted_at) VALUES($1,$2,$3,$4,100000,$5,$6,now()+interval '30 days',now())",
      [quote, familyId, learner, id, cardId, JSON.stringify(fixtureRate)],
    );
    if (state !== "awaiting_funds")
      await tx.query(
        "INSERT INTO reservations(id,family_id,learner_id,quote_id,amount,month,settled,released_at) VALUES($1,$2,$3,$4,100000,$5,$6,$7)",
        [
          fixtureId(`reservation-${variant}`),
          familyId,
          learner,
          quote,
          stamp.slice(0, 7),
          state === "published" ? 0 : null,
          state === "published" ? stamp : null,
        ],
      );
    const answers = questions.map((q, i) => ({
      question_id: q.id,
      text: i
        ? "This response explains the idea and gives a relevant example."
        : "A small sample may not represent the wider population. A broader sample could improve the study.",
      revision: 1,
    }));
    for (const answer of answers)
      await tx.query(
        "INSERT INTO answers(attempt_id,family_id,question_id,text,revision) VALUES($1,$2,$3,$4,1)",
        [
          id,
          familyId,
          answer.question_id,
          state === "draft" ? "" : answer.text,
        ],
      );
    if (attemptState !== "submitted") return id;
    const results = questions.map((q) =>
      validateResult(
        simulatedFeedback(q, answers.find((a) => a.question_id === q.id)!.text),
        q,
        answers.find((a) => a.question_id === q.id)!.text,
      ),
    );
    await tx.query(
      "INSERT INTO submissions(id,family_id,learner_id,attempt_id,answers,choices,ended_by,submitted_at) VALUES($1,$2,$3,$4,$5,'[]','manual',$6)",
      [submission, familyId, learner, id, JSON.stringify(answers), stamp],
    );
    await tx.query(
      "INSERT INTO assessments(id,family_id,learner_id,submission_id,state,candidates,effective,provenance,published_at,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        assessment,
        familyId,
        learner,
        submission,
        state,
        JSON.stringify(results.map((primary) => ({ primary }))),
        state === "published" ? JSON.stringify(results) : null,
        JSON.stringify({ synthetic: true }),
        state === "published" ? stamp : null,
        state === "failed" ? "UX_SIMULATED_FAILURE" : null,
      ],
    );
    if (variant === "jamie-query")
      await tx.query(
        "INSERT INTO review_decisions(id,family_id,assessment_id,actor_id,data) VALUES($1,$2,$3,$4,$5)",
        [
          fixtureId("query-decision"),
          familyId,
          assessment,
          a.id,
          JSON.stringify({
            action: "query",
            reason: "Could you explain how I can develop this answer further?",
          }),
        ],
      );
    if (state === "queued")
      await tx.query(
        "INSERT INTO outbox(id,family_id,kind,key,data) VALUES($1,$2,'mark',$3,$4)",
        [
          fixtureId(`job-${variant}`),
          familyId,
          `ux-job-${variant}`,
          JSON.stringify({ assessmentId: assessment }),
        ],
      );
    return id;
  }
  await work("alex", "published", 3, "alex-published");
  await work("alex", "in_progress", 0, "alex-open");
  const planned = await work("alex", "draft", 0, "alex-planned");
  await work("jamie", "published", 9, "jamie-published");
  await work("jamie", "needs_review", 1, "jamie-query");
  await work("sam", "needs_review", 21, "sam-older", "business");
  await work("sam", "failed", 4, "sam-failed");
  await work("sam", "queued", 0, "sam-processing");
  await work("taylor", "awaiting_funds", 1, "taylor-funding");
  await tx.query(
    "INSERT INTO study_sessions(id,family_id,learner_id,data,state) VALUES($1,$2,$3,$4,'approved') ON CONFLICT DO NOTHING",
    [
      fixtureId("planned-session"),
      testFamilyIds.River,
      testLearnerId(0),
      JSON.stringify({
        title: "Psychology · Research methods",
        topic: "research.methods",
        enrolmentId: fixtureId("course-alex-psychology"),
        minutes: 20,
        start: new Date(Date.now() + 2 * 86400000).toISOString(),
        timezone: "Europe/Amsterdam",
        purpose: "Practise a previously taught topic",
        mode: "independent",
        attemptId: planned,
      }),
    ],
  );
  await seedExamExamples(tx);
  return {
    families: 4,
    students: students.length,
    accounts: testAccounts.length,
    papers: 4,
  };
}
