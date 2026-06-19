# Start the four TrialSync Band agents, each in its own PowerShell window.
# Usage:  .\scripts\start_agents.ps1
#
# Requires uv on PATH and a populated .env at the repo root. Agents show OFFLINE
# in the Band UI until these processes are running.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

$uv = (Get-Command uv -ErrorAction SilentlyContinue)
if (-not $uv) { $env:Path = "$HOME\.local\bin;$env:Path" }

$agents = @("intake", "discoverer", "parser", "analyzer")
foreach ($a in $agents) {
    Write-Host "Launching agent: $a"
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "Set-Location '$repo'; if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { `$env:Path = '$HOME\.local\bin;' + `$env:Path }; uv run python -m trialsync.agents.$a"
    )
    Start-Sleep -Seconds 1
}
Write-Host ""
Write-Host "All four agents launched in separate windows."
Write-Host "Then run:  uv run trialsync match-agents P001"
