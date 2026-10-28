import { describe, expect, it } from "vitest";
import { BOT_COLORS, pickRandomColor } from "./bots";
import type { BotColor } from "../types";

describe("pickRandomColor", () => {
  it("只在还没被用过的颜色里随机", () => {
    const used: BotColor[] = ["amber", "olive", "moss"];
    expect(pickRandomColor(used, () => 0)).toBe("teal");
    expect(pickRandomColor(used, () => 0.999)).toBe("graphite");
  });

  it("颜色都被用过时，从被用得最少的颜色里随机", () => {
    const used: BotColor[] = [...BOT_COLORS.map((color) => color.value), "amber", "teal", "teal", "rose"];
    // 用得最少的是 olive、moss、indigo、plum、graphite（各 1 次）
    expect(pickRandomColor(used, () => 0)).toBe("olive");
    expect(pickRandomColor(used, () => 0.999)).toBe("graphite");
  });
});
