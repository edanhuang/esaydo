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

npm run tauri build

echo
echo "DMG:"
echo "$(pwd)/src-tauri/target/release/bundle/dmg/EasyDo_0.1.0_x64.dmg"
