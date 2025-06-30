// Utility to list running processes and their command lines (Windows only)
// Returns an array of { pid, exe, cmdline }
import { exec } from 'child_process';

// Uses WMIC to get process list with command line and exe path (Windows only)
export function listProcesses(): Promise<{ pid: number; exe: string; cmdline: string }[]> {
  return new Promise((resolve, reject) => {
    exec('wmic process get ProcessId,ExecutablePath,CommandLine /FORMAT:CSV', { windowsHide: true }, (err, stdout) => {
      if (err) return reject(err);
      const lines = stdout.split(/\r?\n/).filter(Boolean);
      // Remove header
      lines.shift();
      const result: { pid: number; exe: string; cmdline: string }[] = [];
      for (const line of lines) {
        // Format: Node,ExecutablePath,CommandLine,ProcessId
        const parts = line.split(',');
        if (parts.length < 4) continue;
        const cmdline = parts[1] || '';
        const exe = parts[2] || '';
        const pid = parseInt(parts[3], 10);
        if (!exe || isNaN(pid)) continue;
        result.push({ pid, exe, cmdline });
      }
      resolve(result);
    });
  });
}
