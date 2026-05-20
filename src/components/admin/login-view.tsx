import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

interface LoginViewProps {
  unavailable: boolean;
  error: string | null;
  pending: boolean;
  onSubmit(token: string): void;
}

export function LoginView({
  unavailable,
  error,
  pending,
  onSubmit,
}: LoginViewProps) {
  const [token, setToken] = React.useState("");

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
              onSubmit(token);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="admin-token">Admin token</Label>
              <Input
                id="admin-token"
                type="password"
                autoComplete="current-password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending || token.trim().length === 0}>
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
