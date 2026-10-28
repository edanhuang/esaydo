import { useEffect, useState } from "react";
import { FolderOpen, Pencil, Plus, Pointer, Trash2 } from "lucide-react";
import { AppSidebar, SidebarExpandButton } from "@/components/layout/AppSidebar";
import { BotAvatar, RandomColorAvatar } from "@/components/bots/BotAvatar";
import { useBotActivity } from "@/components/bots/BotActivity";
import { MessagesButton } from "@/components/bots/MessagesButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FIELD_INPUT_CLASS, FieldBox } from "@/components/ui/field-box";
import { Input } from "@/components/ui/input";
import { chooseBotDirectory, countBotMessages, createBot, deleteBot, updateBot } from "@/lib/api";
import {
  BOT_COLORS,
  BOT_MODEL_SUGGESTIONS,
  BOT_PROVIDERS,
  formatTokens,
  pickRandomColor,
  providerLabel,
  type BotColorChoice,
} from "@/lib/bots";
import { useLastPresent } from "@/lib/useLastPresent";
import { cn } from "@/lib/utils";
import type { AppView, Bot, BotInput } from "@/types";

interface BotsPageProps {
  onNavigate: (view: AppView) => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function BotsPage({ onNavigate, sidebarCollapsed = false, onToggleSidebar = () => undefined }: BotsPageProps) {
  const { bots, loaded, refresh } = useBotActivity();
  const [editing, setEditing] = useState<Bot | "new" | null>(null);
  const [deleting, setDeleting] = useState<Bot | null>(null);
  // 还没有 Bot 时压暗页面，只留引导提示和「新建 Bot」亮着；点蒙版可以先关掉
  const [spotlightDismissed, setSpotlightDismissed] = useState(false);
  const empty = loaded && bots.length === 0;
  const spotlight = empty && !spotlightDismissed;

  return (
    <div className="flex h-screen overflow-hidden bg-easydo-bg text-easydo-text">
      <AppSidebar view="bots" collapsed={sidebarCollapsed} onNavigate={onNavigate} onToggleCollapsed={onToggleSidebar} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {spotlight ? (
          <div
            data-bot-spotlight
            aria-hidden
            className="absolute inset-0 z-40 bg-[var(--easydo-scrim)] drawer-scrim-enter"
            onClick={() => setSpotlightDismissed(true)}
          />
        ) : null}
        <header
          data-tauri-drag-region
          className={cn(
            "flex h-11 shrink-0 items-center gap-3 border-b border-easydo-borderSoft bg-easydo-surfaceWarm px-4",
            sidebarCollapsed && "pl-[calc(var(--traffic-light-inset)+14px)]",
          )}
        >
          {sidebarCollapsed ? <SidebarExpandButton onClick={onToggleSidebar} /> : null}
          <h1 className="text-sm font-semibold text-easydo-cream">Bot</h1>
          <p className="text-sm text-easydo-textMuted">{bots.length} 个</p>
          <div className="ml-auto flex items-center gap-1">
            <MessagesButton />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "ml-1 h-7 gap-1 rounded-lg border-easydo-border bg-easydo-surface text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream",
                spotlight && "relative z-50 text-easydo-cream ring-2 ring-[hsl(var(--easydo-gold)/0.55)]",
              )}
              onClick={() => setEditing("new")}
            >
              <Plus className="size-3.5" />
              新建 Bot
            </Button>
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {empty ? (
            // 还没有 Bot：手指指向右上角的「新建 Bot」，点提示本身也能新建
            <button
              type="button"
              data-bot-empty-hint
              className="absolute right-12 top-1.5 z-50 flex flex-col items-end gap-1.5 text-right"
              onClick={() => setEditing("new")}
            >
              <Pointer className="bot-hint-nudge size-6 rotate-[20deg] text-easydo-gold" strokeWidth={1.75} aria-hidden />
              <span className="flex flex-col items-end gap-0.5 rounded-xl border border-easydo-border bg-easydo-surface px-3.5 py-2.5 shadow-easydo-card">
                <span className="text-sm font-medium text-easydo-cream">点此开启Bot工作流</span>
                <span className="max-w-[260px] text-xs leading-5 text-easydo-textMuted">
                  新建一个 Bot，选好 AI、模型和工作目录，就能在 Todo 的右键菜单里派发给它
                </span>
              </span>
            </button>
          ) : (
            <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2">
              {bots.map((bot) => (
                <BotRow key={bot.id} bot={bot} onEdit={() => setEditing(bot)} onDelete={() => setDeleting(bot)} />
              ))}
            </div>
          )}
        </main>
      </div>

      <BotFormDialog
        bot={editing}
        // 编辑时自己的颜色不算占用
        usedColors={bots.filter((bot) => editing === "new" || bot.id !== editing?.id).map((bot) => bot.color)}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void refresh();
        }}
      />
      <DeleteBotDialog
        bot={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          void refresh();
        }}
      />
    </div>
  );
}

function BotRow({ bot, onEdit, onDelete }: { bot: Bot; onEdit: () => void; onDelete: () => void }) {
  const { usage } = bot;
  return (
    <article
      data-bot-row={bot.id}
      className="group flex items-start gap-3 rounded-xl border border-easydo-borderSoft bg-easydo-surface px-4 py-3"
    >
      <BotAvatar color={bot.color} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h2 className="truncate text-sm font-semibold text-easydo-cream">{bot.name}</h2>
          <span className="text-xs text-easydo-textMuted">
            {providerLabel(bot.provider)} · {bot.model || "默认模型"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-easydo-textSecondary" title={bot.directory}>
          {bot.directory}
        </p>
        <p className="mt-1.5 text-xs tabular-nums text-easydo-textMuted">
          {usage.runs === 0
            ? "还没有运行过"
            : `运行 ${usage.runs} 次 · 输入 ${formatTokens(usage.inputTokens)}（缓存 ${formatTokens(usage.cachedInputTokens)}）· 输出 ${formatTokens(usage.outputTokens)}${usage.costUsd > 0 ? ` · $${usage.costUsd.toFixed(2)}` : ""}`}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="编辑"
          className="rounded-md text-easydo-textMuted hover:bg-easydo-surfaceActive hover:text-easydo-cream"
          onClick={onEdit}
        >
          <Pencil data-icon="inline-start" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="删除"
          className="rounded-md text-easydo-textMuted hover:bg-easydo-surfaceActive hover:text-easydo-danger"
          onClick={onDelete}
        >
          <Trash2 data-icon="inline-start" />
        </Button>
      </div>
    </article>
  );
}

const fieldLabel = "text-xs text-easydo-textSecondary";

function BotFormDialog({
  bot,
  usedColors,
  onClose,
  onSaved,
}: {
  bot: Bot | "new" | null;
  usedColors: Bot["color"][];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<BotDraft>(emptyDraft());
  const shownBot = useLastPresent(bot);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError(null);
    if (bot === "new") {
      setDraft(emptyDraft());
    } else if (bot) {
      setDraft({ name: bot.name, color: bot.color, provider: bot.provider, model: bot.model, directory: bot.directory });
    }
    // 只在打开时初始化，之后颜色占用变化不覆盖用户的选择
  }, [bot]);

  async function save() {
    if (!bot || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // 「随机」到保存时才定下具体颜色
      const input: BotInput = {
        ...draft,
        color: draft.color === "random" ? pickRandomColor(usedColors) : draft.color,
      };
      if (bot === "new") {
        await createBot(input);
      } else {
        await updateBot(bot.id, input);
      }
      onSaved();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function pickDirectory() {
    try {
      const directory = await chooseBotDirectory();
      if (directory) {
        setDraft((current) => ({ ...current, directory }));
      }
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  return (
    <Dialog open={bot !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden border-easydo-border bg-easydo-bg p-0 text-easydo-cream shadow-easydo-card sm:max-w-[460px]">
        <DialogHeader className="border-b border-easydo-borderSoft px-4 py-3">
          <DialogTitle className="text-sm font-semibold text-easydo-cream">{shownBot === "new" ? "新建 Bot" : "编辑 Bot"}</DialogTitle>
          <DialogDescription className="sr-only">设置 Bot 的名称、颜色、AI、模型和工作目录</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-4 py-4">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>名称</span>
            <FieldBox radius={10}>
              <Input
                aria-label="Bot 名称"
                value={draft.name}
                placeholder="周报助手"
                className={FIELD_INPUT_CLASS}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </FieldBox>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className={fieldLabel}>颜色</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Bot 颜色">
              <button
                type="button"
                role="radio"
                aria-checked={draft.color === "random"}
                title="随机"
                className={cn(
                  "grid size-8 place-items-center rounded-lg border transition-colors",
                  draft.color === "random"
                    ? "border-easydo-cream bg-easydo-surface"
                    : "border-transparent hover:bg-easydo-surfaceHover",
                )}
                onClick={() => setDraft((current) => ({ ...current, color: "random" }))}
              >
                <RandomColorAvatar />
              </button>
              {BOT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === color.value}
                  title={color.label}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg border transition-colors",
                    draft.color === color.value
                      ? "border-easydo-cream bg-easydo-surface"
                      : "border-transparent hover:bg-easydo-surfaceHover",
                  )}
                  onClick={() => setDraft((current) => ({ ...current, color: color.value }))}
                >
                  <BotAvatar color={color.value} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={fieldLabel}>AI</span>
            <div className="flex gap-1 rounded-lg bg-easydo-surfaceHover p-0.5" role="radiogroup" aria-label="AI">
              {BOT_PROVIDERS.map((provider) => (
                <button
                  key={provider.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.provider === provider.value}
                  className={cn(
                    "h-7 flex-1 rounded-md text-xs transition-colors",
                    draft.provider === provider.value
                      ? "bg-easydo-surface text-easydo-cream shadow-easydo-lavender"
                      : "text-easydo-textMuted hover:text-easydo-cream",
                  )}
                  onClick={() => setDraft((current) => ({ ...current, provider: provider.value, model: "" }))}
                >
                  {provider.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>模型</span>
            <FieldBox radius={10}>
              <Input
                aria-label="模型"
                list={`bot-models-${draft.provider}`}
                value={draft.model}
                placeholder="留空使用默认模型"
                className={FIELD_INPUT_CLASS}
                onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
              />
            </FieldBox>
            <datalist id={`bot-models-${draft.provider}`}>
              {BOT_MODEL_SUGGESTIONS[draft.provider].map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className={fieldLabel}>工作目录</span>
            <div className="flex gap-1.5">
              <FieldBox radius={10} className="min-w-0 flex-1">
                <Input
                  aria-label="工作目录"
                  value={draft.directory}
                  placeholder="Bot 在这个目录里干活"
                  className={FIELD_INPUT_CLASS}
                  onChange={(event) => setDraft((current) => ({ ...current, directory: event.target.value }))}
                />
              </FieldBox>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 rounded-md border-easydo-border bg-easydo-surface text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
                onClick={() => void pickDirectory()}
              >
                <FolderOpen className="size-3.5" />
                选择
              </Button>
            </div>
            <p className="text-[11px] text-easydo-textMuted">Bot 在这个目录里可以执行任何命令，请选你信任交给它的目录。</p>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
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
          <Button type="button" size="sm" className="h-7 rounded text-xs" disabled={saving} onClick={() => void save()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BotDraft = Omit<BotInput, "color"> & { color: BotColorChoice };

function emptyDraft(): BotDraft {
  return { name: "", color: "random", provider: "claude", model: "", directory: "" };
}

function DeleteBotDialog({ bot, onClose, onDeleted }: { bot: Bot | null; onClose: () => void; onDeleted: () => void }) {
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownBot = useLastPresent(bot);

  useEffect(() => {
    // 关闭时不清空，关闭动画里的文案保持不变
    if (bot) {
      setError(null);
      setMessageCount(null);
      countBotMessages(bot.id)
        .then(setMessageCount)
        .catch(() => setMessageCount(null));
    }
  }, [bot]);

  async function confirm() {
    if (!bot) {
      return;
    }
    try {
      await deleteBot(bot.id);
      onDeleted();
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  return (
    <Dialog open={bot !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-3 border-easydo-border bg-easydo-bg text-easydo-cream shadow-easydo-card sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-easydo-cream">删除「{shownBot?.name}」？</DialogTitle>
          <DialogDescription className="text-xs text-easydo-textSecondary">
            {messageCount === null
              ? "它名下的会话和消息会一起删除。"
              : `它名下的会话和 ${messageCount} 条消息会一起删除。`}
            Claude、Codex 里的原会话不受影响。
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded border-easydo-border bg-easydo-surface text-xs text-easydo-textSecondary hover:bg-easydo-surfaceHover hover:text-easydo-cream"
            onClick={onClose}
          >
            取消
          </Button>
          <Button type="button" variant="destructive" size="sm" className="h-7 rounded text-xs" onClick={() => void confirm()}>
            删除
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
