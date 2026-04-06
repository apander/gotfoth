# Deploy static Study Vault UI + Google Calendar sync script to WD My Cloud share.
# Run from repo root, or from anywhere: paths resolve to this script's directory.

$repoRoot = $PSScriptRoot
$nasIP = "192.168.178.190"
# Static files served to the browser (PocketBase public / your web root)
$nasPath = "\\$nasIP\gotfoth_data\pb_public\"
# Sync script — NOT under pb_public (avoid exposing .py via HTTP)
$nasScriptsPath = "\\$nasIP\gotfoth_data\scripts\"

Write-Host "Deploying to NAS at $nasIP..." -ForegroundColor Cyan

if (-not (Test-Path $nasPath)) {
    Write-Host "Error: Cannot reach $nasPath" -ForegroundColor Red
    Write-Host "1. Open File Explorer" -ForegroundColor White
    Write-Host "2. Paste in the address bar: \\$nasIP" -ForegroundColor White
    Write-Host "3. Confirm gotfoth_data\pb_public exists (or update paths in deploy.ps1)." -ForegroundColor White
    exit 1
}

Copy-Item (Join-Path $repoRoot "index.html") -Destination $nasPath -Force
Copy-Item (Join-Path $repoRoot "js") -Destination $nasPath -Recurse -Force
Write-Host "Static UI: index.html + js -> $nasPath" -ForegroundColor Green

$syncSrc = Join-Path $repoRoot "sync_google_ics.py"
if (Test-Path $syncSrc) {
    if (-not (Test-Path $nasScriptsPath)) {
        New-Item -ItemType Directory -Path $nasScriptsPath -Force | Out-Null
        Write-Host "Created folder: $nasScriptsPath" -ForegroundColor Yellow
    }
    Copy-Item $syncSrc -Destination $nasScriptsPath -Force
    Write-Host "Calendar sync: sync_google_ics.py -> $nasScriptsPath" -ForegroundColor Green
} else {
    Write-Host "Warning: sync_google_ics.py not found next to deploy.ps1; skipped." -ForegroundColor Yellow
}

Write-Host "Done. Hard-refresh the browser (Ctrl+F5)." -ForegroundColor Yellow
Write-Host "Calendar automation: see GOOGLE_CALENDAR_SYNC.md" -ForegroundColor Cyan
