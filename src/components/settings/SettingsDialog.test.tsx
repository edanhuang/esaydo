import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { defaultShortcutSettings } from "@/lib/shortcuts";
import { defaultAppearanceSettings } from "@/lib/theme";
import type {
  CliInstallStatus,
  SkillDefinition,
  SkillInstallLocationStatus,
} from "@/types";

describe("SettingsDialog", () => {
  const cliNotInstalled: CliInstallStatus = {
    state: "notInstalled",
    sourcePath: "/Applications/EasyDo.app/Contents/MacOS/easydo-cli",
    linkPath: "/usr/local/bin/easydo",
    message: "命令行工具尚未安装",
  };
  const easydoSkill: SkillDefinition = {
    name: "easydo",
    version: "0.1.0",
    description: "EasyDo CLI Skill",
    path: "easydo",
  };
  const skillStatuses: SkillInstallLocationStatus[] = [
    {
      skill: "easydo",
      target: "agents",
      path: "/Users/me/.agents/skills/easydo",
      state: "notInstalled",
      message: "未安装",
    },
    {
      skill: "easydo",
      target: "codex",
      path: "/Users/me/.codex/skills/easydo",
      state: "installed",
      message: "已安装 0.1.0",
    },
    {
      skill: "easydo",
      target: "claude",
      path: "/Users/me/.claude/skills/easydo",
      state: "notInstalled",
      message: "未安装",
    },
  ];

  beforeEach(() => {
    window.localStorage.clear();
  });

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

  it("shows CLI status and installs the command line tool", async () => {
    const user = userEvent.setup();
    const installed: CliInstallStatus = {
      ...cliNotInstalled,
      state: "installed",
      message: "命令行工具已安装",
    };
    const loadCliStatus = vi.fn().mockResolvedValue(cliNotInstalled);
    const installCli = vi.fn().mockResolvedValue(installed);
    render(
      <SettingsDialog
        open
        shortcutSettings={defaultShortcutSettings}
        appearanceSettings={defaultAppearanceSettings}
        onOpenChange={vi.fn()}
        onSaveShortcuts={vi.fn()}
        onSaveAppearance={vi.fn()}
        loadCliStatus={loadCliStatus}
        installCli={installCli}
      />,
    );

    expect(await screen.findByText(/命令行工具尚未安装/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Install CLI" }));

    await waitFor(() => {
      expect(installCli).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/命令行工具已安装/)).toBeInTheDocument();
    });
  });

  it("shows Skill status, installs a target, and adds a custom folder", async () => {
    const user = userEvent.setup();
    const loadSkills = vi.fn().mockResolvedValue([easydoSkill]);
    const loadSkillStatuses = vi.fn().mockResolvedValue(skillStatuses);
    const installSkill = vi.fn().mockResolvedValue({
      ...skillStatuses[0],
      state: "installed",
      message: "已安装 0.1.0",
    });
    const chooseSkillDirectory = vi.fn().mockResolvedValue("/Users/me/custom-skills");
    render(
      <SettingsDialog
        open
        shortcutSettings={defaultShortcutSettings}
        appearanceSettings={defaultAppearanceSettings}
        onOpenChange={vi.fn()}
        onSaveShortcuts={vi.fn()}
        onSaveAppearance={vi.fn()}
        loadCliStatus={vi.fn().mockResolvedValue(cliNotInstalled)}
        loadSkills={loadSkills}
        loadSkillStatuses={loadSkillStatuses}
        installSkill={installSkill}
        chooseSkillDirectory={chooseSkillDirectory}
      />,
    );

    expect(await screen.findByText("/Users/me/.codex/skills/easydo")).toBeInTheDocument();
    expect(screen.getAllByLabelText("installed")).toHaveLength(1);
    expect(screen.getAllByLabelText("not installed").length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getAllByRole("button", { name: "Install" })[0]);
    await waitFor(() => {
      expect(installSkill).toHaveBeenCalledWith("easydo", "agents", undefined);
    });

    await user.click(screen.getByRole("button", { name: "Choose Folder" }));
    await waitFor(() => {
      expect(chooseSkillDirectory).toHaveBeenCalledTimes(1);
      expect(loadSkillStatuses).toHaveBeenLastCalledWith("easydo", [
        "/Users/me/custom-skills",
      ]);
    });
  });
});
