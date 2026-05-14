import type { WorkerCheckResult, WorkerProviderConfig } from "../providers";

const DEFAULT_CONCURRENCY = 8;

export async function runProviderChecks(
  configs: WorkerProviderConfig[],
  runCheck: (config: WorkerProviderConfig) => Promise<WorkerCheckResult>,
  concurrency = DEFAULT_CONCURRENCY
): Promise<WorkerCheckResult[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: WorkerCheckResult[] = new Array(configs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < configs.length) {
      const currentIndex = nextIndex;
      nextIndex++;
      results[currentIndex] = await runCheck(configs[currentIndex]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, configs.length) },
      () => worker()
    )
  );

  return results;
}
