# Registers the ArkAdminSocketServer.ps1 as a SYSTEM scheduled task and starts it immediately.

# Self-elevate if not running as admin
If (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Start-Process powershell "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$taskName = "ArkAdminSocketServer"
$taskPath = "\ArkServerManager\"
$ps1Path = Join-Path $PSScriptRoot 'ArkAdminSocketServer.ps1'
$workingDir = Split-Path $ps1Path
$logPath = Join-Path $PSScriptRoot 'ArkAdminSocketServer.log'
$elevatedDir = Join-Path $PSScriptRoot 'elevated'
$workingDir = $elevatedDir
$logPath = Join-Path $elevatedDir 'elevated-service.log'
$taskAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c npm start > `$logPath` 2>&1" -WorkingDirectory $workingDir
$taskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit '00:00:00'
$trigger = New-ScheduledTaskTrigger -AtStartup

# Remove any existing task
Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false -ErrorAction SilentlyContinue

# Register new task under SYSTEM in ArkServerManager folder
Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Trigger $trigger -Action $taskAction -Settings $taskSettings -RunLevel Highest -User 'SYSTEM' -Force

# Start the task immediately
Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath

Write-Host "Registered and started ArkAdminSocketServer as SYSTEM under ArkServerManager."
