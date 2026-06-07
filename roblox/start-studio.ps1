$studio = Get-ChildItem -Path "$env:LOCALAPPDATA\Roblox\Versions" -Recurse -Filter RobloxStudioBeta.exe -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $studio) {
  Write-Error "RobloxStudioBeta.exe was not found under $env:LOCALAPPDATA\Roblox\Versions."
  exit 1
}

Start-Process -FilePath $studio.FullName

