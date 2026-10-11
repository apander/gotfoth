import { connect } from "../src/lib/env";

const client = await connect("PAPER_BANK_URL");
const result = await client.query(
  `SELECT q.id, pc.strand, length(pc.examples) AS examples, length(pc.criterion) AS criterion,
          length(si.source_text) AS source,
          (SELECT count(*) FROM indicative_points ip WHERE ip.scheme_item_id = si.id) AS points,
          (SELECT count(*) FROM level_bands lb WHERE lb.scheme_item_id = si.id) AS bands
   FROM questions q
   JOIN question_revisions qr ON qr.question_id = q.id
   JOIN scheme_items si ON si.question_revision_id = qr.id
   LEFT JOIN point_credits pc ON pc.scheme_item_id = si.id
   ORDER BY q.id, pc.sort_order`,
);
for (const row of result.rows) {
  console.log(
    `${row.id} ${row.strand ?? "-"} examples=${row.examples} criterion=${row.criterion} source=${row.source} points=${row.points} bands=${row.bands}`,
  );
}
await client.end();
