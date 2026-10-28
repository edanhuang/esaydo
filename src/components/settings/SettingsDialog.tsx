import { useEffect, useState } from "react";
import type React from "react";
import { Download, FolderOpen, RefreshCw, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ShortcutAction } from "@/lib/shortcuts";
import {
  defaultShortcutSettings,
  formatShortcut,
  getShortcut,
  setShortcut,
  shortcutActions,
  shortcutFromEvent,
  validateShortcutSettings,
} from "@/lib/shortcuts";
import { defaultAppearanceSettings, themeModeOptions } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  chooseSkillInstallDirectory,
  getCliInstallStatus,
  getSkillInstallStatuses,
  getTerminalSettings,
  installCliTool,
  installSkillToTarget,
  listAvailableSkills,
  saveTerminalSettings,
} from "@/lib/api";
import type {
  AppearanceSettings,
  CliInstallStatus,
  ShortcutSettings,
  SkillDefinition,
  SkillInstallLocationStatus,
  TerminalApp,
  TerminalSettings,
  ThemeMode,
} from "@/types";

const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = { version: 1, app: "terminal" };

const TERMINAL_OPTIONS: Array<{ value: TerminalApp; label: string }> = [
  { value: "terminal", label: "终端" },
  { value: "ghostty", label: "Ghostty" },
  { value: "iterm2", label: "iTerm2" },
];

const CUSTOM_SKILL_ROOTS_STORAGE_KEY = "easydo.skill.customRoots.v1";
const defaultSkillTargets = ["agents", "codex", "claude"] as const;

interface SettingsDialogProps {
  open: boolean;
  shortcutSettings: ShortcutSettings;
  appearanceSettings: AppearanceSettings;
  onOpenChange: (open: boolean) => void;
  onSaveShortcuts: (settings: ShortcutSettings) => Promise<void>;
  onSaveAppearance: (settings: AppearanceSettings) => Promise<void>;
  loadCliStatus?: () => Promise<CliInstallStatus>;
  installCli?: () => Promise<CliInstallStatus>;
  loadSkills?: () => Promise<SkillDefinition[]>;
  loadSkillStatuses?: (
    skillName: string,
    customRoots: string[],
  ) => Promise<SkillInstallLocationStatus[]>;
  installSkill?: (
    skillName: string,
    target: string,
    customRoot?: string,
  ) => Promise<SkillInstallLocationStatus>;
  chooseSkillDirectory?: () => Promise<string | null>;
}

export function SettingsDialog({
  open,
  shortcutSettings,
  appearanceSettings,
  onOpenChange,
  onSaveShortcuts,
  onSaveAppearance,
  loadCliStatus = getCliInstallStatus,
  installCli = installCliTool,
  loadSkills = listAvailableSkills,
  loadSkillStatuses = getSkillInstallStatuses,
  installSkill = installSkillToTarget,
  chooseSkillDirectory = chooseSkillInstallDirectory,
}: SettingsDialogProps) {
  const [shortcutDraft, setShortcutDraft] = useState(shortcutSettings);
  const [appearanceDraft, setAppearanceDraft] = useState(appearanceSettings);
  const [terminalDraft, setTerminalDraft] = useState<TerminalSettings>(DEFAULT_TERMINAL_SETTINGS);
  const [capturingAction, setCapturingAction] = useState<ShortcutAction | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [cliStatus, setCliStatus] = useState<CliInstallStatus | null>(null);
  const [cliLoading, setCliLoading] = useState(false);
  const [cliError, setCliError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [selectedSkill, setSelectedSkill] = useState("");
  const [skillStatuses, setSkillStatuses] = useState<SkillInstallLocationStatus[]>([]);
  const [customSkillRoots, setCustomSkillRoots] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setShortcutDraft(shortcutSettings);
      setAppearanceDraft(appearanceSettings);
      // 读不到（例如不在 Tauri 里）就用默认的「终端」
      Promise.resolve()
        .then(() => getTerminalSettings())
        .then(setTerminalDraft)
        .catch(() => setTerminalDraft(DEFAULT_TERMINAL_SETTINGS));
      setErrors([]);
      setCapturingAction(null);
      setCliLoading(true);
      setCliError(null);
      loadCliStatus()
        .then(setCliStatus)
        .catch((error: unknown) => {
          setCliStatus(null);
          setCliError(String(error));
        })
        .finally(() => setCliLoading(false));
      const storedRoots = readCustomSkillRoots();
      setCustomSkillRoots(storedRoots);
      setSkillsLoading(true);
      setSkillsError(null);
      loadSkills()
        .then((availableSkills) => {
          setSkills(availableSkills);
          setSelectedSkill((current) => current || availableSkills[0]?.name || "");
        })
        .catch((error: unknown) => {
          setSkills([]);
          setSkillStatuses([]);
          setSkillsError(String(error));
        })
        .finally(() => setSkillsLoading(false));
    }
  }, [appearanceSettings, loadCliStatus, loadSkills, open, shortcutSettings]);

  useEffect(() => {
    if (!open || !selectedSkill) {
      return;
    }
    void refreshSkillStatuses(selectedSkill, customSkillRoots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customSkillRoots, open, selectedSkill]);

  function closeDialog() {
    setShortcutDraft(shortcutSettings);
    setAppearanceDraft(appearanceSettings);
    setErrors([]);
    setCapturingAction(null);
    onOpenChange(false);
  }

  function handleContentKeyDown(event: React.KeyboardEvent) {
    if (!capturingAction) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setCapturingAction(null);
      return;
    }

    const shortcut = shortcutFromEvent(event.nativeEvent);
    if (!shortcut) {
      setErrors(["Invalid shortcut."]);
      return;
    }

    setShortcutDraft((current) => setShortcut(current, capturingAction, shortcut));
    setErrors([]);
    setCapturingAction(null);
  }

  async function saveSettings() {
    const nextErrors = validateShortcutSettings(shortcutDraft);
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await Promise.all([
        onSaveShortcuts(shortcutDraft),
        onSaveAppearance(appearanceDraft),
        saveTerminalSettings(terminalDraft),
      ]);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleInstallCli() {
    setCliLoading(true);
    setCliError(null);
    try {
      setCliStatus(await installCli());
    } catch (error) {
      setCliError(String(error));
    } finally {
      setCliLoading(false);
    }
  }

  async function refreshSkillStatuses(
    skillName = selectedSkill,
    roots = customSkillRoots,
  ) {
    if (!skillName) {
      setSkillStatuses([]);
      return;
    }
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      setSkillStatuses(await loadSkillStatuses(skillName, roots));
    } catch (error) {
      setSkillStatuses([]);
      setSkillsError(String(error));
    } finally {
      setSkillsLoading(false);
    }
  }

  async function handleInstallSkill(status: SkillInstallLocationStatus) {
    if (!selectedSkill) {
      return;
    }
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const nextStatus = await installSkill(
        selectedSkill,
        status.target,
        status.target === "custom" ? customRootFromStatus(status) : undefined,
      );
      setSkillStatuses((current) =>
        current.map((item) =>
          item.target === status.target && item.path === status.path ? nextStatus : item,
        ),
      );
    } catch (error) {
      setSkillsError(String(error));
    } finally {
      setSkillsLoading(false);
    }
  }

  async function handleChooseSkillDirectory() {
    const directory = await chooseSkillDirectory();
    if (!directory) {
      return;
    }
    setCustomSkillRoots((current) => {
      const next = current.includes(directory) ? current : [...current, directory];
      writeCustomSkillRoots(next);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden border-easydo-border bg-easydo-bg p-0 text-easydo-cream shadow-easydo-card sm:max-w-[560px]"
        onKeyDown={handleContentKeyDown}
      >
        <DialogHeader className="shrink-0 border-b border-easydo-borderSoft px-4 py-3">
          <DialogTitle className="text-sm font-semibold text-easydo-cream">设置</DialogTitle>
          <DialogDescription className="sr-only">外观、快捷键、命令行工具和 Skill 安装</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <SettingsSection title="外观">
            <SettingsRow label="主题" description="跟随系统时与 macOS 外观一致">
              <ToggleGroup
                type="single"
                value={appearanceDraft.mode}
                onValueChange={(value) => {
                  if (value) {
                    setAppearanceDraft({ version: 1, mode: value as ThemeMode });
                  }
                }}
                className="rounded border border-easydo-borderSoft bg-easydo-bgSoft p-0.5"
              >
                {themeModeOptions.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="h-6 rounded px-2.5 text-xs text-easydo-textMuted hover:bg-transparent hover:text-easydo-cream data-[state=on]:bg-easydo-surface data-[state=on]:text-easydo-cream data-[state=on]:shadow-easydo-lavender"
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Bot">
            <SettingsRow label="终端" description="在消息里点「在终端打开」时用哪个终端打开会话">
              <ToggleGroup
                type="single"
                aria-label="打开会话的终端"
                value={terminalDraft.app}
                onValueChange={(value) => {
                  if (value) {
                    setTerminalDraft({ version: 1, app: value as TerminalApp });
                  }
                }}
                className="rounded border border-easydo-borderSoft bg-easydo-bgSoft p-0.5"
              >
                {TERMINAL_OPTIONS.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="h-6 rounded px-2.5 text-xs text-easydo-textMuted hover:bg-transparent hover:text-easydo-cream data-[state=on]:bg-easydo-surface data-[state=on]:text-easydo-cream data-[state=on]:shadow-easydo-lavender"
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            title="快捷键"
            footer={errors.length > 0 ? <FieldError errors={errors.map((message) => ({ message }))} /> : null}
          >
            {shortcutActions.map((action) => {
              const shortcut = getShortcut(shortcutDraft, action.id);
              const capturing = capturingAction === action.id;
              return (
                <SettingsRow key={action.id} label={action.label} htmlFor={`shortcut-${action.id}`}>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id={`shortcut-${action.id}`}
                      readOnly
                      value={capturing ? "请按下快捷键…" : formatShortcut(shortcut)}
                      onClick={() => setCapturingAction(action.id)}
                      aria-invalid={errors.length > 0}
                      className="h-7 w-36 rounded border-easydo-border bg-easydo-bgSoft text-center font-mono text-xs text-easydo-cream focus-visible:border-easydo-gold focus-visible:ring-easydo-gold/25"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
                      onClick={() => setCapturingAction(action.id)}
                    >
                      录制
                    </Button>
                  </div>
                </SettingsRow>
              );
            })}
          </SettingsSection>

          <SettingsSection title="命令行">
            <SettingsRow
              label="终端命令 easydo"
              description={
                <span className={cliError ? "text-destructive" : undefined}>
                  {cliLoading
                    ? "正在检查命令行工具…"
                    : cliError ?? cliStatus?.message ?? "暂时无法获取命令行工具状态。"}
                  {cliStatus?.linkPath ? `（${cliStatus.linkPath}）` : ""}
                </span>
              }
            >
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={cliLoading}
                  title="检查命令行工具状态"
                  className="h-7 rounded text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
                  onClick={() => {
                    setCliLoading(true);
                    setCliError(null);
                    loadCliStatus()
                      .then(setCliStatus)
                      .catch((error: unknown) => setCliError(String(error)))
                      .finally(() => setCliLoading(false));
                  }}
                >
                  <RefreshCw data-icon="inline-start" />
                  检查
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cliLoading || cliStatus?.state === "conflict"}
                  className="h-7 rounded border-easydo-border bg-easydo-surface text-xs text-easydo-cream hover:bg-easydo-surfaceHover"
                  onClick={() => void handleInstallCli()}
                >
                  <Terminal data-icon="inline-start" />
                  {cliStatus?.state === "installed" ? "重新安装" : "安装命令行工具"}
                </Button>
              </div>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            title="Skill"
            footer={
              skillsError ? (
                <p className="text-xs text-destructive">{skillsError}</p>
              ) : (
                <p className="text-xs text-easydo-textMuted">选择的自定义文件夹会保留，之后打开设置时一起检查。</p>
              )
            }
          >
            <SettingsRow label="要安装的 Skill">
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="要安装的 Skill"
                  value={selectedSkill}
                  disabled={skillsLoading || skills.length === 0}
                  onChange={(event) => setSelectedSkill(event.target.value)}
                  className="h-7 min-w-32 rounded border border-easydo-border bg-easydo-bgSoft px-2 text-xs text-easydo-cream outline-none focus-visible:border-easydo-gold focus-visible:ring-3 focus-visible:ring-easydo-gold/25"
                >
                  {skills.map((skill) => (
                    <option key={skill.name} value={skill.name}>
                      {skill.name} {skill.version}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={skillsLoading || !selectedSkill}
                  title="检查 Skill 状态"
                  className="h-7 rounded text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
                  onClick={() => void refreshSkillStatuses()}
                >
                  <RefreshCw data-icon="inline-start" />
                  检查
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={skillsLoading || !selectedSkill}
                  className="h-7 rounded text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
                  onClick={() => void handleChooseSkillDirectory()}
                >
                  <FolderOpen data-icon="inline-start" />
                  选择文件夹
                </Button>
              </div>
            </SettingsRow>
            {skillRows(skillStatuses).map((status) => (
              <SettingsRow
                key={`${status.target}:${status.path}`}
                label={skillTargetLabel(status.target)}
                description={<span className="block truncate font-mono">{status.path}</span>}
              >
                <div className="flex items-center gap-2">
                  <span
                    title={status.message}
                    className={cn("rounded px-1.5 text-xs leading-5", skillStateClass(status.state))}
                  >
                    {skillStateLabel(status.state)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={skillsLoading || status.state === "conflict"}
                    className="h-7 rounded border-easydo-border bg-easydo-surface text-xs text-easydo-cream hover:bg-easydo-surfaceHover"
                    onClick={() => void handleInstallSkill(status)}
                  >
                    <Download data-icon="inline-start" />
                    {status.state === "installed" ? "重新安装" : "安装"}
                  </Button>
                </div>
              </SettingsRow>
            ))}
          </SettingsSection>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 flex-row items-center rounded-none border-t border-easydo-borderSoft bg-easydo-bg px-4 py-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded text-xs text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={() => {
              setShortcutDraft(defaultShortcutSettings);
              setAppearanceDraft(defaultAppearanceSettings);
              setTerminalDraft(DEFAULT_TERMINAL_SETTINGS);
              setErrors([]);
              setCapturingAction(null);
            }}
          >
            恢复默认
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded border-easydo-border bg-easydo-surface text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
              onClick={closeDialog}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 rounded text-xs"
              onClick={() => void saveSettings()}
              disabled={saving}
            >
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSection({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-xs font-medium text-easydo-textMuted">{title}</h3>
      <div className="divide-y divide-easydo-borderSoft rounded border border-easydo-borderSoft bg-easydo-surface">
        {children}
      </div>
      {footer ? <div className="px-1">{footer}</div> : null}
    </section>
  );
}

function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-3 py-2">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm text-easydo-cream">
          {label}
        </label>
        {description ? <div className="mt-0.5 text-xs text-easydo-textMuted">{description}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function skillRows(statuses: SkillInstallLocationStatus[]) {
  const targetOrder = new Map<string, number>(
    defaultSkillTargets.map((target, index) => [target, index]),
  );
  return [...statuses].sort((left, right) => {
    const leftOrder = targetOrder.get(left.target) ?? 99;
    const rightOrder = targetOrder.get(right.target) ?? 99;
    return leftOrder - rightOrder || left.path.localeCompare(right.path);
  });
}

function skillTargetLabel(target: string) {
  switch (target) {
    case "agents":
      return "Agents";
    case "codex":
      return "Codex";
    case "claude":
      return "Claude";
    default:
      return "自定义文件夹";
  }
}

function skillStateLabel(state: string) {
  switch (state) {
    case "installed":
      return "已安装";
    case "outdated":
      return "可更新";
    case "conflict":
      return "冲突";
    case "error":
      return "出错";
    default:
      return "未安装";
  }
}

function skillStateClass(state: string) {
  if (state === "installed") {
    return "bg-easydo-surfaceActive text-easydo-textSecondary";
  }
  if (state === "outdated") {
    return "bg-easydo-goldSoft text-easydo-cream";
  }
  if (state === "conflict" || state === "error") {
    return "bg-destructive/15 text-destructive";
  }
  return "text-easydo-textMuted";
}

function customRootFromStatus(status: SkillInstallLocationStatus) {
  return status.path.endsWith(`/${status.skill}`)
    ? status.path.slice(0, -status.skill.length - 1)
    : status.path;
}

function readCustomSkillRoots() {
  try {
    const value = window.localStorage.getItem(CUSTOM_SKILL_ROOTS_STORAGE_KEY);
    const roots = value ? JSON.parse(value) : [];
    return Array.isArray(roots)
      ? roots.filter((root): root is string => typeof root === "string" && root.length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeCustomSkillRoots(roots: string[]) {
  window.localStorage.setItem(CUSTOM_SKILL_ROOTS_STORAGE_KEY, JSON.stringify(roots));
}
