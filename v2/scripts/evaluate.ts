import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { evaluateReference, configurationHash } from "../src/server/marking";
import { RateCard } from "../src/server/finance";
import { database, transaction } from "../src/server/db";
const [path, flag] = process.argv.slice(2);
if (!path)
  throw new Error(
    "Usage: npx tsx scripts/evaluate.ts <heldout-evaluation.json> [--approve]",
  );
const data = z
  .object({
    specification: z.string(),
    rate: RateCard,
    heldOut: z.literal(true),
    completeScripts: z.literal(true),
    humanModerationEvidence: z.string().min(30),
    unsupportedMarksReviewed: z.literal(true),
    biasReview: z.string().min(30),
    responses: z.array(
      z.object({
        script: z.string(),
        awarded: z.number().int().nonnegative(),
        reference: z.number().int().nonnegative(),
        available: z.number().int().positive(),
      }),
    ),
  })
  .parse(JSON.parse(await readFile(path, "utf8")));
if (
  data.responses.some(
    (r) => r.awarded > r.available || r.reference > r.available,
  )
)
  throw new Error("Invalid marks in evaluation reference.");
const result = evaluateReference(data.responses);
console.log(
  JSON.stringify(
    { ...result, configurationHash: configurationHash(data.rate) },
    null,
    2,
  ),
);
if (flag === "--approve") {
  if (!result.passed)
    throw new Error("This configuration did not meet release thresholds.");
  const admin = (
    await database().query(
      'SELECT id FROM "user" WHERE lower(email)=lower($1) AND "emailVerified"',
      [process.env.SUPERUSER_EMAIL],
    )
  ).rows[0];
  if (!admin)
    throw new Error(
      "The configured superuser must sign in before approving an evaluation.",
    );
  await transaction(async (tx) => {
    await tx.query(
      "INSERT INTO course_evaluations(id,specification,configuration_hash,passed,evidence,approved_by) VALUES($1,$2,$3,true,$4,$5)",
      [
        randomUUID(),
        data.specification,
        configurationHash(data.rate),
        JSON.stringify({ ...data, metrics: result }),
        admin.id,
      ],
    );
  });
}
await database().end();
