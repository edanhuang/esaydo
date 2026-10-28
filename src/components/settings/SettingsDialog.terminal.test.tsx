import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getTerminalSettings, saveTerminalSettings } from "@/lib/api";
import { defaultShortcutSettings } from "@/lib/shortcuts";
import { defaultAppearanceSettings } from "@/lib/theme";
import { SettingsDialog } from "./SettingsDialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getTerminalSettings: vi.fn(async () => ({ version: 1, app: "terminal" })),
  saveTerminalSettings: vi.fn(async (settings: unknown) => settings),
}));

describe("SettingsDialog 终端设置", () => {
  it("默认是「终端」，选 Ghostty 后随设置一起保存", async () => {
    render(
      <SettingsDialog
        open
        shortcutSettings={defaultShortcutSettings}
        appearanceSettings={defaultAppearanceSettings}
        onOpenChange={vi.fn()}
        onSaveShortcuts={vi.fn(async () => undefined)}
        onSaveAppearance={vi.fn(async () => undefined)}
        loadCliStatus={vi.fn(async () => ({
          state: "installed" as const,
          sourcePath: null,
          linkPath: "/usr/local/bin/easydo",
          message: "",
        }))}
        loadSkills={vi.fn(async () => [])}
      />,
    );

    await waitFor(() => expect(getTerminalSettings).toHaveBeenCalled());
    expect(screen.getByRole("radio", { name: "终端" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Ghostty" }));
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => expect(saveTerminalSettings).toHaveBeenCalledWith({ version: 1, app: "ghostty" }));
  });
});
