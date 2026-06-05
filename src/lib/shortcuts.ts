import type { ShortcutBinding, ShortcutSettings } from "../types";

export type ShortcutAction =
  | "openSettings"
  | "selectPreviousTodo"
  | "selectNextTodo"
  | "editSelectedTodo"
  | "toggleSelectedTodoDone";

export const shortcutActions: Array<{
  id: ShortcutAction;
  label: string;
  description: string;
}> = [
  {
    id: "openSettings",
    label: "Open Settings",
    description: "Show the settings dialog while EasyDo is focused.",
  },
  {
    id: "selectPreviousTodo",
    label: "Previous Todo",
    description: "Move selection to the previous visible todo.",
  },
  {
    id: "selectNextTodo",
    label: "Next Todo",
    description: "Move selection to the next visible todo.",
  },
  {
    id: "editSelectedTodo",
    label: "Edit Todo",
    description: "Edit the selected todo in place.",
  },
  {
    id: "toggleSelectedTodoDone",
    label: "Complete / Reopen",
    description: "Toggle the selected todo between active and done.",
  },
];

export const defaultShortcutSettings: ShortcutSettings = {
  version: 1,
  openSettings: binding(",", { metaKey: true }),
  selectPreviousTodo: binding("ArrowUp", { metaKey: true }),
  selectNextTodo: binding("ArrowDown", { metaKey: true }),
  editSelectedTodo: binding("Space"),
  toggleSelectedTodoDone: binding("Enter", { metaKey: true }),
};

export function getShortcut(settings: ShortcutSettings, action: ShortcutAction): ShortcutBinding {
  return settings[action];
}

export function setShortcut(
  settings: ShortcutSettings,
  action: ShortcutAction,
  shortcut: ShortcutBinding,
): ShortcutSettings {
  return {
    ...settings,
    [action]: shortcut,
  };
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "shiftKey" | "altKey" | "ctrlKey">): ShortcutBinding | null {
  const key = normalizeKey(event.key);
  if (!key || isModifierOnlyKey(key)) {
    return null;
  }

  return binding(key, {
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
  });
}

export function shortcutMatches(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "shiftKey" | "altKey" | "ctrlKey">,
  shortcut: ShortcutBinding,
): boolean {
  const key = normalizeKey(event.key);
  return (
    key === shortcut.key &&
    event.metaKey === shortcut.metaKey &&
    event.shiftKey === shortcut.shiftKey &&
    event.altKey === shortcut.altKey &&
    event.ctrlKey === shortcut.ctrlKey
  );
}

export function formatShortcut(shortcut: ShortcutBinding): string {
  const parts = [];
  if (shortcut.metaKey) {
    parts.push("Cmd");
  }
  if (shortcut.ctrlKey) {
    parts.push("Ctrl");
  }
  if (shortcut.altKey) {
    parts.push("Opt");
  }
  if (shortcut.shiftKey) {
    parts.push("Shift");
  }
  parts.push(formatKey(shortcut.key));
  return parts.join(" + ");
}

export function validateShortcutSettings(settings: ShortcutSettings): string[] {
  if (settings.version !== 1) {
    return ["Unsupported shortcut settings version."];
  }

  const errors: string[] = [];
  const seen = new Map<string, string>();

  for (const action of shortcutActions) {
    const shortcut = getShortcut(settings, action.id);
    if (!isValidShortcut(shortcut)) {
      errors.push(`${action.label} has an invalid shortcut.`);
      continue;
    }

    const signature = shortcutSignature(shortcut);
    const existing = seen.get(signature);
    if (existing) {
      errors.push(`${action.label} conflicts with ${existing}.`);
    } else {
      seen.set(signature, action.label);
    }
  }

  return errors;
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    element?.tagName === "INPUT" ||
    element?.tagName === "TEXTAREA" ||
    Boolean(element?.isContentEditable)
  );
}

function binding(
  key: string,
  modifiers: Partial<Pick<ShortcutBinding, "metaKey" | "shiftKey" | "altKey" | "ctrlKey">> = {},
): ShortcutBinding {
  return {
    key,
    metaKey: Boolean(modifiers.metaKey),
    shiftKey: Boolean(modifiers.shiftKey),
    altKey: Boolean(modifiers.altKey),
    ctrlKey: Boolean(modifiers.ctrlKey),
  };
}

function normalizeKey(key: string): string {
  if (key === " ") {
    return "Space";
  }
  if (key.length === 1) {
    return key.toLowerCase();
  }
  return key;
}

function formatKey(key: string): string {
  if (key === "Space") {
    return "Space";
  }
  if (key.startsWith("Arrow")) {
    return key.replace("Arrow", "");
  }
  return key.length === 1 ? key.toUpperCase() : key;
}

function isValidShortcut(shortcut: ShortcutBinding): boolean {
  return Boolean(shortcut.key.trim()) && !isModifierOnlyKey(shortcut.key);
}

function isModifierOnlyKey(key: string): boolean {
  return ["Meta", "Shift", "Alt", "Control", "Ctrl"].includes(key);
}

function shortcutSignature(shortcut: ShortcutBinding): string {
  return [
    shortcut.metaKey,
    shortcut.shiftKey,
    shortcut.altKey,
    shortcut.ctrlKey,
    shortcut.key.toLowerCase(),
  ].join(":");
}
