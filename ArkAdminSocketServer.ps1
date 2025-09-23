# This script should be run as a scheduled task with 'Run with highest privileges'.
# It listens on a TCP socket for commands and only executes whitelisted scripts.


$Port = 12345
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $RootDir 'config.json'


# Load approved script hashes from config.json, or initialize if missing/empty
$ApprovedHashes = @()
$configContent = $null
if (Test-Path $ConfigPath) {
    try {
        $configContent = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        if ($configContent.approvedScriptHashes) {
            $ApprovedHashes = $configContent.approvedScriptHashes
        }
    } catch {
        Write-Warning "Could not read approvedScriptHashes from config.json. No scripts will be allowed."
    }
} else {
    Write-Warning "config.json not found. No scripts will be allowed."
}

# If no hashes, prompt admin to select scripts to approve and update config.json
if (-not $ApprovedHashes -or $ApprovedHashes.Count -eq 0) {
    Write-Host "No approvedScriptHashes found in config.json."
    $scriptFiles = Get-ChildItem -Path $RootDir -Filter '*.ps1' -File | Select-Object -ExpandProperty Name
    if ($scriptFiles.Count -eq 0) {
        Write-Warning "No PowerShell scripts found in $RootDir to approve."
    } else {
        Write-Host "Available scripts to approve:"
        $scriptFiles | ForEach-Object { Write-Host "  $_" }
        #$toApprove = Read-Host "Enter comma-separated script names to approve (or 'all' for all)"
        $toApprove = 'all'
        if ($toApprove -eq 'all') {
            $approveList = $scriptFiles
        } else {
            $approveList = $toApprove -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' -and $scriptFiles -contains $_ }
        }
        $newHashes = @()
        foreach ($script in $approveList) {
            $fullPath = Join-Path $RootDir $script
            if (Test-Path $fullPath -PathType Leaf) {
                $hash = (Get-FileHash -Path $fullPath -Algorithm SHA256).Hash.ToLower()
                $newHashes += $hash
                Write-Host "Approved $script with hash $hash"
            }
        }
        if ($newHashes.Count -gt 0) {
            if (-not $configContent) {
                $configContent = [PSCustomObject]@{}
            }
            if (-not ($configContent.PSObject.Properties["approvedScriptHashes"])) {
                $configContent | Add-Member -MemberType NoteProperty -Name approvedScriptHashes -Value $newHashes
            } else {
                $configContent.approvedScriptHashes = $newHashes
            }
            # Save as UTF-8 without BOM so we don't need to strip the byte order mark with nodejs
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($ConfigPath, ($configContent | ConvertTo-Json -Depth 10), $utf8NoBom)
            $ApprovedHashes = $newHashes
            Write-Host "Updated config.json with approved script hashes."
        } else {
            Write-Warning "No scripts approved. No scripts will be allowed."
        }
    }
}

function Is-Whitelisted($cmd) {
    $base = [System.IO.Path]::GetFileName($cmd)
    $fullPath = Join-Path $RootDir $base
    if (-not (Test-Path $fullPath -PathType Leaf)) {
        return $false
    }
    try {
        $hash = (Get-FileHash -Path $fullPath -Algorithm SHA256).Hash.ToLower()
        return $ApprovedHashes -contains $hash
    } catch {
        Write-Warning "Failed to hash {$fullPath}: $_"
        return $false
    }
}

try {

    $listener = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    Write-Host "[ArkAdminSocket] Admin socket server started. Waiting for connections on port {$Port}..."
}
catch {
    Write-Error "[ArkAdminSocket] Failed to start listener on port {$Port}: $_"
    exit 1
}
while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
    $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::UTF8)
    $writer.AutoFlush = $true
    try {
        $line = $reader.ReadLine()
        Write-Host "[ArkAdminSocket] Received: $line"
        $parsed = $null
        try {
            $parsed = $line | ConvertFrom-Json
        } catch {
            $parsed = $null
        }
        if ($parsed -and $parsed.PSObject.Properties["script"]) {
            $cmd = $parsed.script
            $args = $parsed.args
            if (-not $args) { $args = @() }
            Write-Host "[ArkAdminSocket] Parsed script: $cmd, args: $($args -join ', ')"
        } else {
            $cmd = $line
            $args = @()
        }
        if (Is-Whitelisted $cmd) {
            Write-Host "[ArkAdminSocket] Command is whitelisted. Executing..."
            # Pass arguments as an array so each is a separate parameter
            $output = powershell -NoProfile -ExecutionPolicy Bypass -File $cmd @args 2>&1
            Write-Host "[ArkAdminSocket] Command output: $output"
            $writer.WriteLine($output)
        } else {
            Write-Host "[ArkAdminSocket] Command is NOT whitelisted!"
            $writer.WriteLine("ERROR: Command not allowed.")
        }
    } catch {
        $writer.WriteLine("ERROR: $_")
    } finally {
        $writer.Close()
        $reader.Close()
        $client.Close()
    }
}
