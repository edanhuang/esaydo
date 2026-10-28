import { useRef } from "react";

/** 弹窗关闭动画期间内容还要显示：记住最近一次非空的值，关闭时不至于闪成空白或别的文案 */
export function useLastPresent<T>(value: T | null): T | null {
  const ref = useRef(value);
  if (value !== null) {
    ref.current = value;
  }
  return ref.current;
}
