#!/usr/bin/env bash
set -euo pipefail

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
demo_dir=/tmp/pi-copy-code-demo

rm -rf "$demo_dir"
mkdir -p "$demo_dir"
cp "$repo/demo/session.jsonl" "$demo_dir/session.jsonl"
cd "$demo_dir"

exec pi --offline \
  --provider openai-codex \
  --model gpt-5.5 \
  --session "$demo_dir/session.jsonl" \
  --no-extensions \
  --no-skills \
  --no-prompt-templates \
  --no-themes \
  --no-context-files \
  -e "$repo/src/index.ts"
