$ErrorActionPreference = 'Stop'

$composeFile = Join-Path $PSScriptRoot 'compose.yaml'
$composeArgs = @('compose', '--project-directory', $PSScriptRoot, '-f', $composeFile)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker was not found. Install Docker Desktop and ensure docker is on PATH.'
}

& docker @composeArgs down --remove-orphans
if ($LASTEXITCODE -ne 0) { throw 'Sagnex failed to stop.' }

Write-Host 'Sagnex stopped. Database and backup files were preserved.'
