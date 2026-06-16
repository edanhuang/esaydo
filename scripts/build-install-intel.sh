#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

target="x86_64-apple-darwin"
arch="x86_64"
installed_app="/Applications/EasyDo.app"

load_node() {
  local node22
  local candidate
  node22=""
  for candidate in "$HOME"/.nvm/versions/node/v22.*/bin/node; do
    if [[ -x "$candidate" ]]; then
      node22="$candidate"
      break
    fi
  done
  if [[ -n "$node22" ]]; then
    export PATH="$(dirname "$node22"):$PATH"
  elif [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.nvm/nvm.sh"
    nvm use 22 >/dev/null
  else
    echo "Node 22 was not found under $HOME/.nvm/versions/node" >&2
    exit 1
  fi
}

ensure_target() {
  if rustup target list --installed | grep -qx "$target"; then
    return
  fi
  rustup target add "$target"
}

ensure_sidecar_placeholder() {
  local sidecar="src-tauri/binaries/easydo-cli-$target"
  if [[ -e "$sidecar" ]]; then
    return
  fi
  mkdir -p "$(dirname "$sidecar")"
  printf '#!/bin/sh\nexit 1\n' >"$sidecar"
  chmod 755 "$sidecar"
}

sync_built_cli() {
  local app_path="$1"
  local source_cli="src-tauri/target/$target/release/easydo-cli"
  local sidecar="src-tauri/binaries/easydo-cli-$target"
  local bundled_cli="$app_path/Contents/MacOS/easydo-cli"

  [[ -x "$source_cli" ]] || {
    echo "Missing built CLI at $source_cli" >&2
    exit 1
  }

  if ! cmp -s "$source_cli" "$sidecar"; then
    cp "$source_cli" "$sidecar.tmp"
    mv "$sidecar.tmp" "$sidecar"
    chmod 755 "$sidecar"
  fi

  cp "$source_cli" "$bundled_cli"
  chmod 755 "$bundled_cli"
  /usr/bin/codesign --force --sign - "$bundled_cli"
  /usr/bin/codesign --force --deep --sign - "$app_path"
}

install_app() {
  local source_app="$1"
  local host_arch
  host_arch="$(uname -m)"

  if [[ "$host_arch" != "$arch" ]]; then
    echo "Built Intel app, but this Mac is $host_arch. Skipping /Applications install." >&2
    return 0
  fi
  if [[ "$installed_app" != "/Applications/EasyDo.app" ]]; then
    echo "Refusing to install to unexpected path: $installed_app" >&2
    exit 1
  fi

  echo "Quitting EasyDo if it is running..."
  /usr/bin/osascript -e 'tell application id "com.edanhuang.easydo" to quit' >/dev/null 2>&1 || true
  for _ in {1..10}; do
    if ! /usr/bin/pgrep -x "EasyDo" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if /usr/bin/pgrep -x "EasyDo" >/dev/null 2>&1; then
    echo "EasyDo is still running. Quit it and run this script again." >&2
    exit 1
  fi

  echo "Installing $source_app to $installed_app..."
  if [[ -w "/Applications" ]]; then
    /bin/rm -rf "$installed_app"
    /usr/bin/ditto "$source_app" "$installed_app"
  else
    /usr/bin/sudo /bin/rm -rf "$installed_app"
    /usr/bin/sudo /usr/bin/ditto "$source_app" "$installed_app"
  fi

  /usr/bin/xattr -dr com.apple.quarantine "$installed_app" >/dev/null 2>&1 || true
  /usr/bin/codesign --verify --deep --strict "$installed_app"
  "$installed_app/Contents/MacOS/easydo-cli" --version
  /usr/bin/open -R "$installed_app"
  echo "Installed $installed_app"
}

cleanup_build_app() {
  local source_app="$1"
  if [[ "$source_app" == src-tauri/target/*/bundle/macos/EasyDo.app ]]; then
    echo "Removing build App bundle $source_app..."
    /bin/rm -rf "$source_app"
  else
    echo "Refusing to remove unexpected build App path: $source_app" >&2
    exit 1
  fi
}

load_node
ensure_target
ensure_sidecar_placeholder
./node_modules/.bin/tauri build --target "$target" --bundles app

app_path="src-tauri/target/$target/release/bundle/macos/EasyDo.app"
sync_built_cli "$app_path"
bash scripts/verify-macos-bundle.sh "$app_path" "$arch"
install_app "$app_path"
cleanup_build_app "$app_path"
