# ChessScope build helper — sets up MSVC + Rust environment on Windows
$ErrorActionPreference = "Stop"

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
    $env:Path = "$cargoBin;$env:Path"
}

$vcvarsCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
)

$vcvars = $vcvarsCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $vcvars) {
    Write-Host "ERROR: Visual Studio C++ build tools not found." -ForegroundColor Red
    Write-Host "Install 'Desktop development with C++' via Visual Studio Installer, then retry."
    exit 1
}

Write-Host "Using: $vcvars" -ForegroundColor Cyan

$projectRoot = Split-Path $PSScriptRoot -Parent
$cmd = "call `"$vcvars`" && cd /d `"$projectRoot`" && npm run tauri dev"
cmd.exe /c $cmd
