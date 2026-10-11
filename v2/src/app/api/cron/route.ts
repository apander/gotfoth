import { start } from "workflow/api";
import { pendingJobs } from "@/server/jobs";
import { processingWorkflow } from "@/workflows/process";
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return new Response(null, { status: 401 });
  for (const job of await pendingJobs())
    await start(processingWorkflow, [job.id]);
  return Response.json({ dispatched: true });
}
