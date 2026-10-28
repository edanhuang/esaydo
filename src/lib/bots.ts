import type { BotColor, BotProvider } from "../types";

export const BOT_COLORS: Array<{ value: BotColor; label: string }> = [
  { value: "amber", label: "琥珀" },
  { value: "olive", label: "橄榄" },
  { value: "moss", label: "苔绿" },
  { value: "teal", label: "青" },
  { value: "indigo", label: "靛蓝" },
  { value: "plum", label: "梅紫" },
  { value: "rose", label: "玫红" },
  { value: "graphite", label: "石墨" },
];

export const BOT_PROVIDERS: Array<{ value: BotProvider; label: string }> = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];

/** 模型输入框的候选项；留空表示用 AI 自己的默认模型 */
export const BOT_MODEL_SUGGESTIONS: Record<BotProvider, string[]> = {
  claude: ["sonnet", "opus", "haiku"],
  codex: ["gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-sol"],
};

/** 颜色写成 HSL 三元组变量，用的时候可以带透明度：hsl(var(--bot-teal) / 0.14) */
export function botColorVar(color: BotColor) {
  return `var(--bot-${color})`;
}

export function providerLabel(provider: BotProvider) {
  return BOT_PROVIDERS.find((item) => item.value === provider)?.label ?? provider;
}

/** 颜色选择里多一个「随机」，保存时才定下具体颜色 */
export type BotColorChoice = BotColor | "random";

/** 随机取色：在被用得最少的颜色里随机挑一个——还有没用过的颜色时，就是从没用过的里挑 */
export function pickRandomColor(used: BotColor[], random: () => number = Math.random): BotColor {
  const counts = new Map<BotColor, number>(BOT_COLORS.map((color) => [color.value, 0]));
  for (const color of used) {
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const fewest = Math.min(...counts.values());
  const candidates = BOT_COLORS.map((color) => color.value).filter((color) => counts.get(color) === fewest);
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

export function formatTokens(count: number) {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}
