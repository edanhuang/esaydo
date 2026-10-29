#!/usr/bin/env bash
# 安装 / 卸载 EasyDo 工作同步 hook（用户级 Claude Code 配置）。
#
#   bash scripts/agent-sync/install.sh             安装或更新
#   bash scripts/agent-sync/install.sh --uninstall 移除 hook 配置（保留日志与状态）
#
# 修改 ~/.claude/settings.json 前会先备份；只增删本 hook 自己的条目，不动其他 hook。
set -euo pipefail

src_dir="$(cd "$(dirname "$0")" && pwd)"
install_dir="$HOME/.claude/hooks/easydo-sync"
settings="$HOME/.claude/settings.json"
mode="${1:-install}"

if [[ -f "$settings" ]]; then
  backup="$settings.bak-$(date +%Y%m%d%H%M%S)"
  cp "$settings" "$backup"
  echo "已备份 $settings -> $backup"
fi

if [[ "$mode" != "--uninstall" ]]; then
  mkdir -p "$install_dir"
  cp "$src_dir/hook.sh" "$src_dir/worker.py" "$src_dir/prompt.md" "$install_dir/"
  chmod 755 "$install_dir/hook.sh"

  claude_bin="$(command -v claude || true)"
  easydo_bin="$(command -v easydo || echo /usr/local/bin/easydo)"
  if [[ -z "$claude_bin" ]]; then
    echo "未找到 claude CLI，请先安装 Claude Code CLI" >&2
    exit 1
  fi
  /usr/bin/python3 -I - "$install_dir/config.json" "$claude_bin" "$easydo_bin" <<'PY'
import json, sys
path, claude, easydo = sys.argv[1:4]
json.dump({"claude": claude, "easydo": easydo}, open(path, "w"), ensure_ascii=False, indent=2)
PY
  echo "已安装脚本到 $install_dir（claude: $claude_bin，easydo: $easydo_bin）"
fi

/usr/bin/python3 -I - "$settings" "$install_dir/hook.sh" "$mode" <<'PY'
import json, os, sys
settings_path, hook_path, mode = sys.argv[1:4]
settings = {}
if os.path.exists(settings_path):
    with open(settings_path, encoding="utf-8") as handle:
        settings = json.load(handle)
hooks = settings.setdefault("hooks", {})
# 只注册 Stop；SessionEnd 是旧版本注册的，这里一并清掉。
# 退出或重启客户端时所有打开的会话会一起触发 SessionEnd，会把很久以前的旧会话拉起来补同步。
for event in ("Stop", "SessionEnd"):
    groups = []
    for group in hooks.get(event, []):
        kept = [hook for hook in group.get("hooks", []) if "easydo-sync/hook.sh" not in hook.get("command", "")]
        if kept:
            groups.append({**group, "hooks": kept})
    if mode != "--uninstall" and event == "Stop":
        groups.append({
            "matcher": "",
            "hooks": [{"type": "command", "command": f'"{hook_path}"', "async": True, "timeout": 10}],
        })
    if groups:
        hooks[event] = groups
    else:
        hooks.pop(event, None)
with open(settings_path, "w", encoding="utf-8") as handle:
    json.dump(settings, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY

if [[ "$mode" == "--uninstall" ]]; then
  echo "已从 $settings 移除 EasyDo 工作同步 hook"
else
  echo "已在 $settings 注册 Stop hook"
fi
