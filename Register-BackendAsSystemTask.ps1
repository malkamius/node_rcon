# Registers the ArkRcon backend as a SYSTEM scheduled task to run at startup.
# Usage: Run as administrator.

param(
    [string]$BackendDir = (Join-Path $PSScriptRoot '..\..')
)

$taskName = "ArkRconBackend"
$action = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "start" -WorkingDirectory $BackendDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel LeastPrivilege

# Remove existing task if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Register the new task
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal

Write-Host "Backend scheduled task registered to run as SYSTEM at startup."
