// 回复 Bot 的输入框草稿：每段对话（Bot × Todo）一份，存在本机，退出 App 也不丢。
// 只是个人的便利，不进数据库；本地存储不可用时退化成不保留
const STORAGE_KEY = "easydo.botDrafts.v1";

type Drafts = Record<string, string>;

function draftKey(botId: string, todoId: string) {
  return `${botId}:${todoId}`;
}

function readAll(): Drafts {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Drafts) : {};
  } catch {
    return {};
  }
}

export function readBotDraft(botId: string, todoId: string): string {
  const value = readAll()[draftKey(botId, todoId)];
  return typeof value === "string" ? value : "";
}

/** 内容为空（只有空白也算）就删掉这份草稿 */
export function writeBotDraft(botId: string, todoId: string, text: string) {
  const drafts = readAll();
  const key = draftKey(botId, todoId);
  if (text.trim()) {
    drafts[key] = text;
  } else {
    delete drafts[key];
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // 存不了就算了，输入框本身照常可用
  }
}
