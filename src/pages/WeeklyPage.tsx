import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CopyWorklogButton } from "../components/weekly/CopyWorklogButton";
import { WeeklyDayGroup } from "../components/weekly/WeeklyDayGroup";
import { listWeeklyDone } from "../lib/api";
import { buildWeeklyMarkdown, getCurrentWeekRange, groupTodosByCompletedDate } from "../lib/dates";
import type { AppView, Todo } from "../types";

interface WeeklyPageProps {
  onNavigate: (view: AppView) => void;
}

export function WeeklyPage({ onNavigate }: WeeklyPageProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekRange = useMemo(() => getCurrentWeekRange(), []);
  const dayGroups = useMemo(() => groupTodosByCompletedDate(todos), [todos]);
  const markdown = useMemo(() => buildWeeklyMarkdown(dayGroups), [dayGroups]);

  useEffect(() => {
    listWeeklyDone(weekRange.start.toISOString(), weekRange.end.toISOString())
      .then((items) => {
        setTodos(items);
        setLoading(false);
      })
      .catch((nextError: unknown) => {
        setError(String(nextError));
        setLoading(false);
      });
  }, [weekRange.end, weekRange.start]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="min-h-screen px-5 py-5">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            title="返回看板"
            onClick={() => onNavigate("board")}
            className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">本周完成内容</h1>
            <p className="text-sm text-muted-foreground">
              {weekRange.start.toLocaleDateString()} - {weekRange.end.toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {copied ? <span className="text-sm text-muted-foreground">已复制</span> : null}
          <CopyWorklogButton markdown={markdown} onCopied={() => setCopied(true)} />
        </div>
      </header>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading weekly worklog</p> : null}
      {!loading && dayGroups.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          本周暂无完成事项
        </div>
      ) : null}
      <div>
        {dayGroups.map(([date, items]) => (
          <WeeklyDayGroup key={date} date={date} todos={items} />
        ))}
      </div>
    </div>
  );
}
