# Download Stockfish for ChessScope (Windows x64)
$ErrorActionPreference = "Stop"
$outDir = Join-Path $PSScriptRoot "..\src-tauri\binaries"
$outFile = Join-Path $outDir "stockfish.exe"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (Test-Path $outFile) {
    Write-Host "Stockfish already exists at $outFile"
    exit 0
}

Write-Host "Downloading Stockfish..."
$url = "https://github.com/official-stockfish/Stockfish/releases/download/sf_17.1/stockfish-windows-x86-64-avx2.zip"
$zip = Join-Path $env:TEMP "stockfish.zip"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force
$exe = Get-ChildItem -Path $env:TEMP -Recurse -Filter "stockfish*.exe" | Select-Object -First 1
if (-not $exe) { throw "stockfish.exe not found in archive" }
Copy-Item $exe.FullName $outFile -Force
Write-Host "Installed Stockfish to $outFile"
