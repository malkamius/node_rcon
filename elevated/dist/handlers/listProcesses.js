"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProcessesHandler = listProcessesHandler;
const child_process_1 = require("child_process");
function listProcessesHandler() {
    return new Promise(resolve => {
        const command = `Get-Process -Name 'ArkAscendedServer' | Select-Object -Property Id, Path, CommandLine, StartTime | ConvertTo-Json`;
        (0, child_process_1.exec)(`powershell.exe -NoProfile -Command "${command}"`, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
            if (err || !stdout.trim() || stdout.trim() === '[]')
                return resolve([]);
            try {
                const raw = JSON.parse(stdout);
                const rows = Array.isArray(raw) ? raw : [raw];
                resolve(rows.map(p => ({ pid: p.Id, exe: p.Path || '', cmdline: p.CommandLine || '', startTime: p.StartTime || null })));
            }
            catch {
                resolve([]);
            }
        });
    });
}
