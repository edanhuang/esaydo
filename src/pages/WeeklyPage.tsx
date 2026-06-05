import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { listTodos } from "../lib/api";
import {
  addWeeks,
  formatDateHeading,
  formatWeekLabel,
  getCurrentWeekRange,
  groupTodosByDailyDate,
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
  const dayTrackRef = useRef<HTMLDivElement>(null);

  const weekRange = useMemo(() => addWeeks(getCurrentWeekRange(), weekOffset), [weekOffset]);
  const dayGroups = useMemo(() => groupTodosByDailyDate(todos, weekRange), [todos, weekRange]);

  useEffect(() => {
    setLoading(true);
    listTodos()
      .then((items) => {
        setTodos(items);
        setLoading(false);
      })
      .catch((nextError: unknown) => {
        setError(String(nextError));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (dayTrackRef.current) {
      dayTrackRef.current.scrollLeft = 0;
    }
  }, [weekOffset]);

  return (
    <div className="flex h-screen overflow-hidden bg-easydo-bg text-easydo-text">
      <AppSidebar
        view="daily"
        collapsed={sidebarCollapsed}
        onNavigate={onNavigate}
        onToggleCollapsed={onToggleSidebar}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-easydo-borderSoft bg-easydo-bg/80 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-easydo-cream">Daily</h1>
              <p className="text-sm text-easydo-textMuted">{formatWeekLabel(weekRange)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                title="上一周"
                variant="outline"
                size="icon-lg"
                className="border-easydo-border bg-easydo-surface text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
                onClick={() => setWeekOffset((offset) => offset - 1)}
              >
                <ChevronLeft data-icon="inline-start" />
              </Button>
              <Button
                type="button"
                title="下一周"
                variant="outline"
                size="icon-lg"
                className="border-easydo-border bg-easydo-surface text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
                onClick={() => setWeekOffset((offset) => offset + 1)}
              >
                <ChevronRight data-icon="inline-start" />
              </Button>
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </header>

        <main className="min-h-0 flex-1 overflow-hidden px-5 py-5">
          {loading ? <p className="text-sm text-easydo-textMuted">Loading daily view</p> : null}
          {!loading && dayGroups.every(([, items]) => items.length === 0) ? (
            <div className="rounded-easydo-lg border border-easydo-border bg-easydo-surface px-4 py-10 text-center text-sm text-easydo-textMuted shadow-easydo-card">
              这周暂无事项
            </div>
          ) : null}
          <div
            ref={dayTrackRef}
            className="no-scrollbar flex min-h-0 justify-start gap-3 overflow-x-auto overscroll-x-contain"
          >
            {dayGroups.map(([date, items]) => (
              <section
                key={date}
                className="flex max-h-[calc(100vh-11rem)] w-[360px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-3">
                  <h2 className="text-sm font-semibold text-card-foreground">
                    {formatDateHeading(date)}
                  </h2>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <ul className="no-scrollbar min-h-0 overflow-y-auto divide-y divide-border">
                  {items.map((todo) => (
                    <li
                      key={todo.id}
                      className="px-3 py-2.5 text-sm leading-6 text-foreground"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={
                            todo.status === "done"
                              ? "mt-2 size-2 shrink-0 rounded-full bg-easydo-success"
                              : "mt-2 size-2 shrink-0 rounded-full bg-primary"
                          }
                        />
                        <span className={todo.status === "done" ? "min-w-0 whitespace-pre-wrap break-words text-muted-foreground" : "min-w-0 whitespace-pre-wrap break-words"}>
                          {todo.detail}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
