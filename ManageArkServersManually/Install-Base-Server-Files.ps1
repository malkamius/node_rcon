# Requires PowerShell 5.1 or newer
# This script installs the base Ark Survival Ascended Dedicated Server files using SteamCMD.
# It is designed for non-interactive execution, requiring all parameters via command line.

#region --- Parameter Definition and Validation ---

[CmdletBinding(DefaultParameterSetName='Default')]
Param (
    [Parameter(HelpMessage="The FULL path where the base Ark Ascended server files will be installed (e.g., 'C:\ArkASA_SharedFiles').")]
    [string]$BaseServerInstallDirectory,

    [Parameter(HelpMessage="The FULL path to SteamCMD.exe (e.g., 'C:\steamcmd\steamcmd.exe').")]
    [string]$SteamCmdPath,

    [Parameter(HelpMessage="The steam AppID")]
    [string]$appId="2430930", # ARK Survival Ascended dedicated server
    
    [Parameter(HelpMessage="Display this help message.")]
    [switch]$Help
)

#endregion

#region --- Help Message Display ---
# Display help if -Help switch is present or if no arguments were passed
if ($Help -or ($PSBoundParameters.Count -lt 2)) {
    Write-Host "--- Help for Install-Base-Server-Files.ps1 ---"
    Write-Host "Purpose: Installs or updates the base Ark Survival Ascended Dedicated Server files using SteamCMD."
    Write-Host "         Designed for non-interactive use, requiring all parameters via command line."
    Write-Host "         It is recommended to run this script with Administrator privileges."
    Write-Host ""
    Write-Host "Usage:   .\Install-Base-Server-Files.ps1 -BaseServerInstallDirectory <string> -SteamCmdPath <string> [-Help]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -BaseServerInstallDirectory  [OPTIONAL] The FULL path where the base Ark Ascended server files"
    Write-Host "                               will be installed (e.g., 'C:\ArkASA_SharedFiles'). This is the"
    Write-Host "                               central location for shared game files."
    Write-Host "                               (Mandatory for actual installation)"
    Write-Host "  -SteamCmdPath                [OPTIONAL] The FULL path to SteamCMD.exe (e.g., 'C:\steamcmd\steamcmd.exe')."
    Write-Host "                               This executable is required to download the server files."
    Write-Host "                               (Mandatory for actual installation)"
    Write-Host "  -Help                        [OPTIONAL] Display this help message and exit."
    Write-Host ""
    Write-Host "Example:"
    Write-Host "  .\Install-Base-Server-Files.ps1 -BaseServerInstallDirectory 'C:\ArkASA_SharedFiles' "
    Write-Host "              -SteamCmdPath 'C:\steamcmd\steamcmd.exe'"
    Write-Host ""
    Write-Host "To display this help, run:   .\Install-Base-Server-Files.ps1 -Help"
    Write-Host "Or just run without parameters: .\Install-Base-Server-Files.ps1"
    exit 0
}
#endregion

#region --- Helper Functions ---

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

#endregion


Write-Host "--- Ark Ascended Base Server Installer (Non-Interactive) ---"
Write-Host "This script will install the base Ark Ascended Dedicated Server files using SteamCMD."
Write-Host "Ensure all required parameters are provided via command line."
Write-Host ""

# Check for Administrator privileges and elevate if necessary (SteamCMD itself doesn't strictly need it,
# but it's good practice for consistency if other scripts like link creation need it.)
if (-not (Test-Administrator)) {
    Write-Warning "This script recommends Administrator privileges for consistent operation."
    Write-Warning "Attempting to re-launch with elevation via UAC."
    
    # Collect current arguments to pass to the elevated script
    $currentArguments = $PSBoundParameters.GetEnumerator() | ForEach-Object {
        $argName = $_.Key
        $argValue = $_.Value
        if ($argValue -is [string] -and $argValue.Contains(' ')) {
            "`-$argName `"$argValue`""
        } else {
            "`-$argName $argValue"
        }
    }
    Elevate-Script -ScriptPath $MyInvocation.MyCommand.Path -ScriptArguments $currentArguments
}

Write-Host "Running with Administrator privileges." # Or confirmation that elevation was not needed.

# Validate inputs - These are now checked after the help display logic
if ([string]::IsNullOrWhiteSpace($BaseServerInstallDirectory)) {
    Write-Error "Parameter -BaseServerInstallDirectory is mandatory for installation and cannot be empty. Exiting."
    exit 1
}
if ([string]::IsNullOrWhiteSpace($SteamCmdPath) -or -not (Test-Path $SteamCmdPath -PathType Leaf)) {
    Write-Error "Parameter -SteamCmdPath is mandatory for installation and must point to an existing SteamCMD.exe file. Exiting."
    exit 1
}

# Create the base installation directory if it doesn't exist
if (-not (Test-Path $BaseServerInstallDirectory)) {
    Write-Host "Creating base installation directory: $BaseServerInstallDirectory"
    try {
        New-Item -ItemType Directory -Path $BaseServerInstallDirectory -Force | Out-Null
    } catch {
        Write-Error "Failed to create directory '$BaseServerInstallDirectory'. Error: $($_.Exception.Message). Exiting."
        exit 1
    }
} elseif ((Test-Path $BaseServerInstallDirectory -PathType Leaf)) {
    Write-Error "The specified BaseServerInstallDirectory '$BaseServerInstallDirectory' is a file, not a directory. Exiting script."
    exit 1
}


Write-Host "Installing/Updating ARK: Survival Ascended Dedicated Server to: $BaseServerInstallDirectory"
Write-Host "Using SteamCMD from: $SteamCmdPath"
Write-Host ""

#region --- SteamCMD Execution Logic ---

# Construct SteamCMD command
$steamCmdArguments = @(
    "+force_install_dir `"$BaseServerInstallDirectory`"", # Quote directory in case of spaces
    "+login anonymous",
    "+app_update $appId validate", # Add validate for integrity check
    "+quit"
)

# Execute SteamCMD
try {
    Write-Host "Running command: `"$SteamCmdPath`" $($steamCmdArguments -join ' ')"
    & "$SteamCmdPath" $steamCmdArguments
    
    # Check last exit code (optional, SteamCMD output is usually enough)
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "SteamCMD process completed with exit code $LASTEXITCODE. Review SteamCMD output above for errors."
    }

    Write-Host "`nSUCCESS: ARK: Survival Ascended Base Server installation/update process complete."
    Write-Host "Base server files are located in: $BaseServerInstallDirectory"

} catch {
    Write-Error "An unexpected error occurred during the SteamCMD installation process: $($_.Exception.Message)"
    exit 1
}

#endregion
