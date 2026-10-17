"use client";

import * as React from "react";

import { getAdminSession, getAdminSummary, loginAdmin } from "./admin-api";
import type { AdminSummary, AdminView } from "./admin-types";
import { AdminShell } from "./admin-shell";
import { LoginView } from "./login-view";

export function AdminIsland() {
  const [checking, setChecking] = React.useState(true);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);
  const [loginError, setLoginError] = React.useState<string | null>(null);
  const [lockedUntilMs, setLockedUntilMs] = React.useState<number | null>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = React.useState<string | null>(
    null
  );
  const [pending, setPending] = React.useState(false);
  const [summary, setSummary] = React.useState<AdminSummary | null>(null);
  const [activeView, setActiveView] = React.useState<AdminView>("overview");

  const loadSummary = React.useCallback(async () => {
    const result = await getAdminSummary();
    if (!result) {
      setAuthenticated(false);
      setSummary(null);
      return;
    }
    setSummary(result);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      const session = await getAdminSession();
      if (cancelled) {
        return;
      }
      if (session.error === "admin_unavailable") {
        setUnavailable(true);
        setChecking(false);
        return;
      }
      setTurnstileSiteKey(session.turnstileSiteKey ?? null);
      if (session.authenticated) {
        setAuthenticated(true);
        setChecking(false);
        await loadSummary();
        return;
      }
      setAuthenticated(false);
      setChecking(false);
    }

    checkSession().catch(() => {
      if (!cancelled) {
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadSummary]);

  async function handleLogin(token: string, turnstileToken: string | null) {
    setPending(true);
    setLoginError(null);
    const response = await loginAdmin(token.trim(), turnstileToken);
    setPending(false);
    if (response.error === "admin_unavailable") {
      setUnavailable(true);
      return;
    }
    if (response.error === "too_many_attempts") {
      setLockedUntilMs(Date.now() + (response.retryAfterSeconds ?? 60) * 1000);
      return;
    }
    if (response.error === "captcha_failed") {
      setLoginError("人机验证失败，请重试");
      return;
    }
    if (!response.authenticated) {
      setLoginError(
        typeof response.remainingAttempts === "number"
          ? `令牌错误，还可尝试 ${response.remainingAttempts} 次`
          : "令牌错误"
      );
      return;
    }
    setAuthenticated(true);
    await loadSummary();
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-sm text-muted-foreground">
        正在检查登录状态
      </main>
    );
  }

  if (!authenticated) {
    return (
      <LoginView
        unavailable={unavailable}
        error={loginError}
        pending={pending}
        lockedUntilMs={lockedUntilMs}
        turnstileSiteKey={turnstileSiteKey}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <AdminShell
      activeView={activeView}
      summary={summary}
      onViewChange={setActiveView}
    />
  );
}
