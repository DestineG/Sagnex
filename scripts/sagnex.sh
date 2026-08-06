#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
config_dir="$root_dir/config"
config_path="$config_dir/sagnex.env"
config_example_path="$config_dir/sagnex.env.example"
compose=(docker compose --project-directory "$root_dir" --env-file "$config_path" -f "$root_dir/compose.yaml")

initialize_config() {
  mkdir -p "$config_dir"
  if [[ ! -f "$config_path" ]]; then
    cp "$config_example_path" "$config_path"
    printf 'Created configuration: %s\n' "$config_path"
  fi
}

docker_action() {
  local action="$1"
  initialize_config
  set -a
  # shellcheck disable=SC1090
  source "$config_path"
  set +a
  local data_dir="${SAGNEX_DATA_DIR:-./data}"
  local backup_dir="${SAGNEX_BACKUP_DIR:-./data/backups}"
  [[ "$data_dir" = /* ]] || data_dir="$root_dir/$data_dir"
  [[ "$backup_dir" = /* ]] || backup_dir="$root_dir/$backup_dir"
  mkdir -p "$data_dir" "$backup_dir"
  export SAGNEX_DOCKER_USER="${SAGNEX_DOCKER_USER:-$(id -u):$(id -g)}"
  command -v docker >/dev/null 2>&1 || { echo 'Docker was not found. Install Docker Engine and the Compose plugin.' >&2; exit 1; }

  case "$action" in
    build)
      "${compose[@]}" build
      echo 'Built Docker images: sagnex-api:local and sagnex-web:local'
      ;;
    start)
      "${compose[@]}" up -d --build --remove-orphans --wait
      printf 'Sagnex is running at http://%s\n' "$("${compose[@]}" port web 80)"
      ;;
    update)
      "${compose[@]}" build --pull
      "${compose[@]}" up -d --remove-orphans --wait
      printf 'Sagnex was updated and is running at http://%s\n' "$("${compose[@]}" port web 80)"
      ;;
    stop)
      "${compose[@]}" down --remove-orphans
      echo 'Sagnex stopped. Data was preserved.'
      ;;
    *) echo 'Usage: ./sagnex.sh docker <build|start|update|stop>' >&2; exit 1 ;;
  esac
}

native_action() {
  local action="$1"
  [[ "$action" =~ ^(start|update|stop)$ ]] || { echo 'Usage: ./sagnex.sh <start|update|stop>' >&2; exit 1; }
  command -v node >/dev/null 2>&1 || { echo 'Node.js was not found. Install Node.js 20 or newer.' >&2; exit 1; }
  local major_version
  major_version="$(node -p "process.versions.node.split('.')[0]")"
  (( major_version >= 20 )) || { echo 'Sagnex requires Node.js 20 or newer.' >&2; exit 1; }
  node "$root_dir/scripts/native-manager.mjs" "$action"
}

if [[ $# -eq 0 ]]; then
  native_action start
elif [[ "$1" == 'docker' ]]; then
  [[ $# -ge 2 ]] || { echo 'Usage: ./sagnex.sh docker <build|start|update|stop>' >&2; exit 1; }
  docker_action "$2"
else
  native_action "$1"
fi
