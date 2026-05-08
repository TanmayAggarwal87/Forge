"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

const themeStorageKey = "forge.theme";
const themeStorageChangeEvent = "forge.themeChanged";

function readThemeSnapshot(): ThemeMode {
  return window.localStorage.getItem(themeStorageKey) === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(themeStorageKey, theme);
  window.dispatchEvent(new Event(themeStorageChangeEvent));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<ThemeMode>(
    subscribeTheme,
    readThemeSnapshot,
    () => "light",
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <Button
      variant="outline"
      onClick={() => applyTheme(isDark ? "light" : "dark")}
      className="rounded-md border-slate-300 bg-white text-slate-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun /> : <Moon />}
      {isDark ? "Light" : "Dark"}
    </Button>
  );
}

function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(themeStorageChangeEvent, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(themeStorageChangeEvent, onChange);
  };
}
