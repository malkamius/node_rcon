# This script should be run as a scheduled task with 'Run with highest privileges'.
# It listens on a TCP socket for commands and only executes whitelisted scripts.

$Port = 12345
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Is-Whitelisted($cmd) {
    $base = [System.IO.Path]::GetFileName($cmd)
    $fullPath = Join-Path $RootDir $base
    return (Test-Path $fullPath -PathType Leaf)
}

$listener = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "[ArkAdminSocket] Admin socket server started. Waiting for connections on port $Port..."

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
            $argString = ($args | ForEach-Object { '"' + ($_ -replace '"', '""') + '"' }) -join ' '
            $output = powershell -NoProfile -ExecutionPolicy Bypass -File $cmd $argString 2>&1
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
