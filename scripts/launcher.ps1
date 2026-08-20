$ErrorActionPreference = 'Stop'

$rootDirectory = Split-Path -Parent $PSScriptRoot
$configDirectory = Join-Path $rootDirectory 'config'
$configPath = Join-Path $configDirectory 'sagnex.env'
$configExamplePath = Join-Path $configDirectory 'sagnex.env.example'
$composeFile = Join-Path $rootDirectory 'docker\compose.yaml'

function Copy-DefaultConfig {
  New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
  Copy-Item -LiteralPath $configExamplePath -Destination $configPath -Force
  Write-Host "Created configuration: $configPath"
}

function Test-InteractiveInput {
  try { return -not [Console]::IsInputRedirected } catch { return $true }
}

function Invoke-ConfigAction {
  if (-not (Test-Path -LiteralPath $configPath)) { Copy-DefaultConfig; return }
  if (-not (Test-InteractiveInput)) { Write-Host "Configuration already exists and was not replaced: $configPath"; return }
  $answer = Read-Host 'Configuration already exists. Replace it with the template? Existing settings will be lost. [y/N]'
  if ($answer -match '^[Yy]$') { Copy-DefaultConfig } else { Write-Host "Configuration was not changed: $configPath" }
}

function Confirm-ConfigForStart {
  if (Test-Path -LiteralPath $configPath) { return $true }
  if (-not (Test-InteractiveInput)) { Write-Host 'Configuration is missing. Run sagnex.cmd config before starting.'; return $false }
  $answer = Read-Host 'No local configuration was found. Create it from the template and continue? [y/N]'
  if ($answer -notmatch '^[Yy]$') { Write-Host 'Startup cancelled.'; return $false }
  Copy-DefaultConfig
  return $true
}

function Read-Config {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $configPath -Encoding utf8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $separator = $trimmed.IndexOf('=')
    if ($separator -le 0) { continue }
    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }
  return $values
}

function Resolve-ProjectPath([string]$value, [string]$fallback) {
  if (-not $value) { $value = $fallback }
  if ([System.IO.Path]::IsPathRooted($value)) { return [System.IO.Path]::GetFullPath($value) }
  return [System.IO.Path]::GetFullPath((Join-Path $rootDirectory $value))
}

function Set-ComposeEnvironment([hashtable]$config) {
  $publicHost = $config['SAGNEX_PUBLIC_HOST']
  if (-not $publicHost -or $publicHost -eq 'sagnex.example.com') { throw 'Set SAGNEX_PUBLIC_HOST to a public domain or IP address in config/sagnex.env.' }
  if ($publicHost -match '://|/|:|\s') { throw 'SAGNEX_PUBLIC_HOST must contain only a domain name or IPv4 address, without scheme, port, path, or whitespace.' }
  $env:SAGNEX_PUBLIC_HOST = $publicHost
  $env:SAGNEX_DATA_DIR = Resolve-ProjectPath $config['SAGNEX_DATA_DIR'] './data'
  $env:SAGNEX_BACKUP_DIR = Resolve-ProjectPath $config['SAGNEX_BACKUP_DIR'] './data/backups'
  $env:SAGNEX_CADDY_DATA_DIR = Resolve-ProjectPath $config['SAGNEX_CADDY_DATA_DIR'] './data/caddy'
  $env:SAGNEX_CADDY_CONFIG_DIR = Resolve-ProjectPath $config['SAGNEX_CADDY_CONFIG_DIR'] './data/caddy-config'
  New-Item -ItemType Directory -Path $env:SAGNEX_DATA_DIR, $env:SAGNEX_BACKUP_DIR, $env:SAGNEX_CADDY_DATA_DIR, $env:SAGNEX_CADDY_CONFIG_DIR -Force | Out-Null
}

function Invoke-Compose([string[]]$arguments) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker was not found. Install Docker Desktop and ensure docker is on PATH.' }
  $environmentFile = if (Test-Path -LiteralPath $configPath) { $configPath } else { $configExamplePath }
  & docker compose --project-directory $rootDirectory --env-file $environmentFile -f $composeFile @arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($arguments -join ' ') failed." }
}

function Invoke-Action([string]$action) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker was not found. Install Docker Desktop and ensure docker is on PATH.' }
  if ($action -in @('start', 'update')) {
    if (-not (Confirm-ConfigForStart)) { exit 1 }
    Set-ComposeEnvironment (Read-Config)
  }
  switch ($action) {
    'start' {
      Invoke-Compose @('up', '-d', '--build', '--remove-orphans', '--wait')
      $binding = (& docker compose --project-directory $rootDirectory --env-file $configPath -f $composeFile port caddy 80)
      Write-Host "LAN: http://$binding"
      Write-Host "Public: https://$env:SAGNEX_PUBLIC_HOST"
    }
    'update' {
      Invoke-Compose @('pull', 'caddy')
      Invoke-Compose @('build', '--pull')
      Invoke-Compose @('up', '-d', '--remove-orphans', '--wait')
      Write-Host "Sagnex was updated. Public: https://$env:SAGNEX_PUBLIC_HOST"
    }
    'stop' { Invoke-Compose @('down', '--remove-orphans'); Write-Host 'Sagnex stopped. Data and certificates were preserved.' }
    default { throw 'Usage: sagnex.cmd <config|start|update|stop>' }
  }
}

$arguments = @($args)
if ($arguments.Count -ne 1) { throw 'Usage: sagnex.cmd <config|start|update|stop>' }
if ($arguments[0] -eq 'config') { Invoke-ConfigAction } else { Invoke-Action $arguments[0] }
