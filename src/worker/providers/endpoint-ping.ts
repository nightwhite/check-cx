const PING_TIMEOUT_MS = 8_000;

export type WorkerFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

function resolveOrigin(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

async function tryPing(
  fetcher: WorkerFetch,
  url: string,
  method: "HEAD" | "GET"
): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    await fetcher(url, {
      method,
      cache: "no-store",
      redirect: "manual",
      headers: {
        "User-Agent": "check-cx/ping",
      },
      signal: controller.signal,
    });
    return Date.now() - startedAt;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function measureEndpointPing(
  endpoint: string | null | undefined,
  fetcher: WorkerFetch = fetch
): Promise<number | null> {
  if (!endpoint) {
    return null;
  }

  const origin = resolveOrigin(endpoint);
  if (!origin) {
    return null;
  }

  const headLatency = await tryPing(fetcher, origin, "HEAD");
  return headLatency ?? tryPing(fetcher, origin, "GET");
}
