import { useEffect, useState } from "react";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import {
  getAppearanceSettings,
  getShortcutSettings,
  saveAppearanceSettings,
  saveShortcutSettings,
} from "./lib/api";
import { defaultShortcutSettings, shortcutMatches } from "./lib/shortcuts";
import { applyResolvedTheme, defaultAppearanceSettings, resolveThemeMode } from "./lib/theme";
import { BoardPage } from "./pages/BoardPage";
import { DailyPage } from "./pages/WeeklyPage";
import type { AppearanceSettings, AppView, ShortcutSettings } from "./types";

export default function App() {
  const [view, setView] = useState<AppView>("board");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shortcutSettings, setShortcutSettings] = useState(defaultShortcutSettings);
  const [appearanceSettings, setAppearanceSettings] = useState(defaultAppearanceSettings);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    getShortcutSettings()
      .then(setShortcutSettings)
      .catch(() => setShortcutSettings(defaultShortcutSettings));
    getAppearanceSettings()
      .then(setAppearanceSettings)
      .catch(() => setAppearanceSettings(defaultAppearanceSettings));
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange(event: MediaQueryListEvent) {
      setSystemPrefersDark(event.matches);
    }

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    applyResolvedTheme(resolveThemeMode(appearanceSettings.mode, systemPrefersDark));
  }, [appearanceSettings.mode, systemPrefersDark]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (settingsOpen) {
        return;
      }

      if (shortcutMatches(event, shortcutSettings.openSettings)) {
        event.preventDefault();
        setSettingsOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen, shortcutSettings]);

  async function handleSaveSettings(settings: ShortcutSettings) {
    const saved = await saveShortcutSettings(settings);
    setShortcutSettings(saved);
  }

  async function handleSaveAppearance(settings: AppearanceSettings) {
    const saved = await saveAppearanceSettings(settings);
    setAppearanceSettings(saved);
  }

  return (
    <>
      {view === "daily" ? (
        <DailyPage
          onNavigate={setView}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
      ) : (
        <BoardPage
          onNavigate={setView}
          shortcutSettings={shortcutSettings}
          settingsOpen={settingsOpen}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
      )}
      <SettingsDialog
        open={settingsOpen}
        shortcutSettings={shortcutSettings}
        appearanceSettings={appearanceSettings}
        onOpenChange={setSettingsOpen}
        onSaveShortcuts={handleSaveSettings}
        onSaveAppearance={handleSaveAppearance}
      />
    </>
  );
}
