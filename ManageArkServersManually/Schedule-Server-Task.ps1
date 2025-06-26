# Requires PowerShell 5.1 or newer (for ScheduledTask module)
# This script creates a Windows Scheduled Task to launch an Ark Ascended Server on system boot.
# It is designed for non-interactive execution, requiring all parameters via command line.
# It handles privilege elevation.

#region --- Parameter Definition and Validation ---

[CmdletBinding(DefaultParameterSetName='Default')]
Param (
    [Parameter(HelpMessage="A unique name for your Ark Server. Used for task name and in-game session name.")]
    [string]$ServerName,

    [Parameter(HelpMessage="The FULL path to your Ark Ascended server's root directory (e.g., 'C:\ArkServers\MyPVE_Server').")]
    [string]$ServerRootDirectory,

    [Parameter(HelpMessage="The map name (e.g., 'TheIsland_WP', 'Svartalfheim_WP'). Default is 'TheIsland_WP'.")]
    [string]$MapName = 'TheIsland_WP',

    [Parameter(HelpMessage="The server's Query Port (e.g., '27015'). Default is '27015'.")]
    [int]$QueryPort = 27015,

    [Parameter(HelpMessage="The server's Game Port (e.g., '7777'). Default is '7777'.")]
    [int]$GamePort = 7777,

    [Parameter(HelpMessage="The maximum number of players (e.g., '10'). Default is '10'.")]
    [int]$MaxPlayers = 10,

    [Parameter(HelpMessage="The Server Admin Password (plain text string).")]
    [string]$AdminPasswordPlain, # Renamed to signify plain text input

    [Parameter(HelpMessage="The Server Password (plain text string, optional).")]
    [string]$ServerPasswordPlain, # Renamed to signify plain text input
    
    [Parameter(HelpMessage="Mods list to supply in command line arguments")]
    [string]$ModIDs,
    

    
    [Parameter(HelpMessage="Display this help message.")]
    [switch]$Help
)

#region --- Help Message Display ---
if ($Help -or ($PSBoundParameters.Count -lt 2)) {
    Write-Host "--- Help for Schedule-Server-Task.ps1 ---"
    Write-Host "Purpose: Creates a Windows Scheduled Task to launch an Ark Ascended Server on system boot."
    Write-Host "         Designed for non-interactive use, requiring all parameters via command line."
    Write-Host "         Requires Administrator privileges to create the task (will attempt elevation)."
    Write-Host ""
    Write-Host "Usage:   .\Schedule-Server-Task.ps1 -ServerName <string> -ServerRootDirectory <string>"
    Write-Host "                                 [-MapName <string>] [-QueryPort <int>] [-MaxPlayers <int>]"
    Write-Host "                                 [-GamePort <int>] [-AdminPasswordPlain <string>]"
    Write-Host "                                 [-ServerPasswordPlain <string>] [-Help]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -ServerName           [MANDATORY] A unique name for your Ark Server (e.g., 'My Ark Island')."
    Write-Host "                        Used for the task name and in-game session name."
    Write-Host "  -ServerRootDirectory  [MANDATORY] The FULL path to your Ark Ascended server's root directory"
    Write-Host "                        (e.g., 'C:\ArkServers\MyPVE_Server'). This is where the server instance's"
    Write-Host "                        'ShooterGame\Saved' folder is located."
    Write-Host "  -MapName              [OPTIONAL] The map name (e.g., 'TheIsland_WP', 'Svartalfheim_WP')."
    Write-Host "                        Default: 'TheIsland_WP'."
    Write-Host "  -QueryPort            [OPTIONAL] The server's Query Port (e.g., '27015')."
    Write-Host "                        Default: 27015. Must be unique per server on the same IP."
    Write-Host "  -GamePort             [OPTIONAL] The server's Game Port (e.g., '7777')."
    Write-Host "                        Default: 7777. Must be unique per server on the same IP."
    Write-Host "  -MaxPlayers           [OPTIONAL] The maximum number of players (e.g., '10')."
    Write-Host "                        Default: 10."
    Write-Host "  -AdminPasswordPlain   [OPTIONAL] The Server Admin Password (plain text string)."
    Write-Host "                        Recommended to instead configure this in the game ini files."
    Write-Host "  -ServerPasswordPlain  [OPTIONAL] The Server Password (plain text string)."
    Write-Host "                        Recommended to instead configure this in the game ini files."
    Write-Host "  -ModIDs               [OPTIONAL] Comma-separated list of mod IDs to be used for this instance."
    Write-Host "                        Must be surrounded by quotes if multiple IDs are provided."
    Write-Host "  -Help                 [OPTIONAL] Display this help message and exit."
    Write-Host ""
    Write-Host "Example:"
    Write-Host "  .\Schedule-Server-Task.ps1 -ServerName 'My Ark PVE' -ServerRootDirectory 'C:\ArkServers\PVE_Server' `
               -MapName 'TheIsland_WP' -QueryPort 27015 -MaxPlayers 30 -GamePort 7777 `
               -AdminPasswordPlain 'MyStrongAdminPass' -ServerPasswordPlain 'MyGamePass'"
    exit 0
}
#endregion
#region --- Helper Functions ---

function Test-ArkExecutablePath {
    [CmdletBinding()]
    Param (
        [Parameter(Mandatory=$true)]
        [string]$ServerRootDirectory
    )
    # Construct the expected path to the Ark Ascended server executable
    $arkExePath = Join-Path -Path $ServerRootDirectory -ChildPath "ShooterGame\Binaries\Win64\ArkAscendedServer.exe"
    if (-not (Test-Path $arkExePath)) {
        Write-Error "ArkAscendedServer.exe not found at: '$arkExePath'. Please ensure the 'Server Root Directory' is correct."
        return $null
    }
    return $arkExePath
}

function Test-Administrator {
    # Test if the current user is running with administrator privileges
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Elevate-Script {
    # Re-launches the current script with elevated privileges
    Param(
        [Parameter(Mandatory=$true)]
        [string]$ScriptPath,
        [Parameter(Mandatory=$true)]
        [string[]]$ScriptArguments
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

# Helper to convert plain string to SecureString
function ConvertTo-SecureStringEx {
    param(
        [Parameter(Mandatory=$true)]
        [string]$PlainText
    )
    $secureString = New-Object System.Security.SecureString
    $PlainText.ToCharArray() | ForEach-Object { $secureString.AppendChar($_) }
    $secureString.MakeReadOnly()
    return $secureString
}

#endregion
Write-Host "--- Ark Ascended Server Task Scheduler Setup (Non-Interactive) ---"
Write-Host "This script will create a scheduled task to launch your Ark Ascended Server on system boot."
Write-Host "Ensure all required parameters are provided via command line."
Write-Host ""

# Check for Administrator privileges and elevate if necessary
if (-not (Test-Administrator)) {
    Write-Warning "This script requires Administrator privileges to create scheduled tasks."
    Write-Warning "Attempting to re-launch with elevation via UAC."
    
    # Collect current arguments to pass to the elevated script
    # This ensures all provided arguments are preserved across elevation
    $currentArguments = $PSBoundParameters.GetEnumerator() | ForEach-Object {
        $argName = $_.Key
        $argValue = $_.Value
        
        # Quote arguments with spaces and handle different types
        if ($argValue -is [string] -and $argValue.Contains(' ')) {
            "`-$argName `"$argValue`""
        } elseif ($argValue -is [System.Collections.IEnumerable] -and $argValue -isnot [string]) {
            # Handle array parameters (though not used for Ark args here)
            "`-$argName `"$($argValue -join ',')`""
        } else {
            "`-$argName $argValue"
        }
    }

    Elevate-Script -ScriptPath $MyInvocation.MyCommand.Path -ScriptArguments $currentArguments
    # Script will exit after elevation attempt, so the code below only runs if already elevated.
}

Write-Host "Running with Administrator privileges."

# Validate inputs
if ([string]::IsNullOrWhiteSpace($ServerName)) {
    Write-Error "Parameter -ServerName is mandatory and cannot be empty. Exiting."
    exit 1
}
$TaskNameSuffix = $ServerName -replace "[^a-zA-Z0-9\s-]", "" # Remove special characters except alphanumeric, space, dash
$TaskName = "ArkServerManager\Ark Server $TaskNameSuffix"
$TaskDescription = "Launch Ark Server: $ServerName"

if (-not (Test-Path $ServerRootDirectory -PathType Container)) {
    Write-Error "The specified ServerRootDirectory '$ServerRootDirectory' does not exist or is not a folder. Exiting script."
    exit 1
}

$ArkExecutablePath = Test-ArkExecutablePath -ServerRootDirectory $ServerRootDirectory
if (-not $ArkExecutablePath) {
    Write-Error "Ark server executable not found. Exiting script." # Error handled by Test-ArkExecutablePath
    exit 1
}

if ($QueryPort -le 0) {
    Write-Error "Invalid -QueryPort value '$QueryPort'. Must be a positive integer. Exiting."
    exit 1
}
if ($MaxPlayers -le 0) {
    Write-Error "Invalid -MaxPlayers value '$MaxPlayers'. Must be a positive integer. Exiting."
    exit 1
}
if ($GamePort -le 0) {
    Write-Error "Invalid -GamePort value '$GamePort'. Must be a positive integer. Exiting."
    exit 1
}

# Convert plain text passwords to SecureString (for internal PowerShell use, not passed to Ark)
$SecureAdminPassword = if (-not [string]::IsNullOrWhiteSpace($AdminPasswordPlain)) {
    ConvertTo-SecureStringEx -PlainText $AdminPasswordPlain
} else {
    Write-Warning "No Server Admin Password provided. This is not recommended for a public server."
    New-Object System.Security.SecureString # Empty secure string
}

$SecureServerPassword = if (-not [string]::IsNullOrWhiteSpace($ServerPasswordPlain)) {
    ConvertTo-SecureStringEx -PlainText $ServerPasswordPlain
} else {
    New-Object System.Security.SecureString # Empty secure string
}

# Convert SecureString back to plain for Ark arguments (Ark doesn't take SecureString)
# ONLY do this at the point of argument construction, and minimize plaintext exposure.
$ServerAdminPasswordString = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureAdminPassword))
$ServerPasswordString = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureServerPassword))


# Construct the main arguments string for Ark server executable
# This carefully mimics the format from your XML, separating parameters with '?' and flags with spaces.
$CoreArguments = @(
    $MapName,
    "listen",
    "SessionName=`"$ServerName`"",
    "QueryPort=$QueryPort",
    "MaxPlayers=$MaxPlayers",
    "AllowCrateSpawnsOnTopOfStructures=True"
)
$ArkArguments = ($CoreArguments -join '?')

if (-not [string]::IsNullOrWhiteSpace($ServerAdminPasswordString)) {
    $ArkArguments += " ServerAdminPassword=$ServerAdminPasswordString"
}
if (-not [string]::IsNullOrWhiteSpace($ServerPasswordString)) {
    $ArkArguments += " ServerPassword=$ServerPasswordString"
}

$ArkArguments += " Port=$GamePort"
# These parameters assume your INI files will *not* contain them, or these will override them.
# If using the 'linked binaries' approach, this script assumes the INI files are in ServerRootDirectory\ShooterGame\Saved\Config\WindowsServer\
if (-not [string]::IsNullOrWhiteSpace($ModIDs))
{
    # Replace ", " with ","
    $ModIDs = $ModIDs -replace ", ", ","
    # Replace " " with ","
    $ModIDs = $ModIDs -replace " ", ","
    
    $ArkArguments += " -mods=" + $ModIDs
}

$ArkArguments += " -ForceAllowCaveFlyers -NoBattlEye -servergamelog -severgamelogincludetribelogs -ServerRCONOutputTribeLogs -NotifyAdminCommandsInChat -nosteamclient -game -server -log -crossplay -automanagedmods"


Write-Host "`n--- Final Task Configuration ---"
Write-Host "Task Name: '$TaskName'"
Write-Host "Description: '$TaskDescription'"
Write-Host "Command: '$ArkExecutablePath'"
Write-Host "Arguments: '$ArkArguments'"
Write-Host "Working Directory: '$ServerRootDirectory'"

#endregion





#region --- Task Creation Logic ---

try {
    # Check if the task already exists and remove it to allow recreation
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Write-Warning "An existing task named '$TaskName' was found. Deleting it to create a new one."
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        Start-Sleep -Seconds 1 # Give a moment for the system to unregister
    }

    # Define the action: run the Ark server executable with the specified arguments
    $Action = New-ScheduledTaskAction -Execute $ArkExecutablePath -Argument $ArkArguments -WorkingDirectory $ServerRootDirectory

    # Define the trigger: run at system startup
    $Trigger = New-ScheduledTaskTrigger -AtStartup



    # Define the settings for the scheduled task
    $Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew `
                                            -ExecutionTimeLimit ([TimeSpan]::FromSeconds(0)) `
                                            -Priority 7


    # Use SYSTEM account for the scheduled task principal
    $Principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    Write-Host "`n--- Registering Scheduled Task ---"
    Write-Host "Register-ScheduledTask -TaskName `"$TaskName`" -Description `"$TaskDescription`" -Action `$Action -Trigger `$Trigger -Principal `$Principal -Settings `$Settings -Force"
    # Register the scheduled task
    Register-ScheduledTask -TaskName $TaskName `
                           -Description $TaskDescription `
                           -Action $Action `
                           -Trigger $Trigger `
                           -Principal $Principal `
                           -Settings $Settings `
                           -Force

    Write-Host "`nSUCCESS: Scheduled task '$TaskName' has been created successfully!"
    Write-Host "The Ark server will now attempt to start automatically when your computer boots."

} catch {
    Write-Error "An error occurred while creating the scheduled task: $($_.Exception.Message)"
    Write-Error "Ensure all arguments are correct and that the script is run with Administrator privileges."
    exit 1
}

#endregion
