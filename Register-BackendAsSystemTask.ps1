# Registers the ArkRcon backend as a SYSTEM scheduled task to run at startup.
# Usage: Run as administrator.


# Always use the dist folder for the backend working directory
$BackendDir = $PSScriptRoot

$taskName = "ArkRconBackend"
$action = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "start" -WorkingDirectory $BackendDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Limited

# Remove existing task if present
Unregister-ScheduledTask -TaskPath "ArkServerManager" -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Register the new task
Register-ScheduledTask -TaskPath "ArkServerManager" -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal

# Start the task immediately
Start-ScheduledTask -TaskName $taskName -TaskPath "ArkServerManager"

Write-Host "Backend scheduled task registered and started as SYSTEM at startup."
