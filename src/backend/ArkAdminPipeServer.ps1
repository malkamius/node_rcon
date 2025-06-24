# This script should be run as a scheduled task with 'Run with highest privileges'.
# It listens on a named pipe for commands and only executes whitelisted scripts.


$PipeName = "ArkAdminPipe"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Is-Whitelisted($cmd) {
    $base = [System.IO.Path]::GetFileName($cmd)
    $fullPath = Join-Path $RootDir $base
    return (Test-Path $fullPath -PathType Leaf)
}

$server = New-Object System.IO.Pipes.NamedPipeServerStream(
    $PipeName,
    [System.IO.Pipes.PipeDirection]::InOut,
    1,
    [System.IO.Pipes.PipeTransmissionMode]::Byte,
    [System.IO.Pipes.PipeOptions]::Asynchronous
)

Write-Host "[ArkAdminPipe] Admin pipe server started. Waiting for commands..."

while ($true) {
    $server.WaitForConnection()
    $reader = New-Object System.IO.StreamReader($server)
    $writer = New-Object System.IO.StreamWriter($server)
    $writer.AutoFlush = $true

    try {
        $cmd = $reader.ReadLine()
        Write-Host "[ArkAdminPipe] Received command: $cmd"
        if (Is-Whitelisted $cmd) {
            Write-Host "[ArkAdminPipe] Command is whitelisted. Executing..."
            $output = powershell -NoProfile -ExecutionPolicy Bypass -File $cmd 2>&1
            $writer.WriteLine($output)
        } else {
            Write-Host "[ArkAdminPipe] Command is NOT whitelisted!"
            $writer.WriteLine("ERROR: Command not allowed.")
        }
    } catch {
        $writer.WriteLine("ERROR: $_")
    } finally {
        $writer.Close()
        $reader.Close()
        $server.Disconnect()
    }
}
