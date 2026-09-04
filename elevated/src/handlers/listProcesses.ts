import { exec } from 'child_process';

export function listProcessesHandler(): Promise<any[]> {
  return new Promise(resolve => {
    const command = `Get-Process -Name 'ArkAscendedServer' | Select-Object -Property Id, Path, CommandLine, StartTime | ConvertTo-Json`;
    exec(`powershell.exe -NoProfile -Command "${command}"`, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout.trim() || stdout.trim() === '[]') return resolve([]);
      try {
        const raw = JSON.parse(stdout);
        const rows = Array.isArray(raw) ? raw : [raw];
        resolve(rows.map(p => ({ pid: p.Id, exe: p.Path || '', cmdline: p.CommandLine || '', startTime: p.StartTime || null })));
      } catch { resolve([]); }
    });
  });
}
