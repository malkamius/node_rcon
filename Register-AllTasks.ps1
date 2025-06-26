# Registers both backend and admin socket server as SYSTEM scheduled tasks, requesting elevation if needed.
# Usage: This script is intended to be called from npm (postinstall) and will self-elevate if not run as admin.

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Host "Requesting elevation..."
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    $psi.Verb = 'runas'
    $psi.UseShellExecute = $true
    [System.Diagnostics.Process]::Start($psi) | Out-Null
    exit 0
}

Write-Host "Running as administrator. Registering scheduled tasks..."

# Register backend as SYSTEM
$backendScript = Join-Path $PSScriptRoot '..\Register-BackendAsSystemTask.ps1'
if (Test-Path $backendScript) {
    Write-Host "Registering backend task..."
    & $backendScript
} else {
    Write-Warning "Backend registration script not found: $backendScript"
}

# Register admin socket server as SYSTEM
$adminScript = Join-Path $PSScriptRoot 'src\backend\Register-ArkAdminSocketServerTask.ps1'
if (Test-Path $adminScript) {
    Write-Host "Registering admin socket server task..."
    & $adminScript
} else {
    Write-Warning "Admin socket server registration script not found: $adminScript"
}

Write-Host "All registration scripts complete."
