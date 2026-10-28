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

// 终端设置走 Tauri 命令，这里的用例不关心，固定返回默认值
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getTerminalSettings: vi.fn(async () => ({ version: 1, app: "terminal" })),
  saveTerminalSettings: vi.fn(async (settings: unknown) => settings),
}));

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

    expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();

    await user.click(screen.getAllByText("录制")[1]);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "设置" }), {
      key: "ArrowDown",
      metaKey: true,
    });

    expect(screen.getAllByDisplayValue("Cmd + Down")).toHaveLength(2);

    await user.click(screen.getByText("保存"));

    expect(onSaveShortcuts).not.toHaveBeenCalled();
    expect(onSaveAppearance).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("「下一条」与「上一条」的快捷键冲突。");
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

    await user.click(screen.getAllByText("录制")[0]);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "设置" }), {
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

    await user.click(screen.getByRole("radio", { name: "浅色" }));
    await user.click(screen.getByText("保存"));

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
    await user.click(screen.getByRole("button", { name: "安装命令行工具" }));

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
    expect(screen.getAllByText("已安装")).toHaveLength(1);
    expect(screen.getAllByText("未安装").length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getAllByRole("button", { name: "安装" })[0]);
    await waitFor(() => {
      expect(installSkill).toHaveBeenCalledWith("easydo", "agents", undefined);
    });

    await user.click(screen.getByRole("button", { name: "选择文件夹" }));
    await waitFor(() => {
      expect(chooseSkillDirectory).toHaveBeenCalledTimes(1);
      expect(loadSkillStatuses).toHaveBeenLastCalledWith("easydo", [
        "/Users/me/custom-skills",
      ]);
    });
  });
});
