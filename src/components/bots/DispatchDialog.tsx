import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { dispatchTodoToBot, getBotDispatchPreview } from "@/lib/api";
import { providerLabel } from "@/lib/bots";
import type { Bot, DispatchPreview, Todo } from "@/types";
import { BotAvatar } from "./BotAvatar";

export function DispatchDialog({
  target,
  onClose,
  onDispatched,
}: {
  target: { todo: Todo; bot: Bot } | null;
  onClose: () => void;
  onDispatched: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<DispatchPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isComposingRef = useRef(false);

  useEffect(() => {
    setInstruction("");
    setError(null);
    setPreview(null);
    if (!target) {
      return;
    }
    getBotDispatchPreview(target.todo.id, target.bot.id)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [target]);

  async function submit() {
    if (!target || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await dispatchTodoToBot(target.todo.id, target.bot.id, instruction);
      onDispatched();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  const headline = target?.todo.detail.split("\n").find((line) => line.trim()) ?? "";

  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {/* 弹窗是单列 grid：列宽不锁死时，很长的工作目录会把整列撑宽，右侧被裁掉 */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden border-easydo-border bg-easydo-bg p-0 text-easydo-cream shadow-easydo-card sm:max-w-[460px]">
        <DialogHeader className="border-b border-easydo-borderSoft px-4 py-3">
          <DialogTitle className="text-sm font-semibold text-easydo-cream">派发给 Bot</DialogTitle>
          <DialogDescription className="sr-only">把这条 Todo 交给 Bot 处理</DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="flex flex-col gap-3 px-4 py-4 text-sm">
            <div className="flex items-center gap-2">
              <BotAvatar color={target.bot.color} />
              <span className="font-medium">{target.bot.name}</span>
              <span className="text-xs text-easydo-textMuted">
                {providerLabel(target.bot.provider)}
                {target.bot.model ? ` · ${target.bot.model}` : ""}
              </span>
            </div>
            <p className="truncate text-xs text-easydo-textMuted" title={target.bot.directory}>
              工作目录：{directoryName(target.bot.directory)}
            </p>
            <p className="line-clamp-2 rounded-md bg-easydo-surface px-2.5 py-2 text-easydo-textSecondary">{headline}</p>
            {preview?.sessionTitle ? (
              <p className="text-xs text-easydo-textSecondary">将继续上次的会话：{preview.sessionTitle}</p>
            ) : null}
            {preview?.sessionWillReset ? (
              <p className="text-xs text-easydo-textSecondary">Bot 换过 AI 或目录，这次会新开会话，之前的上下文不会带过去。</p>
            ) : null}
            <Textarea
              aria-label="补充说明"
              value={instruction}
              placeholder="补充说明（可不填，默认按 Todo 内容处理）"
              className="min-h-20 resize-none border-easydo-border bg-easydo-surface text-sm text-easydo-cream placeholder:font-light placeholder:text-[hsl(var(--easydo-text-muted)/0.55)] md:text-sm"
              onChange={(event) => setInstruction(event.target.value)}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !isComposingRef.current) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="mx-0 mb-0 flex-row items-center justify-end rounded-none border-t border-easydo-borderSoft bg-easydo-bg px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded border-easydo-border bg-easydo-surface text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={onClose}
          >
            取消
          </Button>
          <Button type="button" size="sm" className="h-7 rounded text-xs" disabled={submitting} onClick={() => void submit()}>
            派发
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 只取末级目录名，完整路径留在悬停提示里 */
function directoryName(path: string) {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}
