# Registers the ArkAdminSocketServer.ps1 as a SYSTEM scheduled task and starts it immediately.

# Self-elevate if not running as admin
If (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Start-Process powershell "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$taskName = "ArkAdminSocketServer"
$taskPath = "\ArkServerManager\"
$ps1Path = Join-Path $PSScriptRoot 'ArkAdminSocketServer.ps1'
$trigger = New-ScheduledTaskTrigger -AtStartup

# Remove any existing task
Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false -ErrorAction SilentlyContinue

# Register new task under SYSTEM in ArkServerManager folder
Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Trigger $trigger -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1Path`"" ) -RunLevel Highest -User 'SYSTEM' -Force

# Start the task immediately
Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath

Write-Host "Registered and started ArkAdminSocketServer as SYSTEM under ArkServerManager."
