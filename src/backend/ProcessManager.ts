// src/backend/ProcessManager.ts
// Abstract, extensible process manager for game servers
// This class is designed to be extended for different game types.

import { EventEmitter } from 'events';
import { listProcesses } from './processList';
import { getProfiles } from './profiles';

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
  protected processes: Record<string, { pid: number, process: any; startTime: number }> = {};

  abstract start(profile: ServerProcessProfile): Promise<ProcessStatus>;
  abstract stop(key: string): Promise<ProcessStatus>;
  abstract startPeriodicStatusCheck(interval: number): void;
  abstract isRunning(key: string, profile?: ServerProcessProfile): Promise<boolean>;
  abstract getStatus(key: string): ProcessStatus;

  async autoStart(profiles: ServerProcessProfile[]) {
    const portscanner = require('portscanner');
    for (const profile of profiles) {
      if (profile.autoStart && (profile.manuallyStopped === undefined || !profile.manuallyStopped)) {
        const portToCheck = profile.port;
        if (portToCheck && portToCheck > 0 && portToCheck < 65536) {
          portscanner.checkPortStatus(portToCheck, '127.0.0.1', (error: string | null | undefined, status: string | undefined) => {
            if (error) {
              console.error('Error checking port:', error);
              return;
            }
            if (status === 'open') {
              console.log(`Port ${portToCheck} is open (in use).`);
            } else {
              console.log(`Port ${portToCheck} is closed (free).`);
              this.start(profile);
            }
          });
        } else {
          this.start(profile);
        }
      }
    }
  }

  async stopProcess(key: string): Promise<ProcessStatus> {
    return this.stop(key);
  }

  async startProcess(profile: ServerProcessProfile, force: boolean): Promise<ProcessStatus> {
    return this.start(profile);
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
      this.processes[`${profile.host}:${profile.port}`] = { pid: found.pid,process: null, startTime: found.startTime?.getTime() || Date.now() };
      this.emit('processStatus', `${profile.host}:${profile.port}`, { running: true, startTime: this.processes[`${profile.host}:${profile.port}`].startTime });
      return { running: true, startTime: this.processes[`${profile.host}:${profile.port}`].startTime };
    }
    if (this.processes[`${profile.host}:${profile.port}`]) return { running: true, error: 'Server already running' };
    const child = require('child_process').spawn(exePath, profile.parsedCommandline, {
      cwd: profile.directory,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    this.processes[`${profile.host}:${profile.port}`] = { pid: child.pid, process: child, startTime: Date.now() };
    child.unref();
    this.emit('processStatus', `${profile.host}:${profile.port}`, { running: true, startTime: this.processes[`${profile.host}:${profile.port}`].startTime });
    return { running: true, startTime: this.processes[`${profile.host}:${profile.port}`].startTime };
  }
  // Stops a process by key, which is host:port
  // Returns ProcessStatus with running=false if successful, or error message if not
  async stop(key: string): Promise<ProcessStatus> {
    const proc = this.processes[key];
    if (proc && proc.pid) {
      try { process.kill(proc.pid); } catch (e) { return { running: false, error: String(e) }; }
      delete this.processes[key];
      this.emit('processStatus', key, { running: false });
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
    const found = runningProcs.find(p => p.exe && p.exe.toLowerCase() === exePath.toLowerCase());
    if (found) {
      // Process is running
      this.processes[`${profile.host}:${profile.port}`] = { pid: found.pid, process: null, startTime: found.startTime?.getTime() || Date.now() };
      return true;
    }
    return false;
  }

  getStatus(key: string): ProcessStatus {
    const proc = this.processes[key];
    if (proc) return { running: true, startTime: proc.startTime };
    return { running: false };
  }

  // Periodically check status of all managed sessions
  startPeriodicStatusCheck(intervalMs: number = 10000) {
    const portscanner = require('portscanner');
    setInterval(async () => {
      const runningProcs = await listProcesses();
      for (const profile of getProfiles()) {
        const pathMod = require('path');
        const exePath = pathMod.join(profile.directory, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
        const found = runningProcs.find(p => p.exe && p.exe.toLowerCase() === exePath.toLowerCase());
        const portToCheck = profile.port;
        if (found) {
          // Process is running
          this.processes[`${profile.host}:${profile.port}`] = { pid: found.pid, process: null, startTime: found.startTime?.getTime() || Date.now() };
          this.emit('processStatus', `${profile.host}:${profile.port}`, { running: true, startTime: this.processes[`${profile.host}:${profile.port}`].startTime });
        } else if (portToCheck && portToCheck > 0 && portToCheck < 65536) {
          delete this.processes[`${profile.host}:${profile.port}`]; // Clear tracked process if not found
          portscanner.checkPortStatus(portToCheck, '127.0.0.1', (error: string | null | undefined, status: string | undefined) => {
            if (error) {
              this.emit('processStatus', `${profile.host}:${profile.port}`, { running: false, error: `Error checking port: ${error}` });
              return;
            }
            if (status === 'open') {
              // Port is in use but no process detected
              this.emit('processStatus', `${profile.host}:${profile.port}`, { running: false, error: `Port ${portToCheck} is open but no process detected` });
            } else {
              // Not running
              this.emit('processStatus', `${profile.host}:${profile.port}`, { running: false });
            }
          });
        } else {
          this.emit('processStatus', `${profile.host}:${profile.port}`, { running: false });
        }
      }
    }, intervalMs);
  }
}
