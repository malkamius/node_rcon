// RCON Script Engine for Ark: Survival Ascended server management
// This module parses and executes RCON scripts with support for wait and update-base-install commands.
// See requirements.server-instance-management.md for full requirements.

import { RconManager, ServerProfile, BaseInstallProfile } from './rconManager';
import { getProfiles } from './profiles';
import { processManager } from './server';
import path from 'path';
import fs from 'fs';

export type ScriptLine = { raw: string; type: 'rcon' | 'wait' | 'update-base-install'; value?: string };

export interface ScriptExecution {
  serverKey: string;
  script: string;
  lines: ScriptLine[];
  currentLine: number;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'error';
  error?: string;
  startedAt: number;
  cancelled: boolean;
}

const scriptQueues: Record<string, ScriptExecution[]> = {};
// Assume rconManager is instantiated in server.ts and imported here if needed
let rconManager: RconManager | undefined;
export function setRconManager(instance: RconManager) { rconManager = instance; }

export function parseScript(script: string): ScriptLine[] {
  return script.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('wait ')) {
      return { raw: line, type: 'wait', value: trimmed.slice(5) };
    }
    if (trimmed.startsWith('update-base-install ')) {
      return { raw: line, type: 'update-base-install', value: trimmed.slice(20) };
    }
    return { raw: line, type: 'rcon' };
  });
}

export async function executeScript(server: ServerProfile, script: string, baseInstalls: BaseInstallProfile[]): Promise<ScriptExecution> {
  const lines = parseScript(script);
  const key = server.host + ':' + server.port;
  const exec: ScriptExecution = {
    serverKey: key,
    script,
    lines,
    currentLine: 0,
    status: 'pending',
    startedAt: Date.now(),
    cancelled: false,
  };
  if (!scriptQueues[key]) scriptQueues[key] = [];
  scriptQueues[key].push(exec);
  exec.status = 'running';
  for (; exec.currentLine < lines.length; exec.currentLine++) {
    if (exec.cancelled) {
      exec.status = 'cancelled';
      break;
    }
    const line = lines[exec.currentLine];
    if (line.type === 'wait') {
      const ms = parseInt(line.value || '0', 10);
      if (!isNaN(ms) && ms > 0) await new Promise(res => setTimeout(res, ms));
    } else if (line.type === 'update-base-install') {
      const baseId = line.value;
      const base = baseInstalls.find(b => b.id === baseId);
      if (!base) {
        exec.status = 'error';
        exec.error = `Base install not found: ${baseId}`;
        break;
      }
      // Block if any server is running with this base install
      const profiles = getProfiles();
      const running = profiles.some((p: ServerProfile) => p.baseInstallId === baseId && isServerRunning(p));
      if (running) {
        exec.status = 'error';
        exec.error = `Cannot update base install ${baseId}: in use by running server.`;
        break;
      }
      await updateBaseInstallStub(base);
    } else {
      if (!rconManager) throw new Error('RconManager not set');
      const key = server.host + ':' + server.port;
      await rconManager.sendCommand(key, line.raw);
    }
  }

  if (exec.status === 'running') exec.status = 'completed';
  return exec;
}

// Helper to check if a server is running (matches logic in server.ts)
function isServerRunning(profile: ServerProfile): boolean {
  const key = profile.host + ':' + profile.port;
  const status = processManager.getStatus(key);
  return !!status.running;
}

// Stub for base install update
async function updateBaseInstallStub(base: BaseInstallProfile): Promise<void> {
  // TODO: Implement actual update logic (SteamCMD, etc.)
  await new Promise(res => setTimeout(res, 1000));
}

export function cancelScript(serverKey: string): boolean {
  const queue = scriptQueues[serverKey];
  if (!queue || queue.length === 0) return false;
  const exec = queue[0];
  exec.cancelled = true;
  return true;
}

export function getScriptStatus(serverKey: string): ScriptExecution | undefined {
  const queue = scriptQueues[serverKey];
  return queue && queue[0];
}
