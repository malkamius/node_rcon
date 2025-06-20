function Test-Administrator {
    # Test if the current user is running with administrator privileges
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Elevate-Script {
    # Re-launches the current script with elevated privileges
    Param(
        [Parameter(Mandatory=$true)]
        [string]$ScriptPath
    )

    Write-Host "Attempting to elevate script privileges..."
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = "powershell.exe"
    # Ensure all arguments are properly quoted for the re-launch
    $processInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" " + ($ScriptArguments -join ' ')
    $processInfo.Verb = "runas" # This triggers the UAC prompt
    $processInfo.UseShellExecute = $true

    try {
        [System.Diagnostics.Process]::Start($processInfo) | Out-Null
        Write-Host "Script re-launched with elevated privileges. Exiting current non-elevated instance."
        exit # Exit the non-elevated script
    }
    catch {
        Write-Error "Failed to elevate privileges. Error: $($_.Exception.Message)"
        Write-Error "Please ensure your Node.js process or user has rights to trigger UAC elevation."
        exit 1
    }
}

function New-AdminUser {
    param (
        [Parameter(Mandatory=$true)]
        [System.Security.SecureString]$Password # Use SecureString for password parameter
    )
	$Username = "Node.RCON"
	$Description = "User for Node.RCON Manager"
    # 1. Create the new local user
    Write-Host "Attempting to create user '$Username'..."
    try {
        New-LocalUser -Name $Username -Password $Password -Description $Description -ErrorAction Stop
        Write-Host "User '$Username' created successfully."
    }
    catch {
        Write-Host "Error creating user '$Username': $($_.Exception.Message)" -ForegroundColor Red
        return # Exit the function if user creation fails
    }

    # 2. Add the new user to the Administrators group
    Write-Host "Attempting to add user '$Username' to the Administrators group..."
    try {
        Add-LocalGroupMember -Group "Administrators" -Member $Username -ErrorAction Stop
        Write-Host "User '$Username' added to the Administrators group successfully."
    }
    catch {
        Write-Host "Error adding user '$Username' to Administrators group: $($_.Exception.Message)" -ForegroundColor Red
    }
}
if (-not (Test-Administrator)) {
    Write-Warning "This script requires Administrator privileges."
    Write-Warning "Attempting to re-launch with elevation via UAC."
    Elevate-Script -ScriptPath $MyInvocation.MyCommand.Path
}
else
{
	Write-Host "Please enter a passord for the Node.RCON admin user."
	$securePassword = Read-Host -AsSecureString # This prompts for the password securely

	New-AdminUser -Password $securePassword
	Read-Host
}