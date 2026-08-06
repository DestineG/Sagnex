$ErrorActionPreference = 'Stop'

$composeFile = Join-Path $PSScriptRoot 'compose.yaml'
$composeArgs = @('compose', '--project-directory', $PSScriptRoot, '-f', $composeFile)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker was not found. Install Docker Desktop and ensure docker is on PATH.'
}

& docker @composeArgs version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is unavailable.' }

& docker @composeArgs up -d --build --remove-orphans --wait
if ($LASTEXITCODE -ne 0) { throw 'Sagnex failed to start.' }

$binding = & docker @composeArgs port web 80
Write-Host "Sagnex is running at http://$binding"
