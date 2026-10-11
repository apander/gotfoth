export async function processingWorkflow(jobId: string) {
  "use workflow";
  let next: string | undefined = jobId;
  while (next) next = await execute(next);
}
async function execute(jobId: string) {
  "use step";
  const { processJob } = await import("../server/jobs");
  return processJob(jobId);
}
