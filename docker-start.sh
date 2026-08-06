#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose=(docker compose --project-directory "$root_dir" -f "$root_dir/compose.yaml")

command -v docker >/dev/null 2>&1 || { echo 'Docker was not found. Install Docker Engine and the Compose plugin.' >&2; exit 1; }
"${compose[@]}" version >/dev/null
"${compose[@]}" up -d --build --remove-orphans --wait

binding="$("${compose[@]}" port web 80)"
printf 'Sagnex is running at http://%s\n' "$binding"
