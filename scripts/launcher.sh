#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
config_dir="$root_dir/config"
config_path="$config_dir/sagnex.env"
config_example_path="$config_dir/sagnex.env.example"

copy_default_config() {
  mkdir -p "$config_dir"
  cp "$config_example_path" "$config_path"
  printf 'Created configuration: %s\n' "$config_path"
}

config_action() {
  if [[ ! -f "$config_path" ]]; then
    copy_default_config
    return
  fi
  if [[ ! -t 0 ]]; then
    printf 'Configuration already exists and was not replaced: %s\n' "$config_path"
    return
  fi
  local answer
  read -r -p 'Configuration already exists. Replace it with the template? Existing settings will be lost. [y/N] ' answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    copy_default_config
  else
    printf 'Configuration was not changed: %s\n' "$config_path"
  fi
}

confirm_config_for_start() {
  [[ -f "$config_path" ]] && return 0
  if [[ ! -t 0 ]]; then
    echo 'Configuration is missing. Run ./sagnex.sh config before starting.' >&2
    return 1
  fi
  local answer
  read -r -p 'No local configuration was found. Create it from the template and continue? [y/N] ' answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo 'Startup cancelled.'
    return 1
  fi
  copy_default_config
}

compose_command() {
  local environment_file="$config_example_path"
  [[ -f "$config_path" ]] && environment_file="$config_path"
  docker compose --project-directory "$root_dir" --env-file "$environment_file" -f "$root_dir/docker/compose.yaml" "$@"
}

docker_action() {
  local action="$1"
  if [[ "$action" == 'start' || "$action" == 'update' ]]; then
    confirm_config_for_start || exit 1
    set -a
    # shellcheck disable=SC1090
    source "$config_path"
    set +a
    local data_dir="${SAGNEX_DATA_DIR:-./data}"
    local backup_dir="${SAGNEX_BACKUP_DIR:-./data/backups}"
    [[ "$data_dir" = /* ]] || data_dir="$root_dir/$data_dir"
    [[ "$backup_dir" = /* ]] || backup_dir="$root_dir/$backup_dir"
    mkdir -p "$data_dir" "$backup_dir"
    export SAGNEX_DATA_DIR="$data_dir"
    export SAGNEX_BACKUP_DIR="$backup_dir"
    export SAGNEX_DOCKER_USER="${SAGNEX_DOCKER_USER:-$(id -u):$(id -g)}"
  fi
  command -v docker >/dev/null 2>&1 || { echo 'Docker was not found. Install Docker Engine and the Compose plugin.' >&2; exit 1; }

  case "$action" in
    start)
      compose_command up -d --build --remove-orphans --wait
      printf 'Sagnex is running at http://%s\n' "$(compose_command port web 80)"
      ;;
    update)
      compose_command build --pull
      compose_command up -d --remove-orphans --wait
      printf 'Sagnex was updated and is running at http://%s\n' "$(compose_command port web 80)"
      ;;
    stop)
      compose_command down --remove-orphans
      echo 'Sagnex stopped. Data was preserved.'
      ;;
    *) echo 'Usage: ./sagnex.sh [docker] <start|update|stop>' >&2; exit 1 ;;
  esac
}

native_action() {
  local action="$1"
  [[ "$action" =~ ^(start|update|stop)$ ]] || { echo 'Usage: ./sagnex.sh [docker] <start|update|stop>' >&2; exit 1; }
  if [[ "$action" == 'start' || "$action" == 'update' ]]; then
    confirm_config_for_start || exit 1
  fi
  command -v node >/dev/null 2>&1 || { echo 'Node.js was not found. Install Node.js 20 or newer.' >&2; exit 1; }
  local major_version
  major_version="$(node -p "process.versions.node.split('.')[0]")"
  (( major_version >= 20 )) || { echo 'Sagnex requires Node.js 20 or newer.' >&2; exit 1; }
  node "$root_dir/scripts/native-manager.mjs" "$action"
}

if [[ $# -eq 0 ]]; then
  native_action start
elif [[ "$1" == 'config' ]]; then
  config_action
elif [[ "$1" == 'docker' ]]; then
  [[ $# -ge 2 ]] || { echo 'Usage: ./sagnex.sh docker <start|update|stop>' >&2; exit 1; }
  docker_action "$2"
else
  native_action "$1"
fi
