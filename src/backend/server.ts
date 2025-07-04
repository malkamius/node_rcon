// NOTE: All Express API endpoint declarations (app.get, app.post, etc.) must be placed after:
//   1. All imports
//   2. All middleware (app.use, static, etc.)
//   3. The line: const app = express();
//   4. All helper and config declarations
// Place new endpoints just before server.listen at the end of this file.


import express, { Request, Response } from 'express';
import { ArkSAProcessManager, ProcessManager, ServerProcessProfile, ProcessStatus } from './ProcessManager';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';

import { getProfiles, saveProfiles } from './profiles';
import { RconManager } from './rconManager';
import * as rconScriptEngine from './rconScriptEngine';
import iniApi from './iniApi';
import { serveArkSettingsTemplate } from './serveArkSettingsTemplate';
import { ensureSocketServer, sendAdminSocketCommand } from './adminSocketClient';
import { exit } from 'process';
import { exec, spawn } from 'child_process';

const configPath = path.join(__dirname, '../../config.json');
const defaultConfig = {
  webserver: {
    host: '127.0.0.1',
    port: 3000
  },
  servers: [],
  steamcmdPath: '',
  baseInstallUpdateCheckInterval: 600000, // 10 minutes default
  baseInstalls: []
};
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const app = express();
export { app };

// --- Audit Logging Utility ---
const AUDIT_LOG_PATH = require('path').join(__dirname, '../../logs/audit.log');
function auditLog(event: string, details: any) {
  const entry = {
    time: new Date().toISOString(),
    event,
    ...details
  };
  require('fs').appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
}


export function getBaseInstall(InstancePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const PathTocheck = InstancePath + "\\steamapps";
    // Use single quotes for -Command and escape inner quotes for -Path
    const powershellCommand = `.\\Get-DirectoryPath.ps1 -Path '${PathTocheck}'`;

    exec(
      `powershell.exe -NoProfile -Command "${powershellCommand}"`,
      { windowsHide: false, maxBuffer: 1024 * 1024 * 10 },
      (err, stdout, stderr) => {
        if (err) {
          console.error('Error executing PowerShell command:', err);
          if (stderr) console.error('PowerShell Stderr:', stderr);
          return reject(err);
        }
        // Sometimes PowerShell outputs to stderr even on success
        const output = (stdout && stdout.trim()) || (stderr && stderr.trim());
        if (!output) {
          return reject(new Error('No output from PowerShell script'));
        }
        resolve(path.dirname(output));
      }
    );
  });
}

async function getBaseInstallsFromProfiles() {
  const profiles = getProfiles();
  if(!config.baseInstalls) config.baseInstalls = [];
  for (const profile of profiles) {
    if (profile.game === 'ark_sa' && profile.directory) {
      await getBaseInstall(profile.directory).then(path => {
        if(!config.baseInstalls.some((b: any) => b.path === path)) {
          config.baseInstalls.push({ id: path, path: path, version: null, lastUpdated: null, updateAvailable: false, latestBuildId: null });
          profile.baseInstallPath = path; // Store in profile for easy access
        }
      });
    }
  }
}

(async () => {
  await getBaseInstallsFromProfiles().catch(err => {
    console.error('Error getting base installs from profiles:', err);
  });
})();

// --- Process Manager Abstraction ---
const processManager = new ArkSAProcessManager();


// Manual Stop Tracking for Ark: Survival Ascended servers
function setServerManuallyStopped(key: string, stopped: boolean) {
  const profiles = getProfiles();
  const idx = profiles.findIndex((p: any) => `${p.host}:${p.port}` === key);
  if (idx !== -1) {
    profiles[idx].manuallyStopped = stopped;
    saveProfiles(profiles);
  }
}

// Auto-start servers on backend startup
function autoStartServersOnStartup() {
  const profiles = getProfiles();
  const serverProfiles: ServerProcessProfile[] = profiles.map((p: any) => ({
    key: `${p.host}:${p.port}`,
    directory: p.directory,
    game: p.game,
    autoStart: p.autoStart,
    manuallyStopped: p.manuallyStopped,
    ...p
  }));
  processManager.autoStart(serverProfiles.filter(p => p.game === 'ark_sa' && p.directory));
}

if (process.env.NODE_ENV !== 'test') {
  autoStartServersOnStartup();
}

// Expose processManager for use in other modules (e.g., script engine)
export { processManager };

// --- Periodic Base Install Update Check ---
const STEAMCMD_API_URL = 'https://api.steamcmd.net/v1/info/2430930';
let latestBuildId: string | null = null;

async function fetchLatestBuildId() {
  try {
    const res = await fetch(STEAMCMD_API_URL);
    const data = await res.json();
    latestBuildId = data?.data?.['2430930']?.depots?.branches?.public?.buildid || null;
    return latestBuildId;
  } catch (err) {
    latestBuildId = null;
    return null;
  }
}

async function checkBaseInstallUpdates() {
  await fetchLatestBuildId();
  config.baseInstalls = config.baseInstalls || [];
  for (const base of config.baseInstalls) {
    // Try to read build id from ACF file
    try {
      const acfPath = require('path').join(base.path, 'steamapps', 'appmanifest_2430930.acf');
      if (require('fs').existsSync(acfPath)) {
        const acfRaw = require('fs').readFileSync(acfPath, 'utf-8');
        const buildIdMatch = acfRaw.match(/"buildid"\s+"(\d+)"/);
        const buildId = buildIdMatch ? buildIdMatch[1] : null;
        base.version = buildId;
        base.updateAvailable = latestBuildId && buildId && buildId !== latestBuildId;
        base.latestBuildId = latestBuildId;
      } else {
        base.version = null;
        base.updateAvailable = false;
        base.latestBuildId = latestBuildId;
      }
    } catch {
      base.version = null;
      base.updateAvailable = false;
      base.latestBuildId = latestBuildId;
    }
  }
  require('fs').writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}


// Start periodic check after config is declared (must be after config is defined)
function startBaseInstallUpdateInterval() {
  setInterval(checkBaseInstallUpdates, config.baseInstallUpdateCheckInterval || 600000);
  checkBaseInstallUpdates();
}

// At the end of config declaration, start the interval (but not in test mode)
if (process.env.NODE_ENV !== 'test') {
  startBaseInstallUpdateInterval();
}

async function ensureSocket()
{
  await ensureSocketServer().catch(err => {
    console.error('Failed to ensure admin socket server:', err);
    exit(1);
  });
}
ensureSocket().catch(err => {
  console.error('Error ensuring admin socket server:', err);
  exit(1);
});


const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Health check endpoint for monitoring and deployment readiness ---
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// --- SteamCMD Path Management & Base Install Management (stubs) ---
// These endpoints must be after 'const app = express();' and after all middleware

// Get SteamCMD path
app.get('/api/steamcmd-path', (req: Request, res: Response) => {
  res.json({ steamcmdPath: config.steamcmdPath || '' });
});

// Set SteamCMD path
app.post('/api/steamcmd-path', express.json(), (req: Request, res: Response) => {
  const { steamcmdPath } = req.body;
  if (typeof steamcmdPath !== 'string' || !steamcmdPath.trim()) {
    return res.status(400).json({ error: 'Invalid steamcmdPath' });
  }
  config.steamcmdPath = steamcmdPath.trim();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  res.json({ ok: true });
});

// Validate SteamCMD path
app.post('/api/validate-steamcmd-path', express.json(), (req: Request, res: Response) => {
  const { steamcmdPath } = req.body;
  if (typeof steamcmdPath !== 'string' || !steamcmdPath.trim()) {
    return res.status(400).json({ error: 'Invalid steamcmdPath' });
  }
  const exePath = steamcmdPath.trim();
  try {
    if (!fs.existsSync(exePath)) {
      return res.status(404).json({ error: 'SteamCMD executable not found at path' });
    }
    // Optionally, check if file is executable (platform-specific)
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// List base installs
app.get('/api/base-installs', (req: Request, res: Response) => {
  res.json({ baseInstalls: config.baseInstalls || [] });
});

// Add a new base install
app.post('/api/base-installs', express.json(), (req: Request, res: Response) => {
  const { id, path: installPath, version, lastUpdated } = req.body;
  if (!id || !installPath || !version) {
    auditLog('addBaseInstall_error', { id, path: installPath, error: 'id, path, and version are required' });
    return res.status(400).json({ error: 'id, path, and version are required' });
  }
  // Ensure uniqueness by id and path
  config.baseInstalls = config.baseInstalls || [];
  if (config.baseInstalls.some((b: any) => b.id === id || b.path === installPath)) {
    auditLog('addBaseInstall_error', { id, path: installPath, error: 'Base install with this id or path already exists' });
    return res.status(400).json({ error: 'Base install with this id or path already exists' });
  }
  config.baseInstalls.push({ id, path: installPath, version, lastUpdated: lastUpdated || new Date().toISOString() });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  auditLog('addBaseInstall', { id, path: installPath, version });
  res.json({ ok: true });
});

// Update an existing base install
app.put('/api/base-installs/:id', express.json(), (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: installPath, version, lastUpdated } = req.body;
  config.baseInstalls = config.baseInstalls || [];
  const idx = config.baseInstalls.findIndex((b: any) => b.id === id);
  if (idx === -1) {
    auditLog('updateBaseInstall_error', { id, error: 'Base install not found' });
    return res.status(404).json({ error: 'Base install not found' });
  }
  // Prevent path duplication
  if (installPath && config.baseInstalls.some((b: any, i: number) => b.path === installPath && i !== idx)) {
    auditLog('updateBaseInstall_error', { id, path: installPath, error: 'Another base install with this path already exists' });
    return res.status(400).json({ error: 'Another base install with this path already exists' });
  }
  if (installPath) config.baseInstalls[idx].path = installPath;
  if (version) config.baseInstalls[idx].version = version;
  if (lastUpdated) config.baseInstalls[idx].lastUpdated = lastUpdated;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  auditLog('updateBaseInstall', { id, path: installPath, version });
  res.json({ ok: true });
});

// Remove a base install
app.delete('/api/base-installs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  config.baseInstalls = config.baseInstalls || [];
  const idx = config.baseInstalls.findIndex((b: any) => b.id === id);
  if (idx === -1) {
    auditLog('removeBaseInstall_error', { id, error: 'Base install not found' });
    return res.status(404).json({ error: 'Base install not found' });
  }
  config.baseInstalls.splice(idx, 1);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  auditLog('removeBaseInstall', { id });
  res.json({ ok: true });
});

// Add/update/remove base installs will be implemented in next steps

// In-memory session lines store (keyed by server key)
const SESSION_LINES_MAX = 100;
const LOGS_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
// Now supports: { text, timestamp, guid?, type? }
const sessionLines: Record<string, { text: string; timestamp: number; guid?: string; type?: 'command' | 'output' }[]> = {};

function keyToFilename(key: string) {
  // Replace : and / with _ for cross-platform safety
  return path.join(LOGS_DIR, key.replace(/[:\\/]/g, '_') + '.jsonl');
}

function loadSessionLinesFromDisk(key: string): { text: string; timestamp: number; guid?: string; type?: 'command' | 'output' }[] {
  const file = keyToFilename(key);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  // Only keep the last N
  return lines.slice(-SESSION_LINES_MAX);
}

function appendSessionLineToDisk(key: string, line: any) {
  const file = keyToFilename(key);
  fs.appendFileSync(file, JSON.stringify(line) + '\n');
}

function saveSessionLinesToDisk(key: string, lines: any[]) {
  const file = keyToFilename(key);
  fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
}

function renameSessionLogFile(oldKey: string, newKey: string) {
  const oldFile = keyToFilename(oldKey);
  const newFile = keyToFilename(newKey);
  if (fs.existsSync(oldFile)) {
    fs.renameSync(oldFile, newFile);
  }
}

// API: Append a line to session lines for a server profile (from frontend)
app.post('/api/session-lines/:key', express.json(), (req, res) => {
  const key = req.params.key;
  const { line } = req.body;
  if (!line || typeof line.text !== 'string' || typeof line.timestamp !== 'number') {
    return res.status(400).json({ error: 'Invalid line format' });
  }
  if (!sessionLines[key]) {
    sessionLines[key] = loadSessionLinesFromDisk(key);
  }
  // Prevent duplicate lines (by guid+type+timestamp+text)
  if (line.guid && sessionLines[key].some(l => l.guid === line.guid && l.type === line.type && l.timestamp === line.timestamp && l.text === line.text)) {
    return res.json({ ok: true });
  }
  sessionLines[key].push(line);
  if (sessionLines[key].length > SESSION_LINES_MAX) {
    sessionLines[key] = sessionLines[key].slice(-SESSION_LINES_MAX);
  }
  saveSessionLinesToDisk(key, sessionLines[key]);
  // Broadcast new line to all clients
  broadcast('sessionLine', { key, line });
  res.json({ ok: true });
});

// API: Clear session lines for a server profile
app.delete('/api/session-lines/:key', (req, res) => {
  const key = req.params.key;
  sessionLines[key] = [];
  saveSessionLinesToDisk(key, []);
  res.json({ ok: true });
});

// API: Get last N session lines for a server profile
app.get('/api/session-lines/:key', (req, res) => {
  const key = req.params.key;
  if (!sessionLines[key]) {
    sessionLines[key] = loadSessionLinesFromDisk(key);
  }
  res.json({ lines: sessionLines[key] || [] });
});



// Track connected players per server key
const connectedPlayers: Record<string, Set<string>> = {};

// RCON Manager instance
const rconManager = new RconManager();
rconScriptEngine.setRconManager(rconManager);
// --- RCON Script Engine API ---
// POST /api/execute-script { key, script }
app.post('/api/execute-script', express.json(), async (req, res) => {
  const { key, script } = req.body;
  if (!key || typeof script !== 'string') {
    auditLog('executeScript_error', { key, error: 'Missing key or script' });
    return res.status(400).json({ error: 'Missing key or script' });
  }
  const profiles = getProfiles();
  const server = profiles.find((p: any) => `${p.host}:${p.port}` === key);
  if (!server) {
    auditLog('executeScript_error', { key, error: 'Server not found' });
    return res.status(404).json({ error: 'Server not found' });
  }
  const baseInstalls = (config.baseInstalls || []);
  try {
    const exec = await rconScriptEngine.executeScript(server, script, baseInstalls);
    auditLog('executeScript', { key, status: exec.status, error: exec.error });
    res.json({ ok: true, status: exec.status, error: exec.error });
  } catch (err) {
    auditLog('executeScript_error', { key, error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/script-status/:key
app.get('/api/script-status/:key', (req, res) => {
  const { key } = req.params;
  const status = rconScriptEngine.getScriptStatus(key);
  if (!status) return res.status(404).json({ error: 'No script running' });
  res.json({ status });
});

// POST /api/cancel-script { key }
app.post('/api/cancel-script', express.json(), (req, res) => {
  const { key } = req.body;
  if (!key) {
    auditLog('cancelScript_error', { key, error: 'Missing key' });
    return res.status(400).json({ error: 'Missing key' });
  }
  const ok = rconScriptEngine.cancelScript(key);
  auditLog('cancelScript', { key, ok });
  res.json({ ok });
});


// Serve static files
app.use(express.static(path.join(__dirname, '../../public')));
// Serve ARK settings template JSON
serveArkSettingsTemplate(app);
// INI API
app.use(iniApi);

// --- SteamCMD Path Management & Base Install Management (stubs) ---
// These endpoints must be after 'const app = express();' and after all middleware

// Get SteamCMD path
app.get('/api/steamcmd-path', (req, res) => {
  res.json({ steamcmdPath: config.steamcmdPath || '' });
});

// Set SteamCMD path
app.post('/api/steamcmd-path', express.json(), (req, res) => {
  const { steamcmdPath } = req.body;
  if (typeof steamcmdPath !== 'string' || !steamcmdPath.trim()) {
    return res.status(400).json({ error: 'Invalid steamcmdPath' });
  }
  config.steamcmdPath = steamcmdPath.trim();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  res.json({ ok: true });
});

// List base installs
app.get('/api/base-installs', (req, res) => {
  res.json({ baseInstalls: config.baseInstalls || [] });
});

// Add/update/remove base installs will be implemented in next steps

// API: Get layout for a server profile
app.get('/api/layout/:key', (req, res) => {
  const key = req.params.key;
  const profiles = getProfiles();
  const profile = profiles.find((p: any) => `${p.host}:${p.port}` === key);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json(profile.layout || {});
});

// API: Update layout for a server profile
app.post('/api/layout/:key', express.json(), (req, res) => {
  const key = req.params.key;
  const profiles = getProfiles();
  const idx = profiles.findIndex((p: any) => `${p.host}:${p.port}` === key);
  if (idx === -1) return res.status(404).json({ error: 'Profile not found' });
  profiles[idx].layout = { ...profiles[idx].layout, ...req.body };
  saveProfiles(profiles);
  res.json({ ok: true });
});

// Broadcast helper
function broadcast(type: string, payload: any) {
  wss.clients.forEach((client: any) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type, ...payload }));
    }
  });
}
  // Listen for currentPlayers updates

  // Listen for currentPlayers updates
  const playersListener = (key: string, output: string) => {
    // output is expected to be a string with player names, one per line or comma separated
    // Try to parse player names

    let players: string[] = [];
    if (output === null || output === undefined || output.trim() === 'No Players Connected' || output.trim() === 'No players online') {
      players = [];
    } else if (output.includes('\n')) {
      players = output.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
    } else if (output.includes(',')) {
      players = output.split(',').map(p => p.trim()).filter(Boolean);
    } else if (output.trim()) {
      players = [output.trim()];
    }
    // Remove player index (e.g., '0. ') from each player string
    players = players.map(p => p.replace(/^\d+\.\s*/, ''));

    if (!connectedPlayers[key]) connectedPlayers[key] = new Set();
    const prevPlayers = new Set(connectedPlayers[key]);
    const currentPlayers = new Set(players);

    // Detect joins
    for (const player of currentPlayers) {
      if (!prevPlayers.has(player)) {
        // Player joined
        const msg = `PLAYER CONNECTED: ${player}`;
        const line: { text: string; timestamp: number; type: 'output' } = { text: msg, timestamp: Date.now(), type: 'output' };
        if (!sessionLines[key]) sessionLines[key] = [];
      
        sessionLines[key].push(line);
        if (sessionLines[key].length > SESSION_LINES_MAX) {
          sessionLines[key] = sessionLines[key].slice(-SESSION_LINES_MAX);
        }
        broadcast('sessionLine', { key, line });
      }
    }
    // Detect leaves
    for (const player of prevPlayers) {
      if (!currentPlayers.has(player)) {
        // Player left
        const msg = `PLAYER DISCONNECTED: ${player}`;
        const line: { text: string; timestamp: number; type: 'output' } = { text: msg, timestamp: Date.now(), type: 'output' };
        if (!sessionLines[key]) sessionLines[key] = [];
      
        sessionLines[key].push(line);
        if (sessionLines[key].length > SESSION_LINES_MAX) {
          sessionLines[key] = sessionLines[key].slice(-SESSION_LINES_MAX);
        }
        saveSessionLinesToDisk(key, sessionLines[key]);
          broadcast('sessionLine', { key, line });
        }
    }

    // Update tracked players
    connectedPlayers[key] = currentPlayers;

    // Still broadcast the currentPlayers list as before
    const line: { text: string; timestamp: number; type: 'output' } = { text: output, timestamp: Date.now(), type: 'output' };
    broadcast('currentPlayers', { key, line });
  };
  rconManager.on('currentPlayers', playersListener);

  // Listen for chatMessage updates
  const chatListener = (key: string, output: string) => {
    // Store as a sessionLine with type 'output' (or 'chat' if you want to distinguish)
    if (!sessionLines[key]) sessionLines[key] = [];
    const line: { text: string; timestamp: number; type: 'output' } = { text: output, timestamp: Date.now(), type: 'output' };
    sessionLines[key].push(line);
    if (sessionLines[key].length > SESSION_LINES_MAX) {
      sessionLines[key] = sessionLines[key].slice(-SESSION_LINES_MAX);
    }
    saveSessionLinesToDisk(key, sessionLines[key]);
    broadcast('sessionLine', { key, line });
  };
  rconManager.on('chatMessage', chatListener);

processManager.on('processStatus', (key: string, status: ProcessStatus) => {
  broadcast('processStatus', { key, status });
});
processManager.startPeriodicStatusCheck(1000);

// WebSocket: send status updates to clients
// On WebSocket connection, send all session logs to the client
wss.on('connection', (ws) => {
  (async () => {
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'clearSessionLines' && msg.key) {
          sessionLines[msg.key] = [];
          saveSessionLinesToDisk(msg.key, []);
          // Broadcast empty log to all clients
          broadcast('sessionLine', { key: msg.key, line: null });
          // Also broadcast the full (empty) log for the key
          broadcast('sessionLines', { key: msg.key });
          return;
        }
        if (msg.type === 'command' && msg.key && typeof msg.command === 'string') {
          // Store the command line with guid/type if provided
          const commandLine: any = {
            text: '> ' + msg.command,
            timestamp: Date.now(),
            type: 'command',
          };
          if (msg.guid) commandLine.guid = msg.guid;
          if (!sessionLines[msg.key]) sessionLines[msg.key] = [];
          sessionLines[msg.key].push(commandLine);
          if (sessionLines[msg.key].length > SESSION_LINES_MAX) {
            sessionLines[msg.key] = sessionLines[msg.key].slice(-SESSION_LINES_MAX);
          }
          saveSessionLinesToDisk(msg.key, sessionLines[msg.key]);
          broadcast('sessionLine', { key: msg.key, line: commandLine });

          // Use real RCON connection
          const output = await rconManager.sendCommand(msg.key, msg.command);
          // Send output with guid/type if guid was provided
          if (typeof output === 'string' && output.trim()) {
            const outputLine: any = {
              text: output,
              timestamp: Date.now(),
              type: 'output',
            };
            if (msg.guid) outputLine.guid = msg.guid;
            sessionLines[msg.key].push(outputLine);
            if (sessionLines[msg.key].length > SESSION_LINES_MAX) {
              sessionLines[msg.key] = sessionLines[msg.key].slice(-SESSION_LINES_MAX);
            }
            saveSessionLinesToDisk(msg.key, sessionLines[msg.key]);
            broadcast('sessionLine', { key: msg.key, line: outputLine });
          }
          // (No need to send output event for legacy clients)
        } else if (msg.type === 'adminTask' && typeof msg.script === 'string') {
          // Execute admin task via socket server
          try {
            const result = await sendAdminSocketCommand(msg.script);
            ws.send(JSON.stringify({ type: 'adminTaskResult', script: msg.script, result }));
          } catch (err) {
            ws.send(JSON.stringify({ type: 'adminTaskResult', script: msg.script, error: String(err) }));
          }
        } else if (msg.type === 'shutdownserver' && msg.keys) {
          // Handle server shutdown
          const keys = msg.keys;
          const profiles = getProfiles();
          const affectedProfiles = profiles.filter((p: any) => keys.includes(`${p.host}:${p.port}`));
          if (affectedProfiles.length > 0) {
            affectedProfiles.forEach((profile : any) => {
              profile.manuallyStopped = true;
            });
            saveProfiles(profiles);
            affectedProfiles.forEach((profile : any) => {
              setServerManuallyStopped(`${profile.host}:${profile.port}`, true);
              // Stop the process
              processManager.stopProcess(`${profile.host}:${profile.port}`);
            });
            ws.send(JSON.stringify({ type: 'shutdownserverHandled', keys }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
          }
        } else if (msg.type === 'startserver' && msg.keys) {
          // Handle server force start
          const keys = msg.keys;
          const profiles = getProfiles();
          const affectedProfiles = profiles.filter((p: any) => keys.includes(`${p.host}:${p.port}`));
          if (affectedProfiles.length > 0) {
            affectedProfiles.forEach((profile : any) => {
              profile.manuallyStopped = false;
            });
            saveProfiles(profiles);
            affectedProfiles.forEach((profile : any) => {
              setServerManuallyStopped(`${profile.host}:${profile.port}`, false);
              // Start the process
              processManager.start(profile);
            });
            ws.send(JSON.stringify({ type: 'startserverHandled', keys }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
          }
        } else if(msg.type === 'updatebaseinstall' && typeof msg.path === 'string') {
          // Handle base install update (async isRunning)
          const profiles = getProfiles();
          const affectedProfiles = profiles.filter((p: any) => p.baseInstallPath === msg.path);
          if (affectedProfiles.length > 0) {
            // Check if any affected profile is running (async)
            const runningChecks = await Promise.all(
              affectedProfiles.map((profile: any) => processManager.isRunning(`${profile.host}:${profile.port}`, profile))
            );
            if (!runningChecks.some(running => running)) {
              affectedProfiles.forEach((profile: any) => {
                spawn('steamcmd', [
                  '+login', 'anonymous',
                  '+force_install_dir', profile.baseInstallPath,
                  '+app_update', 2430930,
                  '+quit'
                ]);
              });
              ws.send(JSON.stringify({ type: 'updatebaseinstallHandled', path: msg.path }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Cannot update base install while servers are running' }));
            }
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Base install not found' }));
          }
        }
      } catch {}
    });

    ws.send(JSON.stringify({ type: 'hello', message: 'WebSocket connected' }));
    // Send all session logs (all keys)
    // On connect, reload all session lines from disk for all known keys
    const allKeys = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl')).map(f => f.replace(/\.jsonl$/, '').replace(/_/g, ':'));
    for (const key of allKeys) {
      if (!sessionLines[key]) sessionLines[key] = loadSessionLinesFromDisk(key);
    }
    ws.send(JSON.stringify({ type: 'sessionLines', data: sessionLines }));
    // Send current status
    ws.send(JSON.stringify({ type: 'status', data: rconManager.getStatus() }));
    // Listen for status changes
    const statusListener = (key: string, state: any) => {
      ws.send(JSON.stringify({ type: 'status', data: [{ key, ...state }] }));
    };
    rconManager.on('status', statusListener);

    ws.on('close', () => {
      rconManager.off('status', statusListener);
    });
  })();
});

// API: Get server profiles
app.get('/api/profiles', (req, res) => {
  res.json(getProfiles());
});


// API: Update server profiles
app.post('/api/profiles', express.json(), (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Profiles must be an array' });
  }
  // Detect key changes and rename session log files if needed
  const oldProfiles = getProfiles();
  const oldKeys = oldProfiles.map((p: any) => `${p.host}:${p.port}`);
  const newKeys = req.body.map((p: any) => `${p.host}:${p.port}`);
  // If a profile changed key, rename its log file
  for (let i = 0; i < oldProfiles.length; i++) {
    const oldKey = oldKeys[i];
    // Try to find a matching profile by some unique property (e.g., name or id)
    // For now, if the old profile is not in newKeys, but a new profile exists at the same index, treat as rename
    if (newKeys[i] && oldKey !== newKeys[i]) {
      renameSessionLogFile(oldKey, newKeys[i]);
      // Also update in-memory sessionLines
      if (sessionLines[oldKey]) {
        sessionLines[newKeys[i]] = sessionLines[oldKey];
        delete sessionLines[oldKey];
      }
    }
  }
  saveProfiles(req.body);
  // Reload RCON connections
  rconManager.loadProfiles();
  res.json({ success: true });
});


// --- API: Get process status for all managed servers ---
// Returns: { key, running, startTime }[]
app.get('/api/process-status', (req, res) => {
  const profiles = getProfiles();
  const status = profiles.map((profile: any) => {
    const key = `${profile.host}:${profile.port}`;
    // Use processManager abstraction
    const status = processManager.getStatus(key);
    const proc = (processManager as any).processes?.[key];
    return {
      key,
      running: !!proc,
      startTime: proc ? proc.startTime : null,
      manuallyStopped: !!profile.manuallyStopped,
      autoStart: !!profile.autoStart,
      baseInstallId: profile.baseInstallId || null
    };
  });
  res.json({ status });
});

// Only start the server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  server.listen(config.webserver.port, config.webserver.host, () => {
    console.log(`Server running at http://${config.webserver.host}:${config.webserver.port}`);
  });
}
