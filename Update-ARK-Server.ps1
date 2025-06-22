# Requires PowerShell 5.1 or newer
# This script updates the Ark Ascended Dedicated Server files using SteamCMD.
# It is designed for non-interactive execution, requiring the ServerInstallDirectory as a parameter.

[CmdletBinding()]
Param (
    [Parameter(HelpMessage="The FULL path to the central Ark Ascended server installation directory (e.g., 'C:\ArkASA_SharedFiles').")]
    [string]$ServerInstallDirectory,

    [Parameter(HelpMessage="The full path to SteamCMD.exe (e.g., 'C:\steamcmd\steamcmd.exe'). If not provided, script will try to find it in PATH.")]
    [string]$SteamCmdPath,

    [Parameter(HelpMessage="Display this help message.")]
    [switch]$Help
)

#region --- Help Message Display ---
if ($Help -or ($PSBoundParameters.Count -lt 2)) {
    Write-Host "--- Help for Update-ARK-Server.ps1 ---"
    Write-Host "Purpose: Updates the Ark Ascended Dedicated Server files using SteamCMD."
    Write-Host "         Designed for non-interactive use."
    Write-Host ""
    Write-Host "Usage:   .\Update-ARK-Server.ps1 -ServerInstallDirectory <string> [-SteamCmdPath <string>] [-Help]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -ServerInstallDirectory  [MANDATORY] The FULL path to the central Ark Ascended server installation"
    Write-Host "                           directory (e.g., 'C:\ArkASA_SharedFiles'). This is the directory where the"
    Write-Host "                           base game files are stored."
    Write-Host "  -SteamCmdPath            [OPTIONAL] The full path to SteamCMD.exe (e.g., 'C:\steamcmd\steamcmd.exe')."
    Write-Host "                           If not provided, the script will attempt to find 'steamcmd.exe' in your system's PATH."
    Write-Host "  -Help                    [OPTIONAL] Display this help message and exit."
    Write-Host ""
    Write-Host "Example:"
    Write-Host "  .\Update-ARK-Server.ps1 -ServerInstallDirectory 'C:\ArkASA_SharedFiles' -SteamCmdPath 'D:\Games\steamcmd\steamcmd.exe'"
    Write-Host "  .\Update-ARK-Server.ps1 -ServerInstallDirectory 'C:\ArkASA_SharedFiles'"
    exit 0
}
#endregion

$appId = "2430930" # Ark: Survival Ascended Dedicated Server App ID

Write-Host "--- Ark Ascended Server Updater (Non-Interactive) ---"
Write-Host "This script will download or update the Ark Ascended Dedicated Server files."
Write-Host "Ensure all required parameters are provided via command line."
Write-Host ""

# Find SteamCMD.exe if not provided as argument
if ([string]::IsNullOrWhiteSpace($SteamCmdPath)) {
    $steamCmdInfo = Get-Command steamcmd.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path
    if (-not $steamCmdInfo) {
        Write-Error "SteamCMD.exe not found in your system's PATH. Please provide its full path using -SteamCmdPath parameter. Exiting script."
        exit 1
    }
    $SteamCmdPath = $steamCmdInfo
} elseif (-not (Test-Path $SteamCmdPath -PathType Leaf)) {
    Write-Error "SteamCMD.exe not found at the specified path '$SteamCmdPath'. Exiting script."
    exit 1
}

# Validate ServerInstallDirectory
if (-not ([string]::IsNullOrWhiteSpace($ServerInstallDirectory))) {
    # It's okay if the directory doesn't exist yet, SteamCMD will create it.
    # Just ensure it's not a file path if it exists.
    if ((Test-Path $ServerInstallDirectory -PathType Leaf -ErrorAction SilentlyContinue)) {
        Write-Error "The specified ServerInstallDirectory '$ServerInstallDirectory' is a file, not a directory. Exiting script."
        exit 1
    }
} else {
    Write-Error "Parameter -ServerInstallDirectory is mandatory and cannot be empty. Exiting script."
    exit 1
}

Write-Host "Downloading/Updating ARK: Survival Ascended Dedicated Server to: $ServerInstallDirectory"
Write-Host "Using SteamCMD from: $SteamCmdPath"
Write-Host ""

# Construct SteamCMD command
$steamCmdArguments = @(
    "+force_install_dir `"$ServerInstallDirectory`"", # Quote directory in case of spaces
    "+login anonymous",
    "+app_update $appId validate",
    "+quit"
)

# Execute SteamCMD
try {
    # Use Invoke-Expression or & operator to run the external executable
    # The & operator is generally preferred for clarity and security.
    Write-Host "Running command: `"$SteamCmdPath`" $($steamCmdArguments -join ' ')"
    & "$SteamCmdPath" $steamCmdArguments
    
    # Check last exit code (optional, SteamCMD output is usually enough)
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "SteamCMD process completed with exit code $LASTEXITCODE. Review SteamCMD output above for errors."
    }

    Write-Host "`nSUCCESS: ARK: Survival Ascended Dedicated Server download/update process complete."
    Write-Host "Server files are located in: $ServerInstallDirectory"

} catch {
    Write-Error "An unexpected error occurred during the SteamCMD update process: $($_.Exception.Message)"
    exit 1
}
