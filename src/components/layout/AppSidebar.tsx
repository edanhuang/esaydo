import { CalendarDays, ChevronLeft, ChevronRight, LayoutList } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppView, BoardView, Group } from "@/types";
import easydoLogo from "../../../src-tauri/icons/128x128.png";

interface AppSidebarProps {
  view: AppView;
  collapsed: boolean;
  boardViews?: BoardView[];
  boardViewTodoCounts?: Map<string, number>;
  currentBoardViewIndex?: number;
  groups?: Group[];
  currentGroupIndex?: number;
  showBoardControls?: boolean;
  onNavigate: (view: AppView) => void;
  onToggleCollapsed: () => void;
  onSelectBoardView?: (index: number) => void;
  onSelectGroup?: (index: number) => void;
}

export function AppSidebar({
  view,
  collapsed,
  boardViews = [],
  boardViewTodoCounts = new Map(),
  currentBoardViewIndex = 0,
  groups = [],
  currentGroupIndex = 0,
  showBoardControls = false,
  onNavigate,
  onToggleCollapsed,
  onSelectBoardView,
  onSelectGroup,
}: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 flex-col overflow-hidden border-r border-easydo-borderSoft bg-easydo-bgSoft px-4 py-5 transition-[width] duration-200 md:flex",
        collapsed ? "w-20 items-center" : "w-72",
      )}
    >
      <div className={cn("mb-8 flex shrink-0 items-center", collapsed ? "flex-col gap-3" : "w-full gap-3")}>
        <img
          src={easydoLogo}
          alt="EasyDo logo"
          className="size-11 rounded-easydo"
        />
        {collapsed ? (
          <Button
            type="button"
            title="展开侧栏"
            variant="ghost"
            size="icon-sm"
            className="text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={onToggleCollapsed}
          >
            <ChevronRight data-icon="inline-start" />
          </Button>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-normal">EasyDo</h1>
              <p className="text-xs text-easydo-textMuted">One snap, tasks are handled.</p>
            </div>
            <Button
              type="button"
              title="收起侧栏"
              variant="ghost"
              size="icon-sm"
              className="text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream"
              onClick={onToggleCollapsed}
            >
              <ChevronLeft data-icon="inline-start" />
            </Button>
          </>
        )}
      </div>

      {!collapsed ? (
        <div className="min-h-0 w-full flex-1 overflow-y-auto pr-1">
          <nav className="flex w-full flex-col gap-6">
            <section className="flex w-full flex-col gap-2">
              <p className="px-2 text-xs font-medium uppercase tracking-wide text-easydo-textMuted">
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
              <>
                <section className="flex flex-col gap-2">
                  <p className="px-2 text-xs font-medium uppercase tracking-wide text-easydo-textMuted">
                    Board Views
                  </p>
                  {boardViews.map((boardView, index) => (
                    <Button
                      key={boardView.id}
                      type="button"
                      variant="ghost"
                      onClick={() => onSelectBoardView?.(index)}
                      className={cn(
                        "h-10 w-full justify-between rounded-xl px-3 text-sm",
                        index === currentBoardViewIndex
                          ? "bg-easydo-surfaceActive text-easydo-cream"
                          : "text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream",
                      )}
                    >
                      <span>{boardView.name}</span>
                      <span className="text-xs text-easydo-textMuted">
                        {boardViewTodoCounts.get(boardView.id) ?? 0}
                      </span>
                    </Button>
                  ))}
                </section>

                <section className="flex flex-col gap-2">
                  <p className="px-2 text-xs font-medium uppercase tracking-wide text-easydo-textMuted">
                    Input Group
                  </p>
                  {groups.map((group, index) => (
                    <Button
                      key={group.id}
                      type="button"
                      variant="ghost"
                      onClick={() => onSelectGroup?.(index)}
                      className={cn(
                        "h-9 w-full justify-start rounded-xl px-3 text-sm",
                        index === currentGroupIndex
                          ? "bg-easydo-surface text-easydo-gold ring-1 ring-easydo-gold/30"
                          : "text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream",
                      )}
                    >
                      {group.name}
                    </Button>
                  ))}
                </section>
              </>
            ) : null}
          </nav>

          {showBoardControls ? (
            <div className="mt-6 rounded-easydo border border-easydo-border bg-easydo-surface px-4 py-4 text-xs text-easydo-textMuted">
              <p className="mb-2 text-easydo-textSecondary">Keyboard flow</p>
              <div className="flex flex-col gap-1.5">
                <span>Cmd + Up / Down selects</span>
                <span>Space edits selected</span>
                <span>Cmd + Enter toggles done</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
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
        "h-10 w-full justify-start gap-2 rounded-xl px-3 text-sm",
        active
          ? "bg-easydo-surfaceActive text-easydo-cream"
          : "text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream",
      )}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}
