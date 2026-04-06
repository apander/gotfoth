# Configuration
$nasIP = "192.168.178.190"
# Note: Ensure 'Public' is the correct share name on your WD MyCloud
$nasPath = "\\$nasIP\gotfoth_data\pb_public\"

Write-Host "🚀 Deploying to Command Center at $nasIP..." -ForegroundColor Cyan

# Check if the NAS folder is accessible
if (Test-Path $nasPath) {
    Copy-Item "index.html" -Destination $nasPath -Force
    Copy-Item "app.js" -Destination $nasPath -Force
    Write-Host "✅ Files pushed successfully!" -ForegroundColor Green
    Write-Host "👉 Refresh browser with Ctrl+F5 now." -ForegroundColor Yellow
} else {
    Write-Host "❌ Error: Cannot reach $nasPath" -ForegroundColor Red
    Write-Host "1. Open File Explorer" -ForegroundColor White
    Write-Host "2. Paste this in the address bar: \\$nasIP" -ForegroundColor White
    Write-Host "3. Find the 'pb_public' folder and update the script path." -ForegroundColor White
}