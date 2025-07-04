param(
    [Parameter(Mandatory=$true)]
    [string]$installDir
)

# Define the URL for SteamCMD
$steamcmdUrl = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
# Define the path for the downloaded zip file
$zipFile = Join-Path $installDir "steamcmd.zip"

Write-Host "Starting SteamCMD download and installation..."

# Create the installation directory if it doesn't exist
if (-not (Test-Path $installDir)) {
    Write-Host "Creating directory: $installDir"
    New-Item -ItemType Directory -Path $installDir | Out-Null
} else {
    Write-Host "Directory '$installDir' already exists."
}

# Download the SteamCMD zip file
Write-Host "Downloading SteamCMD from $steamcmdUrl to $zipFile..."
try {
    Invoke-WebRequest -Uri $steamcmdUrl -OutFile $zipFile -ErrorAction Stop
    Write-Host "Download complete."
} catch {
    Write-Error "Failed to download SteamCMD. Error: $($_.Exception.Message)"
    exit 1
}

# Expand the zip file
Write-Host "Extracting SteamCMD to $installDir..."
try {
    Expand-Archive -Path $zipFile -DestinationPath $installDir -Force
    Write-Host "Extraction complete."
} catch {
    Write-Error "Failed to extract SteamCMD. Error: $($_.Exception.Message)"
    exit 1
}

# Clean up the zip file
Write-Host "Removing temporary zip file: $zipFile"
try {
    Remove-Item $zipFile -Force
    Write-Host "Cleanup complete."
} catch {
    Write-Warning "Failed to remove temporary zip file. Error: $($_.Exception.Message)"
}

Write-Host "SteamCMD has been successfully downloaded and extracted to $installDir"
Write-Host "You can now run steamcmd.exe from this folder."

# Optional: Add SteamCMD to system PATH (uncomment if desired)
# Write-Host "Adding SteamCMD to system PATH..."
# $env:Path += ";$installDir"
# [Environment]::SetEnvironmentVariable("Path", $env:Path, [EnvironmentVariableTarget]::Machine)
# Write-Host "SteamCMD added to system PATH. You may need to restart your terminal for changes to take effe