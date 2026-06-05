import type { AppearanceSettings, ResolvedThemeMode, ThemeMode } from "../types";

export const defaultAppearanceSettings: AppearanceSettings = {
  version: 1,
  mode: "system",
};

export const themeModeOptions: Array<{
  value: ThemeMode;
  label: string;
}> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function resolveThemeMode(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): ResolvedThemeMode {
  if (mode === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return mode;
}

export function applyResolvedTheme(mode: ResolvedThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle("dark", mode === "dark");
}
