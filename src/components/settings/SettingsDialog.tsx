import { useEffect, useState } from "react";
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
import type { AppearanceSettings, ShortcutSettings, ThemeMode } from "@/types";

interface SettingsDialogProps {
  open: boolean;
  shortcutSettings: ShortcutSettings;
  appearanceSettings: AppearanceSettings;
  onOpenChange: (open: boolean) => void;
  onSaveShortcuts: (settings: ShortcutSettings) => Promise<void>;
  onSaveAppearance: (settings: AppearanceSettings) => Promise<void>;
}

export function SettingsDialog({
  open,
  shortcutSettings,
  appearanceSettings,
  onOpenChange,
  onSaveShortcuts,
  onSaveAppearance,
}: SettingsDialogProps) {
  const [shortcutDraft, setShortcutDraft] = useState(shortcutSettings);
  const [appearanceDraft, setAppearanceDraft] = useState(appearanceSettings);
  const [capturingAction, setCapturingAction] = useState<ShortcutAction | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setShortcutDraft(shortcutSettings);
      setAppearanceDraft(appearanceSettings);
      setErrors([]);
      setCapturingAction(null);
    }
  }, [appearanceSettings, open, shortcutSettings]);

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
