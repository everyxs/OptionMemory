# One-click start: mnestic memory engine in Mem (in-memory, non-persistent) mode.
# Serves the CozoScript HTTP endpoint and an interactive REPL. Default port 9070.
# Usage: powershell -File scripts/mnestic_start.ps1 [-Port 9071]
param([int]$Port = 9070)
$ErrorActionPreference = "Stop"

$Root      = Split-Path -Parent $PSScriptRoot          # optionmemory-materials/
$Workspace = Split-Path -Parent $Root                  # workspace root
$TargetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $Workspace "target" }
$Exe       = Join-Path $TargetDir "debug\mnestic-mem-adapter.exe"

if (-not (Test-Path $Exe)) {
    Write-Host "[mnestic_start] binary not found - building (offline, shared target)..."
    $env:CARGO_TARGET_DIR = $TargetDir
    cargo build --offline --manifest-path (Join-Path $Root "server\Cargo.toml")
}

Write-Host "[mnestic_start] starting mnestic engine=mem port $Port"
& $Exe --port $Port
