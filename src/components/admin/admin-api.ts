import type { AdminSessionResponse, AdminSummary } from "./admin-types";

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function getAdminSession(): Promise<AdminSessionResponse> {
  const response = await fetch("/api/admin/session");
  if (response.status === 503) {
    return { error: "admin_unavailable" };
  }
  if (!response.ok) {
    return { authenticated: false };
  }
  return parseJson<AdminSessionResponse>(response);
}

export async function loginAdmin(token: string): Promise<AdminSessionResponse> {
  const response = await fetch("/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (response.status === 503) {
    return { error: "admin_unavailable" };
  }
  if (response.status === 401) {
    return { error: "unauthorized" };
  }
  return parseJson<AdminSessionResponse>(response);
}

export async function getAdminSummary(): Promise<AdminSummary | null> {
  const response = await fetch("/api/admin/summary");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("summary request failed");
  }
  return parseJson<AdminSummary>(response);
}
