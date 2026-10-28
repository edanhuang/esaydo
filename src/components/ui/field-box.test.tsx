import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FieldBox, FieldSendButton } from "./field-box";

describe("FieldBox", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("输入框变高时底板在同一帧跟着变，不等到下一次渲染", () => {
    let resize: () => void = () => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(
      <FieldBox>
        <textarea />
      </FieldBox>,
    );
    const box = document.querySelector(".group\\/squircle") as HTMLElement;
    let height = 32;
    Object.defineProperty(box, "offsetWidth", { configurable: true, get: () => 300 });
    Object.defineProperty(box, "offsetHeight", { configurable: true, get: () => height });

    // 换行后输入框高了 20px：回调一返回，底板就得是新高度
    height = 52;
    resize();

    expect(box.querySelector("svg")).toHaveAttribute("height", "52");
  });

  it("没有文字时隐藏发送键，有字才出现，删光又隐藏", () => {
    const onSend = vi.fn();
    function Field() {
      const [value, setValue] = useState("");
      return (
        <FieldBox>
          <textarea aria-label="输入" value={value} onChange={(event) => setValue(event.target.value)} />
          <FieldSendButton title="发送" visible={Boolean(value.trim())} onClick={onSend} />
        </FieldBox>
      );
    }
    render(<Field />);
    const button = screen.getByTitle("发送");
    const input = screen.getByRole("textbox", { name: "输入" });

    expect(button).toHaveAttribute("data-visible", "false");
    expect(button).toHaveClass("invisible");
    expect(button).toBeDisabled();

    fireEvent.change(input, { target: { value: "写点什么" } });
    expect(button).toHaveAttribute("data-visible", "true");
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onSend).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "  " } });
    expect(button).toHaveAttribute("data-visible", "false");
    expect(button).toBeDisabled();
  });
});
