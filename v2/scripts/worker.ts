import { pendingJobs, processJob } from "../src/server/jobs";
import { database } from "../src/server/db";
for (const job of await pendingJobs()) await processJob(job.id);
await database().end();
