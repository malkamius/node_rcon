
# This script registers the ArkAdminPipeServer.ps1 as a scheduled task with admin rights
# It will self-elevate if not already running as admin

function Test-Administrator {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Host "Not running as administrator. Attempting to self-elevate..."
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    $psi.Verb = "runas"
    $psi.UseShellExecute = $true
    try {
        [System.Diagnostics.Process]::Start($psi) | Out-Null
        Write-Host "Re-launched as administrator. Exiting current instance."
        exit
    } catch {
        Write-Error "Failed to elevate: $($_.Exception.Message)"
        exit 1
    }
}

$taskName = "ArkAdminPipeServer"
$scriptPath = Join-Path $PSScriptRoot 'ArkAdminPipeServer.ps1'

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force

Write-Host "Scheduled task '$taskName' registered to run $scriptPath at startup with admin rights."
