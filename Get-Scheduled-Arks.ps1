Param([string]$PipeName)
# Define a common pipe name prefix
$Global:PipeNamePrefix = "MyElevatedPipe_"

# Function to test for Administrator privileges
function Test-Administrator {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# --- Determine if running elevated ---
$IsElevated = Test-Administrator

if ($IsElevated -and [string]::IsNullOrWhiteSpace($PipeName)) {
    # --- SCRIPT ALREADY ELEVATED (Direct Execution) ---
    Write-Host "Script is already running with Administrator privileges. Skipping pipe communication and running directly."

    try {
        Write-Host "Getting scheduled tasks from \ArkServerManager\..."
        $tasks = Get-ScheduledTask -TaskPath "\ArkServerManager\"

        if ($tasks) {
            Write-Host "Found $($tasks.Count) tasks in \ArkServerManager\:"
            $tasks | ForEach-Object {
                Write-Host "Task: $($_.TaskName) (State: $($_.State))"
                if ($_.Actions) {
                    foreach ($action in $_.Actions) {
                        # Always show Path and Arguments if available for any action type
                        Write-Host "  Action Path: $($action.Execute)"
                        Write-Host "  Action Arguments: $($action.Arguments)"
                        # You can re-enable the ActionType check if you only want Exec actions here
                        # if ($action.ActionType -eq "Exec") {
                        #    Write-Host "  Action Path: $($action.Path)"
                        #    Write-Host "  Action Arguments: $($action.Arguments)"
                        # } else {
                        #    Write-Host "  Action Type: $($action.ActionType)"
                        # }
                    }
                } else {
                    Write-Host "  No actions defined for this task."
                }
            }
        } else {
            Write-Host "No tasks found in \ArkServerManager\."
        }
    }
    catch {
        Write-Error "Error getting scheduled tasks directly: $($_.Exception.Message)"
        if ($_.Exception.InnerException) {
            Write-Error "Error details: $($_.Exception.InnerException.Message)"
        }
        exit 1 # Indicate error
    }
    exit 0 # Indicate success
}
elseif ([string]::IsNullOrWhiteSpace($PipeName)) {
    # --- NON-ELEVATED SCRIPT (SERVER - Launches Elevated Client) ---
    Write-Host "Non-elevated process: Starting server..."

    $currentPipeName = $Global:PipeNamePrefix + [Guid]::NewGuid().ToString()
    $server = $null # Initialize to null for finally block
    $process = $null # Initialize process for finally block
    $reader = $null # Initialize reader for finally block
    Write-Host "Generated Pipe Name: $currentPipeName"

    try {
        $server = New-Object System.IO.Pipes.NamedPipeServerStream(
            $currentPipeName,
            [System.IO.Pipes.PipeDirection]::In,
            1, # Max number of server instances
            [System.IO.Pipes.PipeTransmissionMode]::Byte,
            [System.IO.Pipes.PipeOptions]::Asynchronous # Asynchronous for non-blocking operations if needed
        )

        Write-Host "Non-elevated process: Waiting for client connection on pipe '$currentPipeName'..."
        
        # Launch elevated script in a new process
        $scriptPath = $MyInvocation.MyCommand.Path
        $processInfo = New-Object System.Diagnostics.ProcessStartInfo
        $processInfo.FileName = "powershell.exe"
        $processInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -PipeName `"$currentPipeName`""
        $processInfo.Verb = "runas" # Triggers UAC
        $processInfo.UseShellExecute = $true
        $processInfo.WindowStyle = "Hidden" # Keep this hidden to avoid a flashing window

        # Start the elevated process
        $process = [System.Diagnostics.Process]::Start($processInfo)

        $server.WaitForConnection()

        Write-Host "Non-elevated process: Client connected. Reading data..."

        $reader = New-Object System.IO.StreamReader($server)

        # Read all lines until the client closes the pipe or disconnects
        while ($true) {
            try {
                $line = $reader.ReadLine()
                if ($line -eq $null) {
                    Write-Host "Non-elevated process: End of stream detected."
                    break
                }
                Write-Host "Received: $line"
            }
            catch {
                Write-Error "Non-elevated process: Error reading from pipe: $($_.Exception.Message)"
                break
            }
        }

        Write-Host "Non-elevated process: Waiting for elevated process to exit..."
        $process.WaitForExit() # Wait for the elevated process to complete
        Write-Host "Non-elevated process: Elevated process exited with code $($process.ExitCode)."
    }
    catch {
        Write-Error "Non-elevated process error: $($_.Exception.Message)"
        if ($_.Exception.InnerException) {
            Write-Error "Error details: $($_.Exception.InnerException.Message)"
        }
    }
    finally {
        # Ensure pipes and processes are closed regardless of errors
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $server -and $server.IsConnected) {
            try { $server.Disconnect() } catch {}
        }
        if ($null -ne $server) { $server.Dispose() }
        if ($null -ne $process -and -not $process.HasExited) {
            Write-Warning "Non-elevated process: Elevated process still running in finally block, killing it."
            try { $process.Kill() } catch {}
        }
        Write-Host "Non-elevated process: Server stream and process handled."
    }

}
else {
    # --- ELEVATED SCRIPT (CLIENT - Called by Non-Elevated Server) ---
    Write-Host "Elevated process: Connecting to pipe '$PipeName'..."
    $client = $null # Initialize to null for finally block
    $writer = $null # Initialize writer for finally block

    try {
        # Double-check elevation here, though the calling process should ensure this
        if (-not $IsElevated) {
            Write-Error "Elevated process error: This part of the script should only run with Administrator privileges. Exiting."
            exit 1
        }

        $client = New-Object System.IO.Pipes.NamedPipeClientStream(
            ".",
            $PipeName,
            [System.IO.Pipes.PipeDirection]::Out
        )

        Start-Sleep -Milliseconds 500 # Small delay to help server set up

        Write-Host "Elevated process: Attempting to connect..."
        $client.Connect(5000) # Try to connect for up to 5 seconds
        if (-not $client.IsConnected) {
            throw "Failed to connect to pipe '$PipeName'."
        }
        Write-Host "Elevated process: Connected. Writing data..."

        $writer = New-Object System.IO.StreamWriter($client)
        $writer.AutoFlush = $true

        $writer.WriteLine("Hello from elevated script! Current time: $(Get-Date)")

        try {
            $tasks = Get-ScheduledTask -TaskPath "\ArkServerManager\"
            if ($tasks) {
                $writer.WriteLine("Found $($tasks.Count) tasks in \ArkServerManager\:")
                $tasks | ForEach-Object {
                    $writer.WriteLine("Task: $($_.TaskName) (State: $($_.State))")
                    if ($_.Actions) {
                        foreach ($action in $_.Actions) {
                            # Removed the "Exec" check here to always output path/arguments if available
                            $writer.WriteLine("  Action Path: $($action.Execute)")
                            $writer.WriteLine("  Action Arguments: $($action.Arguments)")
                        }
                    } else {
                        $writer.WriteLine("  No actions defined for this task.")
                    }
                }
            } else {
                $writer.WriteLine("No tasks found in \ArkServerManager\.")
            }
        }
        catch {
            $writer.WriteLine("Error getting scheduled tasks: $($_.Exception.Message)")
        }

        $writer.Close()
        Write-Host "Elevated process: Data sent and client stream closed."
    }
    catch {
        Write-Error "Elevated process error: $($_.Exception.Message)"
        if ($_.Exception.InnerException) {
            Write-Error "Error details: $($_.InnerException.Message)"
        }
        exit 1 # Indicate error
    }
    finally {
        if ($null -ne $writer) { $writer.Dispose() }
        if ($null -ne $client) { $client.Dispose() }
        Write-Host "Elevated process: Client stream closed."
    }
    exit 0 # Indicate success
}