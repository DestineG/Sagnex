$ErrorActionPreference = 'Stop'

$composeFile = Join-Path $PSScriptRoot 'compose.yaml'
$composeArgs = @('compose', '--project-directory', $PSScriptRoot, '-f', $composeFile)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker was not found. Install Docker Desktop and ensure docker is on PATH.'
}

& docker @composeArgs build --pull
if ($LASTEXITCODE -ne 0) { throw 'Sagnex image update failed.' }

& docker @composeArgs up -d --remove-orphans --wait
if ($LASTEXITCODE -ne 0) { throw 'Sagnex failed to restart.' }

$binding = & docker @composeArgs port web 80
Write-Host "Sagnex was updated and is running at http://$binding"
