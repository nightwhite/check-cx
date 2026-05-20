import * as React from "react";

import { cn } from "@/lib/utils";

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange(value: string): void;
}

export function Tabs({ className, ...props }: TabsProps) {
  return <div className={cn("w-full", className)} {...props} />;
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex w-full gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1",
        className
      )}
      {...props}
    />
  );
}

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  activeValue: string;
}

export function TabsTrigger({
  className,
  value,
  activeValue,
  ...props
}: TabsTriggerProps) {
  const active = value === activeValue;
  return (
    <button
      type="button"
      data-state={active ? "active" : "inactive"}
      className={cn(
        "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  );
}
