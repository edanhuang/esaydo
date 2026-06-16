import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LayoutList,
  Minus,
  Plus,
} from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { defaultShortcutSettings } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { AppView, BoardView, Group, ShortcutBinding, ShortcutSettings } from "@/types";
import easydoLogo from "../../../src-tauri/icons/EasyDo.iconset/icon_32x32.png";

interface AppSidebarProps {
  view: AppView;
  collapsed: boolean;
  currentBoardView?: BoardView | null;
  groups?: Group[];
  showBoardControls?: boolean;
  shortcutSettings?: ShortcutSettings;
  onNavigate: (view: AppView) => void;
  onToggleCollapsed: () => void;
  onSelectGroup?: (index: number) => void;
  onSetBoardViewGroupMembership?: (groupId: string, included: boolean) => void;
  inboxCount?: number;
  inboxActive?: boolean;
  inboxDropEnabled?: boolean;
  onOpenInbox?: () => void;
}

export function AppSidebar({
  view,
  collapsed,
  currentBoardView = null,
  groups = [],
  showBoardControls = false,
  shortcutSettings = defaultShortcutSettings,
  onNavigate,
  onToggleCollapsed,
  onSelectGroup,
  onSetBoardViewGroupMembership,
  inboxCount = 0,
  inboxActive = false,
  inboxDropEnabled = false,
  onOpenInbox,
}: AppSidebarProps) {
  const isAllView = currentBoardView?.systemKey === "all";
  const currentViewGroupIds = new Set(currentBoardView?.groups.map((group) => group.id) ?? []);

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 flex-col overflow-hidden border-r border-easydo-borderSoft bg-easydo-bgSoft px-2 py-3 transition-[width] duration-200 md:flex",
        collapsed ? "w-16 items-center" : "w-[184px]",
      )}
    >
      <div
        className={cn(
          "mb-3 flex shrink-0 items-center",
          collapsed ? "flex-col gap-2" : "w-full justify-between",
        )}
      >
        <img
          src={easydoLogo}
          alt="EasyDo logo"
          className="size-8 rounded-sm"
        />
        {collapsed ? (
          <Button
            type="button"
            title="展开侧栏"
            variant="ghost"
            size="icon-sm"
            className="rounded-none text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={onToggleCollapsed}
          >
            <ChevronRight data-icon="inline-start" />
          </Button>
        ) : (
          <Button
            type="button"
            title="收起侧栏"
            variant="ghost"
            size="icon-sm"
            className="rounded-none text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={onToggleCollapsed}
          >
            <ChevronLeft data-icon="inline-start" />
          </Button>
        )}
      </div>

      {!collapsed ? (
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div data-sidebar-scroll className="min-h-0 flex-1 overflow-y-auto pr-1">
            <nav className="flex w-full flex-col gap-4">
              <section className="flex w-full flex-col gap-1">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-easydo-cream/75">
                  View
                </p>
                <SidebarButton
                  active={view === "board"}
                  icon={<LayoutList data-icon="inline-start" />}
                  label="Board"
                  onClick={() => onNavigate("board")}
                />
                <SidebarButton
                  active={view === "daily"}
                  icon={<CalendarDays data-icon="inline-start" />}
                  label="Daily"
                  onClick={() => onNavigate("daily")}
                />
              </section>

              {showBoardControls ? (
                <section className="flex flex-col gap-1">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-easydo-cream/75">
                    Input Group
                  </p>
                  {(inboxCount > 0 || inboxActive) ? (
                    <button
                      type="button"
                      data-sidebar-inbox
                      data-active={inboxActive}
                      onClick={onOpenInbox}
                      className={cn(
                        "flex h-8 items-center gap-2 px-2 text-left text-sm transition-colors",
                        inboxActive
                          ? "bg-easydo-surfaceActive text-easydo-cream"
                          : "text-easydo-cream/80 hover:bg-easydo-surfaceHover hover:text-easydo-cream",
                      )}
                    >
                      <Inbox className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">收件箱</span>
                      <span className="border border-border px-1.5 py-px text-xs text-muted-foreground">
                        {inboxCount}
                      </span>
                    </button>
                  ) : null}
                  {groups.map((group, index) => (
                    <SidebarGroupRow
                      key={group.id}
                      group={group}
                      index={index}
                      included={isAllView || currentViewGroupIds.has(group.id)}
                      isAllView={isAllView}
                      dropEnabled={inboxDropEnabled}
                      onSelectGroup={onSelectGroup}
                      onSetMembership={onSetBoardViewGroupMembership}
                    />
                  ))}
                </section>
              ) : null}
            </nav>
          </div>

          {showBoardControls ? (
            <div
              data-sidebar-shortcuts
              className="mt-3 flex shrink-0 flex-col items-center gap-1.5 rounded-lg border border-easydo-borderSoft bg-muted/60 p-2 text-xs text-easydo-textSecondary"
            >
              <ShortcutRow label="上一条" shortcut={shortcutSettings.selectPreviousTodo} />
              <ShortcutRow label="下一条" shortcut={shortcutSettings.selectNextTodo} />
              <ShortcutRow label="编辑" shortcut={shortcutSettings.editSelectedTodo} />
              <ShortcutRow label="完成 / 恢复" shortcut={shortcutSettings.toggleSelectedTodoDone} />
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function SidebarGroupRow({
  group,
  index,
  included,
  isAllView,
  dropEnabled,
  onSelectGroup,
  onSetMembership,
}: {
  group: Group;
  index: number;
  included: boolean;
  isAllView: boolean;
  dropEnabled: boolean;
  onSelectGroup?: (index: number) => void;
  onSetMembership?: (groupId: string, included: boolean) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `inbox-group:${group.id}`,
    disabled: !dropEnabled,
  });

  return (
    <div
      ref={setNodeRef}
      data-sidebar-group={group.id}
      data-included={included}
      data-drop-enabled={dropEnabled}
      data-drop-over={isOver}
      className={cn(
        "group/sidebar-group flex h-8 items-center transition-colors",
        isOver
          ? "bg-easydo-gold text-easydo-bg"
          : included
            ? "bg-easydo-surfaceActive text-easydo-cream"
            : "text-easydo-cream/75 hover:bg-easydo-surfaceHover hover:text-easydo-cream",
      )}
    >
      <button
        type="button"
        onClick={() => onSelectGroup?.(index)}
        className="min-w-0 flex-1 px-2 text-left text-sm outline-none"
      >
        {group.name}
      </button>
      {!isAllView && !dropEnabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={included ? `从当前 View 移除 ${group.name}` : `添加 ${group.name} 到当前 View`}
          className="mr-0.5 shrink-0 rounded-none text-easydo-textMuted opacity-0 transition-opacity hover:bg-easydo-surfaceHover hover:text-easydo-cream group-hover/sidebar-group:opacity-100 group-focus-within/sidebar-group:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onSetMembership?.(group.id, !included);
          }}
        >
          {included ? (
            <Minus data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          <span className="sr-only">
            {included ? `从当前 View 移除 ${group.name}` : `添加 ${group.name} 到当前 View`}
          </span>
        </Button>
      ) : null}
    </div>
  );
}

function ShortcutRow({ label, shortcut }: { label: string; shortcut: ShortcutBinding }) {
  return (
    <div className="grid min-h-5 w-[146px] grid-cols-[4.5rem_auto] items-center justify-start gap-1.5">
      <span>{label}</span>
      <ShortcutKeycaps shortcut={shortcut} />
    </div>
  );
}

function ShortcutKeycaps({ shortcut }: { shortcut: ShortcutBinding }) {
  const keys = [
    shortcut.metaKey ? "⌘" : null,
    shortcut.ctrlKey ? "⌃" : null,
    shortcut.altKey ? "⌥" : null,
    shortcut.shiftKey ? "⇧" : null,
    formatShortcutKey(shortcut.key),
  ].filter((key): key is string => Boolean(key));

  return (
    <KbdGroup>
      {keys.map((key, index) => (
        <Kbd key={`${key}-${index}`}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

function formatShortcutKey(key: string) {
  const keyLabels: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "↵",
    Space: "Space",
  };
  return keyLabels[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

interface SidebarButtonProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function SidebarButton({ active, icon, label, onClick }: SidebarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-8 w-full justify-start gap-2 rounded-none px-2 text-sm",
        active
          ? "bg-easydo-surfaceActive text-easydo-cream"
          : "text-easydo-cream/75 hover:bg-easydo-surfaceHover hover:text-easydo-cream",
      )}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}
