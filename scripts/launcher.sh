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
  if [[ "$answer" =~ ^[Yy]$ ]]; then copy_default_config; else printf 'Configuration was not changed: %s\n' "$config_path"; fi
}

confirm_config_for_start() {
  [[ -f "$config_path" ]] && return 0
  if [[ ! -t 0 ]]; then
    echo 'Configuration is missing. Run ./sagnex.sh config before starting.' >&2
    return 1
  fi
  local answer
  read -r -p 'No local configuration was found. Create it from the template and continue? [y/N] ' answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then echo 'Startup cancelled.'; return 1; fi
  copy_default_config
}

read_config_value() {
  local key="$1"
  local line value
  line="$(sed -n -E "s/^[[:space:]]*${key}[[:space:]]*=(.*)$/\1/p" "$config_path" | tail -n 1)"
  value="${line#"${line%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] || [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "$value"
}

validate_public_host() {
  local host="$1"
  if [[ -z "$host" || "$host" == 'sagnex.example.com' ]]; then
    echo 'Set SAGNEX_PUBLIC_HOST to a public domain or IP address in config/sagnex.env.' >&2
    return 1
  fi
  if [[ "$host" == *://* || "$host" == */* || "$host" == *:* || "$host" =~ [[:space:]] ]]; then
    echo 'SAGNEX_PUBLIC_HOST must contain only a domain name or IPv4 address, without scheme, port, path, or whitespace.' >&2
    return 1
  fi
}

prepare_directories() {
  local data_dir backup_dir caddy_data_dir caddy_config_dir docker_user
  data_dir="$(read_config_value SAGNEX_DATA_DIR)"; data_dir="${data_dir:-./data}"
  backup_dir="$(read_config_value SAGNEX_BACKUP_DIR)"; backup_dir="${backup_dir:-./data/backups}"
  caddy_data_dir="$(read_config_value SAGNEX_CADDY_DATA_DIR)"; caddy_data_dir="${caddy_data_dir:-./data/caddy}"
  caddy_config_dir="$(read_config_value SAGNEX_CADDY_CONFIG_DIR)"; caddy_config_dir="${caddy_config_dir:-./data/caddy-config}"
  docker_user="$(read_config_value SAGNEX_DOCKER_USER)"
  [[ "$data_dir" = /* ]] || data_dir="$root_dir/$data_dir"
  [[ "$backup_dir" = /* ]] || backup_dir="$root_dir/$backup_dir"
  [[ "$caddy_data_dir" = /* ]] || caddy_data_dir="$root_dir/$caddy_data_dir"
  [[ "$caddy_config_dir" = /* ]] || caddy_config_dir="$root_dir/$caddy_config_dir"
  mkdir -p "$data_dir" "$backup_dir" "$caddy_data_dir" "$caddy_config_dir"
  export SAGNEX_DATA_DIR="$data_dir"
  export SAGNEX_BACKUP_DIR="$backup_dir"
  export SAGNEX_CADDY_DATA_DIR="$caddy_data_dir"
  export SAGNEX_CADDY_CONFIG_DIR="$caddy_config_dir"
  export SAGNEX_DOCKER_USER="${docker_user:-$(id -u):$(id -g)}"
}

compose_command() {
  local environment_file="$config_example_path"
  [[ -f "$config_path" ]] && environment_file="$config_path"
  docker compose --project-directory "$root_dir" --env-file "$environment_file" -f "$root_dir/docker/compose.yaml" "$@"
}

reload_caddy() {
  compose_command exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}

run_action() {
  local action="$1"
  command -v docker >/dev/null 2>&1 || { echo 'Docker was not found. Install Docker Engine and the Compose plugin.' >&2; exit 1; }
  if [[ "$action" == 'start' || "$action" == 'update' ]]; then
    confirm_config_for_start || exit 1
    SAGNEX_PUBLIC_HOST="$(read_config_value SAGNEX_PUBLIC_HOST)"
    export SAGNEX_PUBLIC_HOST
    validate_public_host "$SAGNEX_PUBLIC_HOST" || exit 1
    prepare_directories
  fi
  case "$action" in
    start)
      compose_command up -d --build --remove-orphans --wait
      reload_caddy
      printf 'LAN: http://%s\n' "$(compose_command port caddy 80)"
      printf 'Public: https://%s\n' "$SAGNEX_PUBLIC_HOST"
      ;;
    update)
      compose_command build
      compose_command up -d --remove-orphans --wait
      reload_caddy
      printf 'Sagnex was updated. Public: https://%s\n' "$SAGNEX_PUBLIC_HOST"
      ;;
    stop)
      compose_command down --remove-orphans
      echo 'Sagnex stopped. Data and certificates were preserved.'
      ;;
    *) echo 'Usage: ./sagnex.sh <config|start|update|stop>' >&2; exit 1 ;;
  esac
}

if [[ $# -ne 1 ]]; then echo 'Usage: ./sagnex.sh <config|start|update|stop>' >&2; exit 1; fi
if [[ "$1" == 'config' ]]; then config_action; else run_action "$1"; fi
