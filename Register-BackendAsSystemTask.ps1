# Registers the ArkRcon backend as a SYSTEM scheduled task to run at startup.
# Usage: Run as administrator.


# Always use the dist folder for the backend working directory
$BackendDir = $PSScriptRoot

$taskName = "ArkRconBackend"
$logPath = Join-Path $PSScriptRoot 'ArkBackendTask.log'
$action = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "start *> `"$logPath`"" -WorkingDirectory $BackendDir
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit '00:00:00'
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Limited

# Remove existing task if present
Unregister-ScheduledTask -TaskPath "ArkServerManager" -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Register the new task
Register-ScheduledTask -TaskPath "ArkServerManager" -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force

# Start the task immediately
Start-ScheduledTask -TaskName $taskName -TaskPath "ArkServerManager"

Write-Host "Backend scheduled task registered and started as SYSTEM at startup."
