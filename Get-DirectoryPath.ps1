param(
    [Parameter(Mandatory=$true)]
    [string]$Path
)

function Get-JunctionDestination {
    param (
        [Parameter(Mandatory=$true)]
        [string]$Path
    )

    if (-not (Test-Path $Path -PathType Container)) {
        Write-Error "Path '$Path' does not exist or is not a directory."
        return
    }

    try {
        $item = Get-Item $Path -Force # Use -Force to get reparse points
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            # This is a bit more involved as it requires low-level access
            # The most common way to do this in PowerShell is to use a WMI class
            # or a P/Invoke call, but for simplicity and common use,
            # we can often rely on the 'Target' property for Junctions
            # if they behave like symlinks for some cmdlets.
            # However, for true junction parsing, we need to inspect the reparse point data.

            # A more robust way using .NET and native calls is complex in pure PowerShell.
            # A simpler approach for junctions specifically is to use the `Get-Item`'s
            # Target property if it's exposed, or rely on cmd.exe's 'dir' output parsing.

            # Let's try a common approach that works for many reparse points
            # which is to use the Get-Item's Target property, which often works for junctions
            # as it's designed to return the linked path.
            if ($item.PSObject.Properties['Target']) {
                 return $item.Target
            }
            else {
                # Fallback to parsing 'dir' output for true junction detection if 'Target' isn't there
                # This is less ideal but often effective for junctions.
                $cmdOutput = (cmd /c dir /al "$Path" | Select-String -Pattern "\[(.*?)\]")
                if ($cmdOutput) {
                    $match = $cmdOutput.Matches[0]
                    if ($match.Groups.Count -gt 1) {
                        return $match.Groups[1].Value
                    }
                }
            }
        } else {
            # Return the resolved path of the item if it is not a reparse point (junction)
            return $item.FullName
        }
    } catch {
        Write-Error "An error occurred: $($_.Exception.Message)"
    }
}

Get-JunctionDestination -Path $Path
