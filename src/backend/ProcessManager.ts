// src/backend/ProcessManager.ts
// Abstract, extensible process manager for game servers
// This class is designed to be extended for different game types.

import { EventEmitter } from 'events';
import { listProcesses } from './processList';

export interface ServerProcessProfile {
  key: string;
  directory: string;
  game: string;
  autoStart?: boolean;
  manuallyStopped?: boolean;
  parsedCommandline?: string[]; // Command line arguments, if any
  [prop: string]: any;
}

export interface ProcessStatus {
  running: boolean;
  startTime?: number;
  error?: string;
}


export abstract class ProcessManager extends EventEmitter {
  protected processes: Record<string, { process: any; startTime: number }> = {};

  abstract start(profile: ServerProcessProfile): Promise<ProcessStatus>;
  abstract stop(key: string): Promise<ProcessStatus>;
  abstract isRunning(key: string, profile?: ServerProcessProfile): Promise<boolean>;
  abstract getStatus(key: string): ProcessStatus;

  // Optionally override for auto-start logic
  async autoStart(profiles: ServerProcessProfile[]) {
    for (const profile of profiles) {
         const pathMod = require('path');
        const fsMod = require('fs');
        const exePath = pathMod.join(profile.directory, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
        const runningProcs = await listProcesses();
        const found = runningProcs.find(p => p.exe && p.exe.toLowerCase() === exePath.toLowerCase());
        if (found) {
        // Attach to running process (best effort, can't get start time reliably)
            this.processes[profile.key] = { process: null, startTime: found.startTime?.getTime() || Date.now() };
            this.emit('status', profile.key, { running: true, startTime: this.processes[profile.key].startTime });
            //return { running: true, startTime: this.processes[profile.key].startTime };
        }
        else if (profile.autoStart && (profile.manuallyStopped === undefined || !profile.manuallyStopped)) {
          this.start(profile);
        }
    }
  }
}

export class ArkSAProcessManager extends ProcessManager {
  async start(profile: ServerProcessProfile): Promise<ProcessStatus> {
    if (!profile.directory) return { running: false, error: 'No directory set' };
    const pathMod = require('path');
    const fsMod = require('fs');
    const exePath = pathMod.join(profile.directory, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
    if (!fsMod.existsSync(exePath)) return { running: false, error: 'Server executable not found' };

    const runningProcs = await listProcesses();
    const found = runningProcs.find(p => p.exe && p.exe.toLowerCase() === exePath.toLowerCase());
    if (found) {
      // Attach to running process (best effort, can't get start time reliably)
      this.processes[profile.key] = { process: null, startTime: found.startTime?.getTime() || Date.now() };
      this.emit('status', profile.key, { running: true, startTime: this.processes[profile.key].startTime });
      return { running: true, startTime: this.processes[profile.key].startTime };
    }
    if (this.processes[profile.key]) return { running: true, error: 'Server already running' };
    const child = require('child_process').spawn(exePath, profile.parsedCommandline, {
      cwd: profile.directory,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    this.processes[profile.key] = { process: child, startTime: Date.now() };
    child.unref();
    this.emit('status', profile.key, { running: true, startTime: this.processes[profile.key].startTime });
    return { running: true, startTime: this.processes[profile.key].startTime };
  }

  async stop(key: string): Promise<ProcessStatus> {
    const proc = this.processes[key];
    if (proc && proc.process) {
      try { proc.process.kill(); } catch (e) { return { running: false, error: String(e) }; }
      delete this.processes[key];
      this.emit('status', key, { running: false });
      return { running: false };
    }
    return { running: false, error: 'No running process' };
  }

  // Checks all system processes for the server exe path, not just tracked processes
  async isRunning(key: string, profile?: ServerProcessProfile): Promise<boolean> {
    // Check tracked process first
    //if (this.processes[key]) return true;
    // If profile is not provided, cannot check exe path
    if (!profile || !profile.directory) return false;
    const pathMod = require('path');
    const exePath = pathMod.join(profile.directory, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
    const runningProcs = await listProcesses();
    return runningProcs.some(p => p.exe && p.exe.toLowerCase() === exePath.toLowerCase());
  }

  getStatus(key: string): ProcessStatus {
    const proc = this.processes[key];
    if (proc) return { running: true, startTime: proc.startTime };
    return { running: false };
  }
}
