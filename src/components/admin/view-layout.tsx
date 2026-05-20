import * as React from "react";
import { Search } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

interface AdminViewLayoutProps {
  title: string;
  description: string;
  actionLabel?: string;
  searchLabel?: string;
  searchValue?: string;
  children: React.ReactNode;
  onSearchChange?(value: string): void;
  onCreate?(): void;
}

export function AdminViewLayout({
  title,
  description,
  actionLabel,
  searchLabel,
  searchValue,
  children,
  onSearchChange,
  onCreate,
}: AdminViewLayoutProps) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actionLabel && onCreate ? (
          <Button type="button" onClick={onCreate}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
      {onSearchChange && searchLabel ? (
        <label className="relative block max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">{searchLabel}</span>
          <Input
            value={searchValue ?? ""}
            placeholder={searchLabel}
            className="pl-9"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      ) : null}
      {children}
    </section>
  );
}
