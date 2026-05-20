import type { Context } from "hono";

export const ADMIN_SESSION_COOKIE = "check_cx_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type AdminContext = Context<{ Bindings: Env }>;

interface AdminSessionPayload {
  expiresAtMs: number;
  nonce: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeJson(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as T;
}

function getAdminToken(env: Env): string | null {
  const token = env.ADMIN_TOKEN;
  return typeof token === "string" && token.length > 0 ? token : null;
}

async function importSigningKey(adminToken: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(adminToken),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payload: string, adminToken: string): Promise<string> {
  const key = await importSigningKey(adminToken);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return toBase64Url(new Uint8Array(signature));
}

async function verifySignature(
  payload: string,
  signature: string,
  adminToken: string
): Promise<boolean> {
  const key = await importSigningKey(adminToken);
  return crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(fromBase64Url(signature)),
    new TextEncoder().encode(payload)
  );
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return rawValue.join("=");
    }
  }

  return null;
}

function shouldUseSecureCookie(c: AdminContext): boolean {
  return new URL(c.req.url).protocol === "https:";
}

function appendSetCookie(c: AdminContext, value: string): void {
  c.header("Set-Cookie", value, { append: true });
}

export function expireAdminSessionCookie(c: AdminContext): void {
  appendSetCookie(
    c,
    `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${
      shouldUseSecureCookie(c) ? "; Secure" : ""
    }`
  );
}

export async function createAdminSessionCookie(
  c: AdminContext,
  nowMs = Date.now()
): Promise<void> {
  const adminToken = getAdminToken(c.env);
  if (!adminToken) {
    throw new Error("ADMIN_TOKEN is required");
  }

  const payload = encodeJson({
    expiresAtMs: nowMs + ADMIN_SESSION_MAX_AGE_SECONDS * 1000,
    nonce: randomNonce(),
  } satisfies AdminSessionPayload);
  const signature = await signPayload(payload, adminToken);
  const value = `${payload}.${signature}`;

  appendSetCookie(
    c,
    `${ADMIN_SESSION_COOKIE}=${value}; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${
      shouldUseSecureCookie(c) ? "; Secure" : ""
    }`
  );
}

export async function hasValidAdminSession(c: AdminContext): Promise<boolean> {
  const adminToken = getAdminToken(c.env);
  if (!adminToken) {
    return false;
  }

  const cookie = parseCookie(c.req.header("Cookie"), ADMIN_SESSION_COOKIE);
  if (!cookie) {
    return false;
  }

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) {
    return false;
  }

  try {
    const valid = await verifySignature(payload, signature, adminToken);
    if (!valid) {
      return false;
    }

    const session = decodeJson<AdminSessionPayload>(payload);
    return (
      Number.isFinite(session.expiresAtMs) && session.expiresAtMs > Date.now()
    );
  } catch {
    return false;
  }
}

export function isAdminConfigured(env: Env): boolean {
  return getAdminToken(env) !== null;
}

export async function isAdminTokenValid(
  env: Env,
  candidate: unknown
): Promise<boolean> {
  const adminToken = getAdminToken(env);
  if (!adminToken || typeof candidate !== "string" || candidate.length === 0) {
    return false;
  }

  const [expectedDigest, candidateDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(adminToken)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(candidate)),
  ]);

  const expected = new Uint8Array(expectedDigest);
  const actual = new Uint8Array(candidateDigest);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ actual[index];
  }

  return difference === 0;
}
