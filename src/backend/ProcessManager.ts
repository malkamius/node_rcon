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
  crashed?: boolean;
  exitCode?: number | null;
  exitSignal?: string | null;
}


export abstract class ProcessManager extends EventEmitter {
  protected processes: Record<string, { pid: number; process: any; startTime: number; crashed?: boolean; exitCode?: number | null; exitSignal?: string | null }> = {};


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

  async shutdownGracefully(key: string, rconManager?: any, timeoutMs: number = 15000): Promise<ProcessStatus> {
    const currentStatus = this.getStatus(key);
    if (!currentStatus.running || !this.processes[key]) {
      return { running: false };
    }

    if (rconManager && typeof rconManager.sendCommand === 'function') {
      try {
        await rconManager.sendCommand(key, 'SaveWorld');
        await new Promise(r => setTimeout(r, 1500));
        await rconManager.sendCommand(key, 'DoExit');

        const startTime = Date.now();
        const pollInterval = 500;
        while (Date.now() - startTime < timeoutMs) {
          await new Promise(r => setTimeout(r, pollInterval));
          const proc = this.processes[key];
          let stillAlive = false;
          if (proc) {
            stillAlive = true;
            if (proc.pid) {
              try {
                process.kill(proc.pid, 0);
              } catch (e: any) {
                if (e && e.code === 'ESRCH') {
                  stillAlive = false;
                }
              }
            }
          }
          if (!stillAlive) {
            delete this.processes[key];
            this.emit('processStatus', key, { running: false, crashed: false });
            return { running: false };
          }
        }
      } catch (err) {
        console.warn(`[ProcessManager] Graceful shutdown via RCON failed for ${key}:`, err);
      }
    }

    return await this.stop(key);
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
    profile.manuallyStopped = false; // Clear manually stopped flag on start
    if (this.processes[`${profile.host}:${profile.port}`]) return { running: true, error: 'Server already running' };
    
    
    const serverKey = `${profile.host}:${profile.port}`;
    const child = require('child_process').spawn(exePath, profile.parsedCommandline, {
      cwd: profile.directory,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    this.processes[serverKey] = {
      pid: child.pid,
      process: child,
      startTime: Date.now(),
      crashed: false,
      exitCode: null,
      exitSignal: null,
    };

    // Attach exit and error hooks to detect unexpected process termination
    child.on('exit', (code: number | null, signal: string | null) => {
      const wasTracked = this.processes[serverKey];
      const isManual = profile.manuallyStopped === true;

      if (!isManual) {
        // Unexpected exit / crash
        console.warn(`[ProcessManager] Server ${serverKey} exited unexpectedly with code ${code}, signal ${signal}`);
        if (wasTracked) {
          wasTracked.crashed = true;
          wasTracked.exitCode = code;
          wasTracked.exitSignal = signal;
        }
        this.emit('serverCrash', serverKey, {
          code,
          signal,
          time: Date.now(),
          directory: profile.directory,
        });
        this.emit('processStatus', serverKey, {
          running: false,
          crashed: true,
          exitCode: code,
          exitSignal: signal,
          error: `Process crashed or exited unexpectedly (exit code: ${code ?? 'unknown'})`,
        });
      } else {
        // Expected manual stop
        this.emit('processStatus', serverKey, { running: false, crashed: false });
      }

      delete this.processes[serverKey];
    });

    child.on('error', (err: any) => {
      console.error(`[ProcessManager] Error on server child process ${serverKey}:`, err);
      this.emit('serverCrash', serverKey, {
        error: String(err),
        time: Date.now(),
        directory: profile.directory,
      });
      this.emit('processStatus', serverKey, {
        running: false,
        crashed: true,
        error: `Process error: ${err?.message || String(err)}`,
      });
      delete this.processes[serverKey];
    });

    child.unref();
    this.emit('processStatus', serverKey, { running: true, startTime: this.processes[serverKey].startTime, crashed: false });
    return { running: true, startTime: this.processes[serverKey].startTime, crashed: false };
  }
  // Stops a process by key, which is host:port
  // Returns ProcessStatus with running=false if successful, or error message if not
  async stop(key: string): Promise<ProcessStatus> {
    const proc = this.processes[key];
    if (proc && proc.pid) {
      try { process.kill(proc.pid); } catch (e) { return { running: false, error: String(e) }; }
      delete this.processes[key];
      this.emit('processStatus', key, { running: false, crashed: false });
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
      this.processes[`${profile.host}:${profile.port}`] = { pid: found.pid, process: null, startTime: found.startTime?.getTime() || Date.now(), crashed: false };
      return true;
    }
    return false;
  }

  getStatus(key: string): ProcessStatus {
    const proc = this.processes[key];
    if (proc) return { running: true, startTime: proc.startTime, crashed: !!proc.crashed, exitCode: proc.exitCode, exitSignal: proc.exitSignal };
    return { running: false };
  }

  // Periodically check status of all managed sessions
  startPeriodicStatusCheck(intervalMs: number = 10000) {
    const portscanner = require('portscanner');
    const checkStatus = async () => {
      const runningProcs = await listProcesses();
      for (const profile of getProfiles()) {
        const pathMod = require('path');
        const exePath = pathMod.join(profile.directory, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
        const found = runningProcs.find(p => p.exe && p.exe.toLowerCase() === exePath.toLowerCase());
        const portToCheck = profile.port;
        const key = `${profile.host}:${profile.port}`;
        const tracked = this.processes[key];

        if (found) {
          // Process is running
          this.processes[key] = {
            pid: found.pid,
            process: tracked ? tracked.process : null,
            startTime: tracked ? tracked.startTime : (found.startTime?.getTime() || Date.now()),
            crashed: false
          };
          this.emit('processStatus', key, { running: true, startTime: this.processes[key].startTime, crashed: false });
        } else if (tracked && !profile.manuallyStopped) {
          // It was tracked as running previously, but is now gone from process list without a manual stop!
          console.warn(`[ProcessManager] Server ${key} disappeared from active process list without manual stop.`);
          delete this.processes[key];
          this.emit('serverCrash', key, {
            time: Date.now(),
            directory: profile.directory,
            reason: 'Process disappeared unexpectedly from system process list'
          });
          this.emit('processStatus', key, {
            running: false,
            crashed: true,
            error: 'Server process terminated unexpectedly'
          });
        } else if (portToCheck && portToCheck > 0 && portToCheck < 65536) {
          delete this.processes[key]; // Clear tracked process if not found
          portscanner.checkPortStatus(portToCheck, '127.0.0.1', (error: string | null | undefined, status: string | undefined) => {
            if (error) {
              this.emit('processStatus', key, { running: false, error: `Error checking port: ${error}` });
              return;
            }
            if (status === 'open') {
              // Port is in use but no process detected
              this.emit('processStatus', key, { running: false, error: `Port ${portToCheck} is open but no process detected` });
            } else {
              // Not running
              this.emit('processStatus', key, { running: false });
            }
          });
        } else {
          delete this.processes[key];
          this.emit('processStatus', key, { running: false });
        }
      }
    };
    // Run immediately
    checkStatus();
    // Then run on interval
    const timer = setInterval(checkStatus, intervalMs);
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  }
}
