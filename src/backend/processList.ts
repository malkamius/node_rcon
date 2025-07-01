import { exec } from 'child_process';
function parseMicrosoftDateFormat(dateString: string): number | null {
  const regex = /\/Date\((\d+)\)\//; // Regex to capture the number
  const match = dateString.match(regex);

  if (match && match[1]) {
    const timestamp = parseInt(match[1], 10); // Convert the captured string to an integer
    if (!isNaN(timestamp)) {
      return new Date(timestamp).getTime(); // Create a Date object from the timestamp
    }
  }
  return null; // Return null if parsing fails
}
export function listProcesses(): Promise<{ pid: number; exe: string; cmdline: string, startTime: Date | null }[]> {
  return new Promise((resolve, reject) => {
    const executableName = "ArkAscendedServer";
    const escapedExecutableName = `\\"${executableName}\\"`;
    const powershellCommand = `Get-Process -Name ${escapedExecutableName} | Select-Object -Property Id, Path, CommandLine, StartTime | ConvertTo-Json`;

    // Increased maxBuffer for potentially large output, though filtered should be smaller
    exec(`powershell.exe -NoProfile -Command "${powershellCommand}"`, { windowsHide: false, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Error executing PowerShell command:', err);
        // Log stderr if available for more insights
        if (err.stderr) console.error('PowerShell Stderr:', err.stderr);
        return reject(err);
      }

      try {
        // Handle cases where no process is found (stdout might be empty or just '[]')
        // ConvertTo-Json with no results will output "[]"
        if (!stdout.trim() || stdout.trim() === '[]') {
          return resolve([]);
        }

        const rawProcesses = JSON.parse(stdout);

        const processesArray = Array.isArray(rawProcesses) ? rawProcesses : [rawProcesses];

        const result: { pid: number; exe: string; cmdline: string; startTime: Date | null }[] = [];

        for (const p of processesArray) {
          const pid = p.Id;
          const exe = p.Path || '';
          const cmdline = p.CommandLine || '';
          let startTime: Date | null = null;
          if (p.StartTime) {
            try {
              // Date.parse() can handle many ISO 8601 formats including timezone offsets
              // If it returns NaN, the format is not recognized.
              const parsedTime = parseMicrosoftDateFormat(p.StartTime) || Date.parse(p.StartTime);
              if (!isNaN(parsedTime)) {
                startTime = new Date(parsedTime);
              } else {
                console.warn(`Could not parse StartTime string: ${p.StartTime}`);
              }
            } catch (e) {
              console.warn(`Error parsing StartTime '${p.StartTime}': ${e}`);
            }
          }
          if (typeof pid === 'number' && !isNaN(pid) && typeof exe === 'string') {
            result.push({ pid, exe, cmdline, startTime });
          } else {
            console.warn(`Skipping malformed process entry: ${JSON.stringify(p)}`);
          }
        }
        resolve(result);

      } catch (parseError) {
        console.error('Error parsing JSON from PowerShell output:', parseError);
        console.error('Raw stdout:', stdout); // Log raw stdout for debugging
        reject(parseError);
      }
    });
  });
}