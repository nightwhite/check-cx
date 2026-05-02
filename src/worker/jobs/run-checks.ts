import type { WorkerCheckResult, WorkerProviderConfig } from "../providers";

const DEFAULT_CONCURRENCY = 8;

export async function runProviderChecks(
  configs: WorkerProviderConfig[],
  runCheck: (config: WorkerProviderConfig) => Promise<WorkerCheckResult>,
  concurrency = DEFAULT_CONCURRENCY
): Promise<WorkerCheckResult[]> {
  const enabledConfigs = configs.filter((config) => !config.isMaintenance);
  const limit = Math.max(1, Math.floor(concurrency));
  const results: WorkerCheckResult[] = new Array(enabledConfigs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < enabledConfigs.length) {
      const currentIndex = nextIndex;
      nextIndex++;
      results[currentIndex] = await runCheck(enabledConfigs[currentIndex]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, enabledConfigs.length) },
      () => worker()
    )
  );

  return results;
}
