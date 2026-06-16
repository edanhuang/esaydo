#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
  nvm use 22
else
  echo "nvm not found at $HOME/.nvm/nvm.sh" >&2
  exit 1
fi

targets=(
  "x86_64-apple-darwin:x86_64"
  "aarch64-apple-darwin:arm64"
)

for entry in "${targets[@]}"; do
  target="${entry%%:*}"
  arch="${entry##*:}"

  rustup target add "$target"
  bash scripts/prepare-cli.sh release "$target"
  npx tauri build --target "$target"

  app_path="src-tauri/target/$target/release/bundle/macos/EasyDo.app"
  bash scripts/verify-macos-bundle.sh "$app_path" "$arch"

  echo
  echo "DMG ($arch):"
  find "src-tauri/target/$target/release/bundle/dmg" -maxdepth 1 -name '*.dmg' -print
done
