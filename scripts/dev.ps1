# Start the API (new window) and the Next.js dev server (this window).
$root = Split-Path -Parent $PSScriptRoot

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn signallab.main:app --reload --port 8000"
)

Set-Location "$root\frontend"
Write-Host "API -> http://localhost:8000/docs   UI -> http://localhost:3000" -ForegroundColor Cyan
npm run dev
