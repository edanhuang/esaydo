#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

profile="${1:-debug}"
target="${2:-$(rustc -vV | awk '/^host:/ { print $2 }')}"

if [[ "$profile" != "debug" && "$profile" != "release" ]]; then
  echo "profile must be debug or release" >&2
  exit 1
fi

args=(
  build
  --manifest-path src-tauri/Cargo.toml
  --bin easydo-cli
  --target "$target"
)
if [[ "$profile" == "release" ]]; then
  args+=(--release --features tauri/custom-protocol)
fi

destination="src-tauri/binaries/easydo-cli-$target"
mkdir -p "$(dirname "$destination")"
if [[ ! -e "$destination" ]]; then
  printf '#!/bin/sh\nexit 1\n' >"$destination"
  chmod 755 "$destination"
fi

cargo "${args[@]}"

source_path="src-tauri/target/$target/$profile/easydo-cli"
temporary_destination="$destination.tmp"

if [[ -f "$destination" ]] && cmp -s "$source_path" "$destination"; then
  echo "CLI sidecar is unchanged: $destination"
else
  cp "$source_path" "$temporary_destination"
  mv "$temporary_destination" "$destination"
  chmod 755 "$destination"
  echo "Updated CLI sidecar: $destination"
fi

echo "Prepared $destination"
