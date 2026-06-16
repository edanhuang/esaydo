import { useEffect, useState } from "react";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
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
import {
  chooseSkillInstallDirectory,
  getCliInstallStatus,
  getSkillInstallStatuses,
  installCliTool,
  installSkillToTarget,
  listAvailableSkills,
} from "@/lib/api";
import type {
  AppearanceSettings,
  CliInstallStatus,
  ShortcutSettings,
  SkillDefinition,
  SkillInstallLocationStatus,
  ThemeMode,
} from "@/types";

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
        className="max-h-[calc(100vh-2rem)] overflow-auto border-easydo-border bg-easydo-surface text-easydo-cream shadow-easydo-card sm:max-w-xl"
        onKeyDown={handleContentKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="text-xl text-easydo-cream">Settings</DialogTitle>
          <DialogDescription className="text-easydo-textSecondary">
            Shortcuts and appearance apply only to EasyDo.
          </DialogDescription>
        </DialogHeader>

        <FieldSet>
          <FieldLegend className="text-easydo-cream">Appearance</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel className="text-easydo-textSecondary">Theme mode</FieldLabel>
              <ToggleGroup
                type="single"
                value={appearanceDraft.mode}
                onValueChange={(value) => {
                  if (value) {
                    setAppearanceDraft({ version: 1, mode: value as ThemeMode });
                  }
                }}
                className="rounded-easydo border border-easydo-border bg-easydo-bgSoft p-1"
              >
                {themeModeOptions.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="rounded-xl px-3 text-easydo-textSecondary data-[state=on]:bg-easydo-gold data-[state=on]:text-primary-foreground hover:bg-easydo-surfaceHover hover:text-easydo-cream"
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription className="text-easydo-textMuted">
                System follows the current macOS appearance.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend className="text-easydo-cream">Shortcuts</FieldLegend>
          <FieldGroup>
            {shortcutActions.map((action) => {
              const shortcut = getShortcut(shortcutDraft, action.id);
              const capturing = capturingAction === action.id;
              return (
                <Field key={action.id}>
                  <FieldLabel htmlFor={`shortcut-${action.id}`} className="text-easydo-textSecondary">
                    {action.label}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`shortcut-${action.id}`}
                      readOnly
                      value={capturing ? "Recording..." : formatShortcut(shortcut)}
                      onClick={() => setCapturingAction(action.id)}
                      aria-invalid={errors.length > 0}
                      className="h-10 rounded-xl border-easydo-border bg-easydo-bgSoft font-mono text-sm text-easydo-cream focus-visible:border-easydo-gold focus-visible:ring-easydo-gold/25"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="border-easydo-border bg-easydo-surfaceHover text-easydo-textSecondary hover:bg-easydo-surfaceActive hover:text-easydo-cream"
                      onClick={() => setCapturingAction(action.id)}
                    >
                      Record
                    </Button>
                  </div>
                </Field>
              );
            })}
            {errors.length > 0 ? (
              <Field data-invalid>
                <FieldError errors={errors.map((message) => ({ message }))} />
              </Field>
            ) : null}
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend className="text-easydo-cream">Command Line</FieldLegend>
          <FieldGroup>
            <Field data-invalid={Boolean(cliError)}>
              <FieldLabel className="text-easydo-textSecondary">
                Terminal command
              </FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={cliLoading || cliStatus?.state === "conflict"}
                  onClick={() => void handleInstallCli()}
                >
                  <Terminal data-icon="inline-start" />
                  {cliStatus?.state === "installed" ? "Reinstall CLI" : "Install CLI"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={cliLoading}
                  title="Check CLI status"
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
                  Check
                </Button>
              </div>
              <FieldDescription className="text-easydo-textMuted">
                {cliLoading
                  ? "Checking command line tool..."
                  : cliError ?? cliStatus?.message ?? "CLI status is unavailable."}
                {cliStatus?.linkPath ? ` (${cliStatus.linkPath})` : ""}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend className="text-easydo-cream">Skills</FieldLegend>
          <FieldGroup>
            <Field data-invalid={Boolean(skillsError)}>
              <FieldLabel className="text-easydo-textSecondary">Install skill</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedSkill}
                  disabled={skillsLoading || skills.length === 0}
                  onChange={(event) => setSelectedSkill(event.target.value)}
                  className="h-9 min-w-36 rounded-lg border border-easydo-border bg-easydo-bgSoft px-2 text-sm text-easydo-cream outline-none focus-visible:border-easydo-gold focus-visible:ring-3 focus-visible:ring-easydo-gold/25"
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
                  disabled={skillsLoading || !selectedSkill}
                  title="Check Skill status"
                  onClick={() => void refreshSkillStatuses()}
                >
                  <RefreshCw data-icon="inline-start" />
                  Check
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={skillsLoading || !selectedSkill}
                  onClick={() => void handleChooseSkillDirectory()}
                >
                  <FolderOpen data-icon="inline-start" />
                  Choose Folder
                </Button>
              </div>
              <div className="mt-2 grid gap-2">
                {skillRows(skillStatuses).map((status) => (
                  <div
                    key={`${status.target}:${status.path}`}
                    className="grid gap-2 rounded-lg border border-easydo-border bg-easydo-bgSoft p-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          aria-label={status.state === "installed" ? "installed" : "not installed"}
                          className={`size-2.5 shrink-0 rounded-full border ${skillStatusDotClass(status.state)}`}
                        />
                        <span className="text-sm font-medium text-easydo-cream">
                          {skillTargetLabel(status.target)}
                        </span>
                        <span className="truncate text-xs text-easydo-textMuted">
                          {status.message}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-easydo-textSecondary">
                        {status.path}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={skillsLoading || status.state === "conflict"}
                      onClick={() => void handleInstallSkill(status)}
                    >
                      <Download data-icon="inline-start" />
                      {status.state === "installed" ? "Reinstall" : "Install"}
                    </Button>
                  </div>
                ))}
              </div>
              {skillsError ? (
                <FieldDescription className="text-destructive">
                  {skillsError}
                </FieldDescription>
              ) : (
                <FieldDescription className="text-easydo-textMuted">
                  Custom folders are kept for future status checks.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </FieldSet>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="border-easydo-border bg-easydo-surface text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={closeDialog}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-easydo-border bg-easydo-surface text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={() => {
              setShortcutDraft(defaultShortcutSettings);
              setAppearanceDraft(defaultAppearanceSettings);
              setErrors([]);
              setCapturingAction(null);
            }}
          >
            Reset
          </Button>
          <Button
            type="button"
            className="shadow-easydo-glow"
            onClick={() => void saveSettings()}
            disabled={saving}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      return "Custom";
  }
}

function skillStatusDotClass(state: string) {
  if (state === "installed") {
    return "border-emerald-300 bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]";
  }
  if (state === "outdated") {
    return "border-amber-300 bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]";
  }
  if (state === "conflict" || state === "error") {
    return "border-red-300 bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.18)]";
  }
  return "border-zinc-300 bg-zinc-500 shadow-[0_0_0_3px_rgba(113,113,122,0.28)] dark:border-zinc-200 dark:bg-zinc-400";
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
