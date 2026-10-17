export const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

interface TurnstileConfig {
  siteKey: string;
  secretKey: string;
}

interface SiteverifyResponse {
  success?: unknown;
}

function nonEmpty(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// 只有 site key 与 secret 都配置时才启用 Turnstile，未配置时登录不受影响。
export function getTurnstileConfig(env: Env): TurnstileConfig | null {
  const siteKey = nonEmpty(env.TURNSTILE_SITE_KEY);
  const secretKey = nonEmpty(env.TURNSTILE_SECRET_KEY);
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

export async function verifyTurnstileToken(
  secretKey: string,
  token: unknown,
  remoteIp: string,
  fetcher: TurnstileFetch = fetch
): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0) {
    return false;
  }

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetcher(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      return false;
    }
    const result = (await response.json()) as SiteverifyResponse;
    return result.success === true;
  } catch {
    return false;
  }
}
