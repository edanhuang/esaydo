#!/bin/sh
# EasyDo 工作同步 hook（Claude Code Stop / SessionEnd）。
#
# 只做两件事：把 hook 输入登记到 inbox，唤起后台 worker；然后立即返回，不阻塞会话。
# 判断与维护 Todo 全部在 worker.py 中完成（空闲防抖 + 一次 headless Claude 调用）。
#
# 硬约束：不向 stdout 输出任何内容；退出码恒为 0。

# worker 自己调用的 headless Claude 结束时也会触发 hook，直接跳过避免递归
[ -n "$EASYDO_SYNC_WORKER" ] && exit 0

state_dir="${EASYDO_SYNC_STATE_DIR:-$HOME/Library/Application Support/com.edanhuang.easydo/agent-sync}"
mkdir -p "$state_dir/inbox" 2>/dev/null || exit 0

tmp="$state_dir/inbox/.$$.tmp"
if cat >"$tmp" 2>/dev/null; then
  mv "$tmp" "$state_dir/inbox/$(date +%s).$$.json" 2>/dev/null
else
  rm -f "$tmp" 2>/dev/null
  exit 0
fi

here="$(cd "$(dirname "$0")" && pwd)"
python_bin="/usr/bin/python3"
[ -x "$python_bin" ] || python_bin="python3"

# 必须重定向全部标准流再脱离，否则 Claude Code 会一直等管道关闭
nohup "$python_bin" -I "$here/worker.py" daemon </dev/null >/dev/null 2>&1 &
exit 0
