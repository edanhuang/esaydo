import {
  Bot,
  CalendarDays,
  Check,
  Inbox,
  Keyboard,
  LayoutGrid,
  Minus,
  PanelLeft,
  Plus,
} from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";
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

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // 折叠时侧栏完全不占宽度，展开按钮由页面顶栏的 SidebarExpandButton 提供
  if (collapsed) {
    return null;
  }

  return (
    <aside className="hidden h-screen w-[196px] shrink-0 flex-col border-r border-easydo-borderSoft bg-easydo-bgSoft md:flex">
      <div
        data-tauri-drag-region
        className="flex h-11 shrink-0 items-center justify-end pl-[var(--traffic-light-inset)] pr-2"
      >
        <SidebarIconButton title="收起侧栏" onClick={onToggleCollapsed}>
          <PanelLeft data-icon="inline-start" />
        </SidebarIconButton>
      </div>

      <div data-sidebar-scroll className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <nav className="flex w-full flex-col gap-5">
          <section className="flex w-full flex-col gap-0.5">
            <SidebarButton
              active={view === "daily"}
              icon={<CalendarDays data-icon="inline-start" />}
              label="每日"
              onClick={() => onNavigate("daily")}
            />
            <SidebarButton
              active={view === "board" && !inboxActive}
              icon={<LayoutGrid data-icon="inline-start" />}
              label="看板"
              onClick={() => onNavigate("board")}
            />
            <SidebarButton
              active={view === "bots"}
              icon={<Bot data-icon="inline-start" />}
              label="Bot"
              onClick={() => onNavigate("bots")}
            />
            {showBoardControls && (inboxCount > 0 || inboxActive) ? (
              <button
                type="button"
                data-sidebar-inbox
                data-active={inboxActive}
                onClick={onOpenInbox}
                className={cn(
                  sidebarRowClass,
                  inboxActive
                    ? "bg-easydo-surfaceActive font-medium text-easydo-cream"
                    : "text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream",
                )}
              >
                <Inbox className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">收件箱</span>
                <span className="rounded bg-easydo-gold px-1.5 text-xs font-medium tabular-nums text-easydo-onAccent">
                  {inboxCount}
                </span>
              </button>
            ) : null}
          </section>

          {showBoardControls ? (
            <section className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 text-xs text-easydo-textMuted">分组</p>
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

      {showBoardControls && shortcutsOpen ? (
        <div
          data-sidebar-shortcuts
          className="mx-2 mb-2 flex shrink-0 flex-col gap-1.5 rounded-xl border border-easydo-borderSoft bg-easydo-surface p-3 text-xs text-easydo-textSecondary shadow-easydo-card"
        >
          <ShortcutRow label="上一条" shortcut={shortcutSettings.selectPreviousTodo} />
          <ShortcutRow label="下一条" shortcut={shortcutSettings.selectNextTodo} />
          <ShortcutRow label="编辑" shortcut={shortcutSettings.editSelectedTodo} />
          <ShortcutRow label="完成 / 恢复" shortcut={shortcutSettings.toggleSelectedTodoDone} />
          <ShortcutRow label="画布 / 列表" shortcut={TOGGLE_LAYOUT_SHORTCUT} />
        </div>
      ) : null}

      <div className="flex h-12 shrink-0 items-center gap-2 border-t border-easydo-borderSoft px-3">
        <img src={easydoLogo} alt="" className="size-6 rounded-md" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-easydo-cream">EasyDo</span>
        {showBoardControls ? (
          <SidebarIconButton
            title="快捷键"
            pressed={shortcutsOpen}
            onClick={() => setShortcutsOpen((open) => !open)}
          >
            <Keyboard data-icon="inline-start" />
          </SidebarIconButton>
        ) : null}
      </div>
    </aside>
  );
}

/** 侧栏折叠时放在页面顶栏最左侧（紧跟红绿灯）的展开按钮 */
export function SidebarExpandButton({ onClick }: { onClick: () => void }) {
  // 标题自带左内边距，收回 6px 让按钮两侧留白对称
  return (
    <span className="-mr-1.5 flex">
      <SidebarIconButton title="展开侧栏" onClick={onClick}>
        <PanelLeft data-icon="inline-start" />
      </SidebarIconButton>
    </span>
  );
}

const TOGGLE_LAYOUT_SHORTCUT: ShortcutBinding = {
  key: "Tab",
  metaKey: false,
  shiftKey: false,
  altKey: true,
  ctrlKey: false,
};

const sidebarRowClass =
  "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors duration-150";

function SidebarIconButton({
  title,
  pressed,
  onClick,
  children,
}: {
  title: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      title={title}
      aria-pressed={pressed}
      variant="ghost"
      size="icon-sm"
      className={cn(
        "rounded-lg text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream",
        pressed && "bg-easydo-surfaceActive text-easydo-cream",
      )}
      onClick={onClick}
    >
      {children}
    </Button>
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
        // 平铺列表：不给行加底色，只在悬停时浅浅提示；是否在当前视图里用文字颜色和右侧勾号区分
        "group/sidebar-group flex h-8 items-center rounded transition-colors duration-150",
        isOver
          ? "bg-easydo-gold text-easydo-onAccent"
          : included || isAllView
            ? "text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            : "text-easydo-textDisabled hover:bg-easydo-surfaceHover hover:text-easydo-textSecondary",
      )}
    >
      <button
        type="button"
        onClick={() => onSelectGroup?.(index)}
        className="h-full min-w-0 flex-1 truncate px-2 text-left text-sm outline-none"
      >
        {group.name}
      </button>
      {!isAllView && !dropEnabled ? (
        <span className="relative mr-0.5 grid size-7 shrink-0 place-items-center">
          {included ? (
            <Check
              aria-hidden
              className="size-3.5 text-easydo-textMuted transition-opacity group-focus-within/sidebar-group:opacity-0 group-hover/sidebar-group:opacity-0"
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={included ? `从当前 View 移除 ${group.name}` : `添加 ${group.name} 到当前 View`}
            className="absolute inset-0 size-7 rounded text-easydo-textMuted opacity-0 transition-opacity hover:bg-easydo-surfaceActive hover:text-easydo-cream group-focus-within/sidebar-group:opacity-100 group-hover/sidebar-group:opacity-100"
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
        </span>
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
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        sidebarRowClass,
        "[&_svg]:size-4 [&_svg]:shrink-0",
        active
          ? "bg-easydo-surfaceActive font-medium text-easydo-cream"
          : "text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
