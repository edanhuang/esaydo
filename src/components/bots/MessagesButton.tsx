import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBotActivity } from "./BotActivity";

/** 顶栏右侧的消息入口：打开消息抽屉浏览所有会话，带全部未读数 */
export function MessagesButton() {
  const { totalUnread, openMessages } = useBotActivity();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title="消息"
      data-messages-button
      className={cn(
        "h-7 gap-1 rounded-lg px-2 text-xs tabular-nums text-easydo-textMuted hover:bg-easydo-surfaceHover hover:text-easydo-cream",
        totalUnread > 0 && "text-easydo-cream",
      )}
      onClick={() => openMessages()}
    >
      <Mail className="size-4" />
      {totalUnread > 0 ? (
        <span className="rounded bg-easydo-gold px-[5px] text-[11px] leading-[18px] text-easydo-onAccent">{totalUnread}</span>
      ) : null}
      <span className="sr-only">消息</span>
    </Button>
  );
}
