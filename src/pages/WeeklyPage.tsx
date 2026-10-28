import { Archive, Check, ChevronLeft, ChevronRight, Circle, CircleCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSidebar, SidebarExpandButton } from "@/components/layout/AppSidebar";
import { listDailyTodos } from "../lib/api";
import { parseChecklistLine } from "../lib/checklist";
import { cn } from "../lib/utils";
import {
  addWeeks,
  formatDayHeading,
  formatWeekRangeLabel,
  formatWeekday,
  getCurrentWeekRange,
  groupTodosByDailyDate,
  todayDateKey,
} from "../lib/dates";
import type { AppView, Todo } from "../types";

interface DailyPageProps {
  onNavigate: (view: AppView) => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function DailyPage({
  onNavigate,
  sidebarCollapsed = false,
  onToggleSidebar = () => undefined,
}: DailyPageProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dayTrackRef = useRef<HTMLElement>(null);
  const windowFocusedRef = useRef(true);

  const weekRange = useMemo(() => addWeeks(getCurrentWeekRange(), weekOffset), [weekOffset]);
  const dayGroups = useMemo(() => groupTodosByDailyDate(todos, weekRange), [todos, weekRange]);

  const loadDailyTodos = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      setTodos(await listDailyTodos());
    } catch (nextError: unknown) {
      setError(String(nextError));
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDailyTodos(true);
  }, [loadDailyTodos]);

  useEffect(() => {
    function handleWindowBlur() {
      windowFocusedRef.current = false;
    }

    function handleWindowFocus() {
      if (windowFocusedRef.current) {
        return;
      }
      windowFocusedRef.current = true;
      void loadDailyTodos();
    }

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [loadDailyTodos]);

  useEffect(() => {
    if (dayTrackRef.current) {
      dayTrackRef.current.scrollTop = 0;
    }
  }, [weekOffset]);

  const today = todayDateKey();
  const dayRows = buildDayRows(dayGroups, today);
  const weekEmpty = dayGroups.every(([, items]) => items.length === 0);

  return (
    <div className="flex h-screen overflow-hidden bg-easydo-bg text-easydo-text">
      <AppSidebar
        view="daily"
        collapsed={sidebarCollapsed}
        onNavigate={onNavigate}
        onToggleCollapsed={onToggleSidebar}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-tauri-drag-region
          className={cn(
            "flex h-11 shrink-0 items-center gap-3 border-b border-easydo-borderSoft bg-easydo-surfaceWarm px-4",
            // 侧栏折叠时顶栏让出红绿灯；展开按钮到红绿灯、到标题的距离都约 23px
            sidebarCollapsed && "pl-[calc(var(--traffic-light-inset)+14px)]",
          )}
        >
          {sidebarCollapsed ? <SidebarExpandButton onClick={onToggleSidebar} /> : null}
          <h1 className="text-sm font-semibold text-easydo-cream">每日</h1>
          <p className="text-sm text-easydo-textMuted">{formatWeekRangeLabel(weekRange)}</p>
          {error ? <p className="truncate text-sm text-destructive">{error}</p> : null}
          <div className="ml-auto flex items-center gap-1">
            {weekOffset !== 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-1 rounded-lg border-easydo-border bg-easydo-surface text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
                onClick={() => setWeekOffset(0)}
              >
                本周
              </Button>
            ) : null}
            <Button
              type="button"
              title="上一周"
              variant="ghost"
              size="icon-sm"
              className="rounded-lg text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream"
              onClick={() => setWeekOffset((offset) => offset - 1)}
            >
              <ChevronLeft data-icon="inline-start" />
            </Button>
            <Button
              type="button"
              title="下一周"
              variant="ghost"
              size="icon-sm"
              className="rounded-lg text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream"
              onClick={() => setWeekOffset((offset) => offset + 1)}
            >
              <ChevronRight data-icon="inline-start" />
            </Button>
          </div>
        </header>

        <main ref={dayTrackRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto w-full max-w-[720px]">
            {loading ? <p className="text-sm text-easydo-textMuted">Loading daily view</p> : null}
            {!loading && weekEmpty ? (
              <div className="rounded-xl border border-dashed border-easydo-border px-4 py-10 text-center text-sm text-easydo-textMuted">
                这周暂无事项
              </div>
            ) : null}
            {!loading && !weekEmpty
              ? dayRows.map((row) =>
                  row.kind === "empty" ? (
                    <p
                      key={row.key}
                      className="flex items-baseline gap-2 border-b border-easydo-borderSoft py-3 text-sm text-easydo-textMuted"
                    >
                      <span className="font-medium text-easydo-textSecondary">{row.label}</span>
                      {row.note}
                    </p>
                  ) : (
                    <section
                      key={row.date}
                      className="border-b border-easydo-borderSoft py-6 first:pt-0"
                    >
                      <div className="mb-3 flex items-baseline gap-2">
                        <h2 className="text-sm font-semibold text-easydo-cream">{formatDayHeading(row.date)}</h2>
                        <span className="text-sm text-easydo-textMuted">{formatWeekday(row.date)}</span>
                        {row.date === today ? (
                          <span className="rounded bg-easydo-goldSoft px-2 text-xs text-easydo-cream">今天</span>
                        ) : null}
                        <span className="ml-auto text-xs tabular-nums text-easydo-textMuted">{row.items.length} 条</span>
                      </div>
                      <ul className="flex flex-col">
                        {row.items.map((todo) => (
                          <li
                            key={todo.id}
                            className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-3 py-2 text-sm text-easydo-cream"
                          >
                            <TodoStateIcon status={todo.status} />
                            <DailyDetail detail={todo.detail} muted={todo.status !== "active"} />
                            <span className="whitespace-nowrap text-xs leading-[18px] text-easydo-textMuted">
                              {todo.groups.map((group) => group.name).join("、")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ),
                )
              : null}
          </div>
        </main>
      </div>
    </div>
  );
}

type DayRow =
  | { kind: "day"; date: string; items: Todo[] }
  | { kind: "empty"; key: string; label: string; note: string };

/** 从新到旧排列；连续没有记录的日子合并成一行，今天之后的日子标为还没到。 */
function buildDayRows(dayGroups: Array<[string, Todo[]]>, today: string): DayRow[] {
  const rows: DayRow[] = [];
  let pending: Array<{ date: string; future: boolean }> = [];

  function flush() {
    if (pending.length === 0) {
      return;
    }
    const newest = pending[0].date;
    const oldest = pending[pending.length - 1].date;
    const label =
      newest === oldest ? formatDayHeading(newest) : `${formatDayHeading(oldest)} 至 ${formatDayHeading(newest)}`;
    const note = pending[0].future
      ? "还没到"
      : newest === oldest
        ? `${formatWeekday(newest)}，没有记录`
        : "没有记录";
    rows.push({ kind: "empty", key: `${oldest}-${newest}`, label, note });
    pending = [];
  }

  for (const [date, items] of [...dayGroups].reverse()) {
    const future = date > today;
    if (items.length === 0) {
      if (pending.length > 0 && pending[0].future !== future) {
        flush();
      }
      pending.push({ date, future });
      continue;
    }
    flush();
    rows.push({ kind: "day", date, items });
  }
  flush();
  return rows;
}

function TodoStateIcon({ status }: { status: Todo["status"] }) {
  if (status === "done") {
    return (
      <span title="已完成" className="mt-px text-easydo-gold">
        <CircleCheck className="size-[18px]" />
      </span>
    );
  }
  if (status === "archived") {
    return (
      <span title="已归档" className="mt-px text-easydo-textMuted">
        <Archive className="size-[18px]" />
      </span>
    );
  }
  return (
    <span title="进行中" className="mt-px text-easydo-textMuted">
      <Circle className="size-[18px]" />
    </span>
  );
}

function DailyDetail({ detail, muted }: { detail: string; muted: boolean }) {
  const lines = detail.split("\n");
  const textClass = cn("min-w-0 whitespace-pre-wrap break-words", muted && "text-easydo-textMuted");
  if (!lines.some((line) => parseChecklistLine(line))) {
    return <span className={textClass}>{detail}</span>;
  }
  return (
    <span className={cn(textClass, "flex flex-col gap-0.5")}>
      {lines.map((line, index) => {
        const checklist = parseChecklistLine(line);
        if (!checklist) {
          return (
            <span key={index} className="block min-h-[18px]">
              {line}
            </span>
          );
        }
        return (
          <span key={index} className="flex items-start gap-2 text-sm text-easydo-textSecondary">
            <span
              aria-label={checklist.checked ? "子任务已完成" : "子任务未完成"}
              className={cn(
                "mt-[2px] grid size-3.5 shrink-0 place-items-center rounded-[4px] border-[1.5px]",
                checklist.checked
                  ? "border-easydo-gold bg-easydo-gold text-easydo-onAccent"
                  : "border-easydo-textMuted",
              )}
            >
              {checklist.checked ? <Check className="size-2.5" strokeWidth={3.2} /> : null}
            </span>
            <span className={cn("min-w-0 flex-1", checklist.checked && "text-easydo-textMuted")}>
              {checklist.text}
            </span>
          </span>
        );
      })}
    </span>
  );
}
