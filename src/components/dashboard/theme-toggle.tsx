"use client";

import { useSyncExternalStore } from "react";
import { Laptop, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];

const THEME_LABEL: Record<ThemePreference, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

const THEME_ICON = {
  system: Laptop,
  light: Sun,
  dark: Moon,
} satisfies Record<ThemePreference, typeof Laptop>;

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

// 存储不可用时退回内存值，保证本次会话内切换仍然生效
let memoryTheme: ThemePreference | null = null;

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) {
      return stored;
    }
  } catch {
    // 忽略，使用内存值
  }
  return memoryTheme ?? "system";
}

function writeThemePreference(theme: ThemePreference) {
  memoryTheme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 隐私模式等场景下存储不可用，仅本次会话生效
  }
}

function prefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

// 与 src/pages/*.astro 中的首屏内联脚本保持一致
export function applyThemePreference(theme: ThemePreference) {
  const isDark = theme === "dark" || (theme === "system" && prefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

// 用外部 store 读取偏好：服务端渲染固定为 system，水合后再读本地存储，避免水合不一致
const themeListeners = new Set<() => void>();

function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

function setThemePreference(theme: ThemePreference) {
  writeThemePreference(theme);
  applyThemePreference(theme);
  for (const listener of themeListeners) {
    listener();
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readThemePreference,
    () => "system" as ThemePreference
  );

  const Icon = THEME_ICON[theme];
  const nextTheme =
    THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];

  return (
    <button
      type="button"
      aria-label={`主题：${THEME_LABEL[theme]}，点击切换为${THEME_LABEL[nextTheme]}`}
      title={`主题：${THEME_LABEL[theme]}`}
      onClick={() => setThemePreference(nextTheme)}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition hover:border-foreground/25 hover:text-foreground",
        className
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
