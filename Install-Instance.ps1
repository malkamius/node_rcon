# Requires PowerShell 5.1 or newer
# This script creates an Ark Ascended server instance directory and sets up junctions/symlinks
# to shared base server files. It handles privilege elevation.

#region --- Parameter Definition and Validation ---

[CmdletBinding(DefaultParameterSetName='Default')]
Param (
    [Parameter(HelpMessage="The FULL path to the base Ark Ascended server files (e.g., 'C:\ArkASA_SharedFiles').")]
    [string]$BaseServerInstallDirectory,

    [Parameter(HelpMessage="The FULL path where this new server instance will be created (e.g., 'C:\ArkServers\MyPVE_Server').")]
    [string]$InstanceDirectory,

    [Parameter(HelpMessage="Specify 'SymbolicLink' to use symbolic links instead of junctions. Required for cross-drive linking.")]
    [ValidateSet('Junction', 'SymbolicLink')]
    [string]$LinkType = 'Junction', # Default to Junction, can be overridden to SymbolicLink

    [Parameter(HelpMessage="Display this help message.")]
    [switch]$Help
)

#region --- Help Message Display ---
if ($Help -or ($PSBoundParameters.Count -lt 2)) {
    Write-Host "--- Help for InstallInstance.ps1 ---"
    Write-Host "Purpose: Creates a new Ark Ascended server instance directory and sets up junctions/symbolic links"
    Write-Host "         to the shared base server files. It automatically discovers files and directories to link,"
    Write-Host "         excluding 'ShooterGame' and 'ShooterGame\Saved' which are managed uniquely per instance."
    Write-Host "         This allows multiple server instances to share core game files while having independent"
    Write-Host "         save data and configurations. Requires Administrator privileges to create links (will attempt elevation)."
    Write-Host ""
    Write-Host "Usage:   .\InstallInstance.ps1 -BaseServerInstallDirectory <string> -InstanceDirectory <string>"
    Write-Host "                                      [-LinkType <Junction|SymbolicLink>] [-Help]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -BaseServerInstallDirectory  [MANDATORY] The FULL path to the base Ark Ascended server files"
    Write-Host "                               (e.g., 'C:\ArkASA_SharedFiles'). This is the source for the shared binaries."
    Write-Host "  -InstanceDirectory           [MANDATORY] The FULL path where this new server instance will be created"
    Write-Host "                               (e.g., 'C:\ArkServers\MyPVE_Server'). This directory will contain the"
    Write-Host "                               instance's unique save data and configurations, with links to shared files."
    Write-Host "  -LinkType                    [OPTIONAL] Specifies the type of link to create:"
    Write-Host "                                 'Junction' (default): Preferred for linking directories on the same drive."
    Write-Host "                                 'SymbolicLink': Required for linking across different drives. Also allows"
    Write-Host "                                   linking to network paths. Will be automatically chosen if drives differ."
    Write-Host "  -Help                        [OPTIONAL] Display this help message and exit."
    Write-Host ""
    Write-Host "Example:"
    Write-Host "  .\InstallInstance.ps1 -BaseServerInstallDirectory 'C:\ArkASA_SharedFiles' `
               -InstanceDirectory 'D:\ArkInstances\MyNewPVP' -LinkType SymbolicLink"
    Write-Host "  .\InstallInstance.ps1 -BaseServerInstallDirectory 'C:\ArkASA_SharedFiles' `
               -InstanceDirectory 'C:\ArkInstances\MyNewPVE'"
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



Write-Host "--- Ark Ascended Server Instance Creator (Automated Linking) ---"
Write-Host "This script creates a new server instance and automatically links shared files and directories."
Write-Host "Ensure all required parameters are provided via command line."
Write-Host ""

# Check for Administrator privileges
# Symbolic links and Junctions require Administrator privileges
if (-not (Test-Administrator)) {
    Write-Warning "This script requires Administrator privileges to create junctions or symbolic links."
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

Write-Host "Running with Administrator privileges."

# Validate inputs
if (-not (Test-Path $BaseServerInstallDirectory -PathType Container)) {
    Write-Error "The specified BaseServerInstallDirectory '$BaseServerInstallDirectory' does not exist or is not a folder. Exiting script."
    exit 1
}
if ((Test-Path $BaseServerInstallDirectory -PathType Leaf)) {
    Write-Error "The specified BaseServerInstallDirectory '$BaseServerInstallDirectory' is a file, not a directory. Exiting script."
    exit 1
}
if (-not (Test-Path "$BaseServerInstallDirectory\ShooterGame\Binaries\Win64\ArkAscendedServer.exe")) {
    Write-Error "ArkAscendedServer.exe not found in the base installation directory '$BaseServerInstallDirectory'. Please ensure the base server is fully installed. Exiting."
    exit 1
}

# Create the instance directory if it doesn't exist
if (-not (Test-Path $InstanceDirectory)) {
    Write-Host "Creating instance directory: $InstanceDirectory"
    try {
        New-Item -ItemType Directory -Path $InstanceDirectory -Force | Out-Null
    } catch {
        Write-Error "Failed to create directory '$InstanceDirectory'. Error: $($_.Exception.Message). Exiting."
        exit 1
    }
} elseif ((Test-Path $InstanceDirectory -PathType Leaf)) {
    Write-Error "The specified InstanceDirectory '$InstanceDirectory' is a file, not a directory. Exiting script."
    exit 1
}

# Create necessary instance-specific subdirectories (these are NOT linked, they are unique per instance)
Write-Host "Creating unique save and config directories for instance..."
$instanceShooterGamePath = Join-Path $InstanceDirectory "ShooterGame"
$instanceSavedPath = Join-Path $instanceShooterGamePath "Saved"

try {
    # Ensure the instance-specific ShooterGame and Saved directories exist (these are NOT linked)
    # The ShooterGame directory itself is created here as a parent for instance-specific and linked sub-items.
    New-Item -ItemType Directory -Path $instanceShooterGamePath -Force | Out-Null
    New-Item -ItemType Directory -Path $instanceSavedPath -Force | Out-Null

    New-Item -ItemType Directory -Path "$instanceSavedPath\Config\WindowsServer" -Force | Out-Null
    New-Item -ItemType Directory -Path "$instanceSavedPath\Logs" -Force | Out-Null
    New-Item -ItemType Directory -Path "$instanceSavedPath\SavedArks" -Force | Out-Null
} catch {
    Write-Error "Failed to create required instance subdirectories. Error: $($_.Exception.Message). Exiting."
    exit 1
}

# Determine mklink command based on LinkType
$mklinkCommand = "mklink"
if ($LinkType -eq 'Junction') {
    $mklinkOptionForDirectories = "/J" # Specific option for directories
    Write-Host "Using Directory Junctions for linking (preferred for same-drive linking)."
} elseif ($LinkType -eq 'SymbolicLink') {
    $mklinkOptionForDirectories = "/D" # Specific option for directories
    Write-Host "Using Symbolic Links for linking (required for cross-drive linking)."
} else {
    Write-Error "Invalid LinkType specified: '$LinkType'. Must be 'Junction' or 'SymbolicLink'. Exiting."
    exit 1
}

# Check if target and source are on different drives if LinkType is Junction (which doesn't support it)
if ($LinkType -eq 'Junction') {
    # Ensure paths are treated as full paths to correctly get drive letter
    $resolvedBaseServerInstallDirectory = (Get-Item $BaseServerInstallDirectory).FullName
    $resolvedInstanceDirectory = (Get-Item $InstanceDirectory).FullName

    $baseDrive = (Split-Path $resolvedBaseServerInstallDirectory -Qualifier)
    $instanceDrive = (Split-Path $resolvedInstanceDirectory -Qualifier)
    
    if ($baseDrive -ne $instanceDrive) {
        Write-Warning "Base server directory ('$baseDrive') and instance directory ('$instanceDrive') are on different drives."
        Write-Warning "Junctions ('/J') cannot link across drives. Switching to Symbolic Links ('/D')."
        $mklinkOptionForDirectories = "/D"
        $LinkType = 'SymbolicLink' # Update internal state for logging
    }
}

#endregion

#region --- Dynamic Link Collection Logic ---
Write-Host "Discovering files and directories to link..."

$linksToCreate = @() # Initialize an empty array for dynamic links

# Define directories/files to EXCLUDE from automatic linking at their respective levels
# ShooterGame and ShooterGame\Saved are specifically managed as instance-specific directories.
$excludeFromRoot = @("ShooterGame")
$excludeFromShooterGame = @("Saved")

# --- Process items in BaseServerInstallDirectory ---
Get-ChildItem -Path $BaseServerInstallDirectory -Force | ForEach-Object {
    $item = $_
    # Skip excluded items at the root level
    if ($excludeFromRoot -contains $item.Name) {
        return # Skip this item (e.g., "ShooterGame")
    }

    $sourcePath = $item.FullName
    $targetPath = Join-Path $InstanceDirectory $item.Name
    $linkName = $item.Name

    $currentLinkType = if ($item.PSIsContainer) { "Directory" } else { "File" }

    $linksToCreate += @{ Target = $targetPath; Source = $sourcePath; Name = $linkName; LinkType = $currentLinkType }
}

# --- Process items in BaseServerInstallDirectory\ShooterGame ---
$baseShooterGamePath = Join-Path $BaseServerInstallDirectory "ShooterGame"
if (Test-Path $baseShooterGamePath -PathType Container) { # Ensure ShooterGame exists in base
    Get-ChildItem -Path $baseShooterGamePath -Force | ForEach-Object {
        $item = $_
        # Skip excluded items within ShooterGame
        if ($excludeFromShooterGame -contains $item.Name) {
            return # Skip this item (e.g., "Saved")
        }

        $sourcePath = $item.FullName
        # CORRECTED: Use Join-Path correctly for nested paths
        $targetPath = Join-Path $instanceShooterGamePath $item.Name 
        $linkName = "ShooterGame\" + $item.Name # For descriptive logging

        $currentLinkType = if ($item.PSIsContainer) { "Directory" } else { "File" }

        $linksToCreate += @{ Target = $targetPath; Source = $sourcePath; Name = $linkName; LinkType = $currentLinkType }
    }
} else {
    Write-Warning "Base ShooterGame directory '$baseShooterGamePath' not found. No sub-items will be linked from there."
}

#endregion

#region --- Link Creation Logic ---
foreach ($link in $linksToCreate) {
    # Determine the mklink option based on whether it's a file or directory link
    $currentMklinkOption = "" # Default for files and initial state
    if ($link.LinkType -eq 'Directory') {
        $currentMklinkOption = $mklinkOptionForDirectories # Use the determined option for directories
        Write-Host "Creating $LinkType for DIRECTORY '$($link.Name)' from '$($link.Source)' to '$($link.Target)'..."
    } else { # LinkType is "File" (Symbolic Link for files does not use /J or /D)
        Write-Host "Creating Symbolic Link for FILE '$($link.Name)' from '$($link.Source)' to '$($link.Target)'..."
    }

    # Ensure the target directory exists for file links
    # For file links, the parent directory must exist for mklink to succeed.
    if ($link.LinkType -eq 'File') {
        $parentTargetDir = Split-Path -Path $link.Target -Parent
        if (-not (Test-Path $parentTargetDir)) {
            Write-Host "Creating parent directory for file link: $parentTargetDir"
            try {
                New-Item -ItemType Directory -Path $parentTargetDir -Force | Out-Null
            } catch {
                Write-Error "Failed to create parent directory '$parentTargetDir'. Error: $($_.Exception.Message). Exiting."
                exit 1
            }
        }
    }

    # Check if the target link already exists before attempting to create it
    if (Test-Path $link.Target -PathType Leaf -ErrorAction SilentlyContinue) {
        Write-Warning "File link '$($link.Name)' already exists at '$($link.Target)'. Skipping creation."
        continue # Skip to the next link
    } elseif (Test-Path $link.Target -PathType Container -ErrorAction SilentlyContinue) {
        Write-Warning "Directory link/junction '$($link.Name)' already exists at '$($link.Target)'. Skipping creation."
        continue # Skip to the next link
    }
    
    try {
        # mklink always takes target path first then source path
        $command = "$mklinkCommand $currentMklinkOption `"$($link.Target)`" `"$($link.Source)`""
        
        & cmd.exe /c $command
        Write-Host "Successfully created $($link.LinkType) link for '$($link.Name)'."
    } catch {
        Write-Error "Failed to create $($link.LinkType) link for '$($link.Name)': $($_.Exception.Message)"
        Write-Error "Command executed: $command"
        exit 1
    }
}

Write-Host "`nSUCCESS: Ark Ascended server instance created successfully at '$InstanceDirectory'!"
Write-Host "Unique config files are located in: '$InstanceDirectory\ShooterGame\Saved\Config\WindowsServer'"
Write-Host "Remember to copy Game.ini and GameUserSettings.ini from the base server's"
Write-Host "ShooterGame\Saved\Config\WindowsServer directory into this new instance's config folder"
Write-Host "and then modify them for this instance's unique settings."

#endregion
