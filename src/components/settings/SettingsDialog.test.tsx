import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { defaultShortcutSettings } from "@/lib/shortcuts";
import { defaultAppearanceSettings } from "@/lib/theme";

describe("SettingsDialog", () => {
  it("captures shortcuts and blocks duplicate bindings on save", async () => {
    const user = userEvent.setup();
    const onSaveShortcuts = vi.fn();
    const onSaveAppearance = vi.fn();
    render(
      <SettingsDialog
        open
        shortcutSettings={defaultShortcutSettings}
        appearanceSettings={defaultAppearanceSettings}
        onOpenChange={vi.fn()}
        onSaveShortcuts={onSaveShortcuts}
        onSaveAppearance={onSaveAppearance}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();

    await user.click(screen.getAllByText("Record")[1]);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Settings" }), {
      key: "ArrowDown",
      metaKey: true,
    });

    expect(screen.getAllByDisplayValue("Cmd + Down")).toHaveLength(2);

    await user.click(screen.getByText("Save"));

    expect(onSaveShortcuts).not.toHaveBeenCalled();
    expect(onSaveAppearance).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Next Todo conflicts with Previous Todo.");
  });

  it("records a valid shortcut without saving immediately", async () => {
    const user = userEvent.setup();
    const onSaveShortcuts = vi.fn();
    render(
      <SettingsDialog
        open
        shortcutSettings={defaultShortcutSettings}
        appearanceSettings={defaultAppearanceSettings}
        onOpenChange={vi.fn()}
        onSaveShortcuts={onSaveShortcuts}
        onSaveAppearance={vi.fn()}
      />,
    );

    await user.click(screen.getAllByText("Record")[0]);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Settings" }), {
      key: ".",
      metaKey: true,
    });

    expect(screen.getByDisplayValue("Cmd + .")).toBeInTheDocument();
    expect(onSaveShortcuts).not.toHaveBeenCalled();
  });

  it("switches appearance mode in the dialog draft", async () => {
    const user = userEvent.setup();
    const onSaveShortcuts = vi.fn();
    const onSaveAppearance = vi.fn();
    render(
      <SettingsDialog
        open
        shortcutSettings={defaultShortcutSettings}
        appearanceSettings={defaultAppearanceSettings}
        onOpenChange={vi.fn()}
        onSaveShortcuts={onSaveShortcuts}
        onSaveAppearance={onSaveAppearance}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Light" }));
    await user.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onSaveAppearance).toHaveBeenCalledWith({ version: 1, mode: "light" });
      expect(onSaveShortcuts).toHaveBeenCalledWith(defaultShortcutSettings);
    });
  });
});
