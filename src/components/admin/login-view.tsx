import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";

interface LoginViewProps {
  unavailable: boolean;
  error: string | null;
  pending: boolean;
  lockedUntilMs?: number | null;
  turnstileSiteKey?: string | null;
  onSubmit(token: string, turnstileToken: string | null): void;
}

export function formatLockCountdown(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function useRemainingSeconds(lockedUntilMs: number | null | undefined) {
  const compute = React.useCallback(
    () =>
      lockedUntilMs ? Math.max(0, Math.ceil((lockedUntilMs - Date.now()) / 1000)) : 0,
    [lockedUntilMs]
  );
  const [remaining, setRemaining] = React.useState(compute);

  React.useEffect(() => {
    setRemaining(compute());
    if (!lockedUntilMs) {
      return;
    }
    const interval = window.setInterval(() => {
      const next = compute();
      setRemaining(next);
      if (next <= 0) {
        window.clearInterval(interval);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [compute, lockedUntilMs]);

  return remaining;
}

export function LoginView({
  unavailable,
  error,
  pending,
  lockedUntilMs = null,
  turnstileSiteKey = null,
  onSubmit,
}: LoginViewProps) {
  const [token, setToken] = React.useState("");
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const turnstileRef = React.useRef<TurnstileWidgetHandle>(null);
  const remainingSeconds = useRemainingSeconds(lockedUntilMs);
  const locked = remainingSeconds > 0;
  const captchaPending = Boolean(turnstileSiteKey) && !turnstileToken;

  if (unavailable) {
    return (
      <main className="flex min-h-screen min-w-0 items-center justify-center overflow-x-hidden px-4 py-10 text-foreground">
        <Card className="min-w-0 w-full max-w-[calc(100vw-2rem)] rounded-lg sm:max-w-md">
          <CardHeader>
            <CardTitle>管理台未配置</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              管理入口暂时不可用。
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const message = locked
    ? `尝试次数过多，请在 ${formatLockCountdown(remainingSeconds)} 后重试`
    : error;

  return (
    <main className="flex min-h-screen min-w-0 items-center justify-center overflow-x-hidden px-4 py-10 text-foreground">
      <Card className="min-w-0 w-full max-w-[calc(100vw-2rem)] rounded-lg sm:max-w-md">
        <CardHeader>
          <CardTitle>管理登录</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (locked || captchaPending) {
                return;
              }
              onSubmit(token, turnstileToken);
              // Turnstile token 只能校验一次，提交后立即重置。
              turnstileRef.current?.reset();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="admin-token">管理员令牌</Label>
              <Input
                id="admin-token"
                type="password"
                autoComplete="current-password"
                aria-describedby="admin-token-hint"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
              <p id="admin-token-hint" className="text-xs text-muted-foreground">
                部署时配置的 ADMIN_TOKEN。连续输错会暂时锁定登录。
              </p>
            </div>
            {turnstileSiteKey ? (
              <TurnstileWidget
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                onTokenChange={setTurnstileToken}
              />
            ) : null}
            {message ? (
              <p className="text-sm text-destructive" role="alert">
                {message}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={
                pending || locked || captchaPending || token.trim().length === 0
              }
            >
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
