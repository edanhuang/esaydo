#!/usr/bin/env bash
set -euo pipefail

app_path="${1:?usage: verify-macos-bundle.sh <app-path> <arch>}"
expected_arch="${2:?usage: verify-macos-bundle.sh <app-path> <arch>}"

cli_path="$app_path/Contents/MacOS/easydo-cli"
skill_path="$app_path/Contents/Resources/skills/easydo/SKILL.md"
manifest_path="$app_path/Contents/Resources/skills/manifest.json"

[[ -x "$cli_path" ]] || {
  echo "Missing executable CLI at $cli_path" >&2
  exit 1
}
[[ -f "$skill_path" ]] || {
  echo "Missing EasyDo Skill at $skill_path" >&2
  exit 1
}
[[ -f "$manifest_path" ]] || {
  echo "Missing Skill manifest at $manifest_path" >&2
  exit 1
}

cli_file_description="$(file "$cli_path")"
[[ "$cli_file_description" == *"$expected_arch"* ]] || {
  echo "CLI architecture does not include $expected_arch" >&2
  echo "$cli_file_description" >&2
  exit 1
}

host_arch="$(uname -m)"
if [[ "$host_arch" == "$expected_arch" ]]; then
  "$cli_path" --version
  "$cli_path" help >/dev/null
else
  echo "Skipping execution smoke test for $expected_arch binary on $host_arch host"
fi
codesign --verify --deep --strict "$app_path"
cli_signature="$(codesign -dv --verbose=2 "$cli_path" 2>&1)"
[[ "$cli_signature" == *"Signature="* ]]

echo "Verified $app_path ($expected_arch)"
