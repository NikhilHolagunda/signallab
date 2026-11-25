# One-time setup on Windows: .env, Python venv + deps, npm deps.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
    Copy-Item "$root\.env.example" "$root\.env"
    Write-Host "Created .env from .env.example"
}

Write-Host "`n==> Backend (Python venv + requirements)" -ForegroundColor Cyan
Push-Location "$root\backend"
if (-not (Test-Path ".venv")) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
Pop-Location

Write-Host "`n==> Frontend (npm install)" -ForegroundColor Cyan
Push-Location "$root\frontend"
npm install
Pop-Location

Write-Host "`nDone. Next: ollama pull llama3.1:8b ; .\scripts\dev.ps1" -ForegroundColor Green
