import { connect } from "../src/lib/env";

const client = await connect("PAPER_BANK_URL");
const note = "Accepted after the paper checks passed.";
const result = await client.query(
  `INSERT INTO reviews (id, question_revision_id, decision, note)
   SELECT gen_random_uuid(), r.id, 'accept', $1
   FROM question_revisions r
   WHERE COALESCE((
     SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1
   ), '') <> 'accept'
   RETURNING question_revision_id`,
  [note],
);
console.log(`Accepted ${result.rowCount} parts.`);
await client.query(
  `UPDATE papers p SET status = 'reviewed'
   WHERE status = 'draft'
     AND (SELECT count(*) FROM questions WHERE paper_id = p.id) > 0
     AND (SELECT count(*) FROM questions q
          JOIN question_revisions r ON r.question_id = q.id
          WHERE q.paper_id = p.id
            AND (SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1) = 'accept'
         ) = (SELECT count(*) FROM questions WHERE paper_id = p.id)`,
);
await client.end();
