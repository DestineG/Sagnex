$ErrorActionPreference = 'Stop'

$rootDirectory = Split-Path -Parent $PSScriptRoot
$configDirectory = Join-Path $rootDirectory 'config'
$configPath = Join-Path $configDirectory 'sagnex.env'
$configExamplePath = Join-Path $configDirectory 'sagnex.env.example'
$caddyfilePath = Join-Path $configDirectory 'Caddyfile'
$caddyfileExamplePath = Join-Path $configDirectory 'Caddyfile.example'
$composeFile = Join-Path $rootDirectory 'docker\compose.yaml'

function Copy-DefaultConfig {
  New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
  Copy-Item -LiteralPath $configExamplePath -Destination $configPath -Force
  Copy-Item -LiteralPath $caddyfileExamplePath -Destination $caddyfilePath -Force
  Write-Host "Created configuration: $configPath"
}

function Ensure-Caddyfile {
  if (-not (Test-Path -LiteralPath $caddyfilePath)) {
    Copy-Item -LiteralPath $caddyfileExamplePath -Destination $caddyfilePath
    Write-Host "Created Caddy configuration: $caddyfilePath"
  }
}

function Test-InteractiveInput {
  try { return -not [Console]::IsInputRedirected } catch { return $true }
}

function Invoke-ConfigAction {
  if (-not (Test-Path -LiteralPath $configPath)) {
    Copy-DefaultConfig
    return
  }
  Ensure-Caddyfile
  if (-not (Test-InteractiveInput)) {
    Write-Host "Configuration already exists and was not replaced: $configPath"
    return
  }
  $answer = Read-Host 'Configuration already exists. Replace it with the template? Existing settings will be lost. [y/N]'
  if ($answer -match '^[Yy]$') {
    Copy-DefaultConfig
  } else {
    Write-Host "Configuration was not changed: $configPath"
  }
}

function Confirm-ConfigForStart {
  if (Test-Path -LiteralPath $configPath) { Ensure-Caddyfile; return $true }
  if (-not (Test-InteractiveInput)) {
    Write-Host 'Configuration is missing. Run sagnex.cmd config before starting.'
    return $false
  }
  $answer = Read-Host 'No local configuration was found. Create it from the template and continue? [y/N]'
  if ($answer -notmatch '^[Yy]$') {
    Write-Host 'Startup cancelled.'
    return $false
  }
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

function Invoke-Compose([string[]]$arguments) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker was not found. Install Docker Desktop and ensure docker is on PATH.'
  }
  $environmentFile = if (Test-Path -LiteralPath $configPath) { $configPath } else { $configExamplePath }
  $composeArgs = @('compose', '--project-directory', $rootDirectory, '--env-file', $environmentFile, '-f', $composeFile)
  & docker @composeArgs @arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($arguments -join ' ') failed." }
}

function Invoke-DockerAction([string]$action) {
  if ($action -in @('start', 'update')) {
    if (-not (Confirm-ConfigForStart)) { exit 1 }
    $config = Read-Config
    $dataDirectory = Resolve-ProjectPath $config['SAGNEX_DATA_DIR'] './data'
    $backupDirectory = Resolve-ProjectPath $config['SAGNEX_BACKUP_DIR'] './data/backups'
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
    $env:SAGNEX_DATA_DIR = $dataDirectory
    $env:SAGNEX_BACKUP_DIR = $backupDirectory
  }

  switch ($action) {
    'start' {
      Invoke-Compose @('up', '-d', '--build', '--remove-orphans', '--wait')
      $binding = (& docker compose --project-directory $rootDirectory --env-file $configPath -f $composeFile port caddy 80)
      Write-Host "Sagnex is running at http://$binding (LAN)"
    }
    'update' {
      Invoke-Compose @('build', '--pull')
      Invoke-Compose @('up', '-d', '--remove-orphans', '--wait')
      $binding = (& docker compose --project-directory $rootDirectory --env-file $configPath -f $composeFile port caddy 80)
      Write-Host "Sagnex was updated and is running at http://$binding (LAN)"
    }
    'stop' {
      Invoke-Compose @('down', '--remove-orphans')
      Write-Host 'Sagnex stopped. Data was preserved.'
    }
    default { throw 'Usage: sagnex.cmd [docker] <start|update|stop>' }
  }
}

function Invoke-NativeAction([string]$action) {
  if ($action -notin @('start', 'update', 'stop')) {
    throw 'Usage: sagnex.cmd <config|start|update|stop> or sagnex.cmd docker <start|update|stop>'
  }
  if ($action -in @('start', 'update')) {
    if (-not (Confirm-ConfigForStart)) { exit 1 }
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found. Install Node.js 20 or newer.'
  }
  $majorVersion = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
  if ($majorVersion -lt 20) { throw 'Sagnex requires Node.js 20 or newer.' }
  & node (Join-Path $PSScriptRoot 'native-manager.mjs') $action
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$arguments = @($args)
if ($arguments.Count -eq 0) {
  Invoke-NativeAction 'start'
} elseif ($arguments[0] -eq 'config') {
  Invoke-ConfigAction
} elseif ($arguments[0] -eq 'docker') {
  if ($arguments.Count -lt 2) { throw 'Usage: sagnex.cmd docker <start|update|stop>' }
  Invoke-DockerAction $arguments[1]
} else {
  Invoke-NativeAction $arguments[0]
}
