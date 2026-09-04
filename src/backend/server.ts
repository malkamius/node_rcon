// Wire up getProcessStatuses for getProfiles
import { setGetProcessStatuses, getProfiles, saveProfiles } from './profiles';
const processStatuses: Record<string, ProcessStatus> = {};
setGetProcessStatuses(() => processStatuses);
// File: src/backend/server.ts
import express, { Request, Response } from 'express';
import { ArkSAProcessManager, ProcessManager, ServerProcessProfile, ProcessStatus } from './ProcessManager';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';


import { RconManager } from './rconManager';
import * as rconScriptEngine from './rconScriptEngine';
import { getScriptTemplates, getScriptTemplateById, saveScriptTemplate, deleteScriptTemplate } from './scriptTemplates';
import { listServerLogFiles, tailServerLog, getLogFilePath } from './serverLogsApi';
import iniApi from './iniApi';
import { serveArkSettingsTemplate } from './serveArkSettingsTemplate';
import { ensureSocketServer } from './adminSocketClient';
import { exit } from 'process';
import { exec, spawn } from 'child_process';
import { authMiddleware, registerAuth, getAuthenticatedUser, AuthUser } from './auth';
import {
  parseAcfBuildId,
  getAcfBuildIdFromDir,
  fetchSteamLatestBuildId,
  evaluateBaseInstalls,
  findLinkedBaseInstall,
  BaseInstallInfo
} from './steamUpdateNotifier';

const configPath = path.join(__dirname, '../../config.json');
const defaultConfig = {
  webserver: {
    host: '127.0.0.1',
    port: 3000
  },
  profiles: [],
  steamcmdPath: '',
  baseInstallUpdateCheckInterval: 10000, // 10 seconds default
  baseInstalls: []
};
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const app = express();
export { app };
app.use(express.json());
registerAuth(app, config, configPath);
app.use(authMiddleware(config));

// --- Audit Logging Utility ---

// --- Instance Install API removed: now handled by WebSocket and adminSocketClient for admin permissions ---
const AUDIT_LOG_PATH = require('path').join(__dirname, '../../logs/audit.log');
function auditLog(event: string, details: any) {
  const entry = {
    time: new Date().toISOString(),
    event,
    ...details
  };
  require('fs').appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
}


export function getBaseInstall(InstancePath: string): Promise<string | Error> {
  const fsPromises = require('fs').promises;
  const PathTocheck = InstancePath + "\\steamapps";
  return fsPromises.stat(PathTocheck)
    .then((stat: any) => {
      if (!stat.isDirectory()) {
        throw new Error('Path exists but is not a directory: ' + PathTocheck);
      }
      // Resolve symlinks/junctions
      return fsPromises.realpath(PathTocheck);
    })
    .then((realPath: string) => {
      // Return the parent directory of the resolved steamapps path
      return path.dirname(realPath);
    })
    .catch((err: any) => {
      return Promise.reject(err);
    });
}

async function getBaseInstallsFromProfiles() {
  const profiles = getProfiles();
  if(!config.baseInstalls) config.baseInstalls = [];
  for (const profile of profiles) {
    if (profile.game === 'ark_sa' && profile.directory) {
      await getBaseInstall(profile.directory).then(basePath => {
        const resolvedPath = String(basePath);
        if(!config.baseInstalls.some((b: any) => b.path === resolvedPath)) {
          config.baseInstalls.push({ id: resolvedPath, path: resolvedPath, version: null, lastUpdated: null, updateAvailable: false, latestBuildId: null });
          profile.baseInstallPath = resolvedPath; // Store in profile for easy access
        }
      }).catch(_error => {
        // Directory may not exist yet or in test environments; ignore silently
      });
    }
  }
}

(async () => {
  await getBaseInstallsFromProfiles().catch(() => {});
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
  processManager.autoStart(serverProfiles.filter(p => p.game === 'ark_sa' && p.directory && (p.manuallyStopped !== true)));
}

if (process.env.NODE_ENV !== 'test') {
  autoStartServersOnStartup();
}

// Expose processManager for use in other modules (e.g., script engine)
export { processManager };

// --- Periodic Base Install Update Check ---
let latestBuildId: string | null = null;

async function fetchLatestBuildId() {
  const buildId = await fetchSteamLatestBuildId();
  if (buildId) {
    latestBuildId = buildId;
  }
  return latestBuildId;
}

async function checkBaseInstallUpdates(forceFetch: boolean = true) {
  if (forceFetch || !latestBuildId) {
    await fetchLatestBuildId();
  }
  config.baseInstalls = config.baseInstalls || [];
  const { updatedList, hasChanges } = evaluateBaseInstalls(config.baseInstalls, latestBuildId);
  config.baseInstalls = updatedList;

  if (hasChanges) {
    require('fs').writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    // Broadcast base install updates to connected frontend clients
    broadcast('baseInstallsUpdated', { baseInstalls: config.baseInstalls, latestBuildId });
    // Also notify that server profile update flags may have shifted
    broadcast('profilesChanged', { profiles: getProfiles() });
  }
  return { baseInstalls: config.baseInstalls, latestBuildId, hasChanges };
}


// Start periodic check after config is declared (must be after config is defined)
let baseInstallUpdateTimer: NodeJS.Timeout | null = null;
function startBaseInstallUpdateInterval() {
  if (baseInstallUpdateTimer) clearInterval(baseInstallUpdateTimer);
  baseInstallUpdateTimer = setInterval(checkBaseInstallUpdates, config.baseInstallUpdateCheckInterval || 10000);
  if (baseInstallUpdateTimer.unref) {
    baseInstallUpdateTimer.unref();
  }
  checkBaseInstallUpdates();
}

// At the end of config declaration, start the interval (but not in test mode)
if (process.env.NODE_ENV !== 'test') {
  startBaseInstallUpdateInterval();
}

// async function ensureSocket()
// {
//   return ensureSocketServer();
// }

// ensureSocket().catch(err => {
//   console.error('Error ensuring admin socket server:', err);
//   exit(1);
// });


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

// Trigger on-demand check for base install updates
app.post('/api/check-updates', async (req: Request, res: Response) => {
  try {
    const result = await checkBaseInstallUpdates(true);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to check updates' });
  }
});

// List base installs
app.get('/api/base-installs', (req: Request, res: Response) => {
  res.json({ baseInstalls: config.baseInstalls || [], latestBuildId });
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
export { rconManager };
rconScriptEngine.setRconManager(rconManager);
rconScriptEngine.setProcessManager(processManager);
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

// POST /api/broadcast-command { keys: string[], command: string }
app.post('/api/broadcast-command', express.json(), async (req: Request, res: Response) => {
  const { keys, command } = req.body || {};

  if (!Array.isArray(keys) || keys.length === 0 || !keys.every(k => typeof k === 'string' && k.trim().length > 0)) {
    return res.status(400).json({ error: 'keys must be an array with at least 1 non-empty string' });
  }

  if (typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({ error: 'command must be a non-empty string' });
  }

  for (const key of keys) {
    const commandLine = {
      text: '> ' + command,
      timestamp: Date.now(),
      type: 'command' as const,
    };
    if (!sessionLines[key]) {
      sessionLines[key] = loadSessionLinesFromDisk(key);
    }
    sessionLines[key].push(commandLine);
    if (sessionLines[key].length > SESSION_LINES_MAX) {
      sessionLines[key] = sessionLines[key].slice(-SESSION_LINES_MAX);
    }
    saveSessionLinesToDisk(key, sessionLines[key]);
    broadcast('sessionLine', { key, line: commandLine });
  }

  const promiseResults = await Promise.allSettled(
    keys.map(key => rconManager.sendCommand(key, command))
  );

  const results: Array<{ key: string; output: string; status: string }> = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const resItem = promiseResults[i];
    let output = '';
    if (resItem.status === 'fulfilled') {
      output = typeof resItem.value === 'string' ? resItem.value : String(resItem.value ?? '');
    } else {
      output = '[RCON ERROR] ' + (resItem.reason?.message || String(resItem.reason));
    }

    let status = 'success';
    if (output === '[RCON] Not connected' || output.startsWith('[RCON] Not connected')) {
      status = 'disconnected';
    } else if (output.startsWith('[RCON ERROR]')) {
      status = 'error';
    } else {
      status = 'success';
    }

    if (typeof output === 'string' && output.trim()) {
      const outputLine = {
        text: output,
        timestamp: Date.now(),
        type: 'output' as const,
      };
      if (!sessionLines[key]) {
        sessionLines[key] = loadSessionLinesFromDisk(key);
      }
      sessionLines[key].push(outputLine);
      if (sessionLines[key].length > SESSION_LINES_MAX) {
        sessionLines[key] = sessionLines[key].slice(-SESSION_LINES_MAX);
      }
      saveSessionLinesToDisk(key, sessionLines[key]);
      broadcast('sessionLine', { key, line: outputLine });
    }

    results.push({ key, output, status });
  }

  auditLog('broadcastCommand', { count: keys.length, keys, command });

  res.json({ ok: true, command, results });
});

// --- Script Templates API ---
// GET /api/scripts
app.get('/api/scripts', (req, res) => {
  try {
    const templates = getScriptTemplates();
    res.json({ templates });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// POST /api/scripts { id?, name, description?, content }
app.post('/api/scripts', express.json(), (req, res) => {
  const { id, name, description, content } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim() || content === undefined || content === null || typeof content !== 'string' || !content.trim()) {
    auditLog('saveScriptTemplate_error', { id, name, error: 'Name and content are required' });
    return res.status(400).json({ error: 'Name and content are required' });
  }
  try {
    const template = saveScriptTemplate({ id, name, description, content });
    auditLog('saveScriptTemplate', { id: template.id, name: template.name });
    res.json({ ok: true, template });
  } catch (err: any) {
    auditLog('saveScriptTemplate_error', { id, name, error: err?.message || String(err) });
    res.status(400).json({ error: err?.message || String(err) });
  }
});

// DELETE /api/scripts/:id
app.delete('/api/scripts/:id', (req, res) => {
  const { id } = req.params;
  const existing = getScriptTemplateById(id);
  if (existing?.isBuiltIn) {
    auditLog('deleteScriptTemplate_error', { id, error: 'Cannot delete built-in template' });
    return res.status(400).json({ error: 'Cannot delete built-in template' });
  }
  if (!existing) {
    auditLog('deleteScriptTemplate_error', { id, error: 'Template not found' });
    return res.status(404).json({ error: 'Template not found' });
  }
  const deleted = deleteScriptTemplate(id);
  if (!deleted) {
    auditLog('deleteScriptTemplate_error', { id, error: 'Failed to delete template' });
    return res.status(400).json({ error: 'Failed to delete template' });
  }
  auditLog('deleteScriptTemplate', { id });
  res.json({ ok: true });
});

// POST /api/open-directory { key?, directory? }
app.post('/api/open-directory', express.json(), (req, res) => {
  const { key, directory } = req.body;
  let targetDir = directory;

  if (!targetDir && key) {
    const profiles = getProfiles();
    const server = profiles.find((p: any) => `${p.host}:${p.port}` === key);
    if (server && server.directory) {
      targetDir = server.directory;
    }
  }

  if (!targetDir || typeof targetDir !== 'string') {
    auditLog('openDirectory_error', { key, error: 'Missing or invalid directory' });
    return res.status(400).json({ error: 'Server directory is not configured' });
  }

  const normalizedDir = path.resolve(targetDir);
  if (!fs.existsSync(normalizedDir)) {
    auditLog('openDirectory_error', { key, directory: normalizedDir, error: 'Directory does not exist on disk' });
    return res.status(404).json({ error: `Directory does not exist: ${normalizedDir}` });
  }

  try {
    const child = spawn('explorer.exe', [normalizedDir], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    auditLog('openDirectory', { key, directory: normalizedDir });
    res.json({ ok: true });
  } catch (err: any) {
    auditLog('openDirectory_error', { key, directory: normalizedDir, error: String(err) });
    res.status(500).json({ error: `Failed to open directory: ${err?.message || String(err)}` });
  }
});

// --- Server Crash & Engine Log Viewer API ---

// GET /api/server-logs/:key - List all log files for a server instance
app.get('/api/server-logs/:key', async (req: Request, res: Response) => {
  const { key } = req.params;
  const profiles = getProfiles();
  const server = profiles.find((p: any) => `${p.host}:${p.port}` === key);
  if (!server) {
    return res.status(404).json({ error: 'Server profile not found' });
  }
  if (!server.directory) {
    return res.status(400).json({ error: 'Server directory not configured' });
  }

  try {
    const files = await listServerLogFiles(server.directory);
    res.json({ files, directory: server.directory });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to list server log files' });
  }
});

// GET /api/server-logs/:key/tail - Tail lines from a specific log file
app.get('/api/server-logs/:key/tail', async (req: Request, res: Response) => {
  const { key } = req.params;
  const file = (req.query.file as string) || 'ShooterGame.log';
  const lines = req.query.lines ? parseInt(req.query.lines as string, 10) : 200;
  const filter = (req.query.filter as string) || '';

  const profiles = getProfiles();
  const server = profiles.find((p: any) => `${p.host}:${p.port}` === key);
  if (!server) {
    return res.status(404).json({ error: 'Server profile not found' });
  }
  if (!server.directory) {
    return res.status(400).json({ error: 'Server directory not configured' });
  }

  try {
    const result = await tailServerLog(server.directory, file, { lines, search: filter });
    res.json(result);
  } catch (err: any) {
    const status = err?.message?.includes('not found') ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Failed to tail log file' });
  }
});

// GET /api/server-logs/:key/download - Download full log file
app.get('/api/server-logs/:key/download', (req: Request, res: Response) => {
  const { key } = req.params;
  const file = (req.query.file as string) || 'ShooterGame.log';

  const profiles = getProfiles();
  const server = profiles.find((p: any) => `${p.host}:${p.port}` === key);
  if (!server) {
    return res.status(404).json({ error: 'Server profile not found' });
  }
  if (!server.directory) {
    return res.status(400).json({ error: 'Server directory not configured' });
  }

  try {
    const fullPath = getLogFilePath(server.directory, file);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `Log file not found: ${file}` });
    }
    res.download(fullPath, file, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to download log file' });
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Invalid log file request' });
  }
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

    let playerRawList: string[] = [];
    if (output === null || output === undefined || output.trim() === 'No Players Connected' || output.trim() === 'No players online') {
      playerRawList = [];
    } else if (output.includes('\n')) {
      playerRawList = output.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
    } else if (output.includes(',')) {
      playerRawList = output.split(',').map(p => p.trim()).filter(Boolean);
    } else if (output.trim()) {
      playerRawList = [output.trim()];
    }
    // Remove player index (e.g., '0. ') from each player string
    playerRawList = playerRawList.map(p => p.replace(/^\d+\.\s*/, ''));

    // Parse player name and guid if present (format: "Name, GUID")
    type PlayerObj = { name: string, guid?: string, raw: string };
    const playerObjs: PlayerObj[] = playerRawList.map(raw => {
      // Try to split by comma, but only if there are two parts and the second looks like a guid
      const parts = raw.split(',').map(s => s.trim());
      if (parts.length === 2 && /^[0-9a-f]{16,}$/.test(parts[1].replace(/-/g, ''))) {
        return { name: parts[0], guid: parts[1], raw };
      } else {
        return { name: raw, raw };
      }
    });

    // For currentPlayers, only use the name
    const playerNames = playerObjs.map(p => p.name);
    if (!connectedPlayers[key]) connectedPlayers[key] = new Set();
    const prevPlayers = new Set(connectedPlayers[key]);
    const currentPlayers = new Set(playerNames);

    // Detect joins
    for (const p of playerObjs) {
      if (!prevPlayers.has(p.name)) {
        // Player joined
        // Show full string (name and guid if present) in the message
        const msg = `PLAYER CONNECTED: ${p.raw}`;
        const line: { text: string; timestamp: number; type: 'output'; guid?: string } = { text: msg, timestamp: Date.now(), type: 'output' };
        if (p.guid) line.guid = p.guid;
        if (!sessionLines[key]) sessionLines[key] = [];
        sessionLines[key].push(line);
        if (sessionLines[key].length > SESSION_LINES_MAX) {
          sessionLines[key] = sessionLines[key].slice(-SESSION_LINES_MAX);
        }
        broadcast('sessionLine', { key, line });
      }
    }
    // Detect leaves
    for (const prevName of prevPlayers) {
      if (!currentPlayers.has(prevName)) {
        // Try to find the raw string for the leaving player (if present in previous set)
        // If not found, just use the name
        const prevObj = playerObjs.find(p => p.name === prevName);
        const raw = prevObj ? prevObj.raw : prevName;
        const msg = `PLAYER DISCONNECTED: ${raw}`;
        const line: { text: string; timestamp: number; type: 'output'; guid?: string } = { text: msg, timestamp: Date.now(), type: 'output' };
        if (prevObj && prevObj.guid) line.guid = prevObj.guid;
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

    // Still broadcast the currentPlayers list as before (names only)
    broadcast('currentPlayers', { key, currentPlayers: Array.from(currentPlayers) });
  };
  rconManager.on('currentPlayers', playersListener);

  // Listen for chatMessage updates
  const chatListener = (key: string, output: string) => {
    if (!sessionLines[key]) sessionLines[key] = [];

    // Remove \r, then split on \n
    const lines = output.replace(/\r/g, '').split('\n');
    const newLineEntries: { text: string; timestamp: number; type: 'output' }[] = [];

    for (let rawLine of lines) {
      if (!rawLine.trim()) continue;
      let text = rawLine;
      let timestamp = Date.now();
      // Check for timestamp at start: [2025-09-14T14:27:46.100Z]
      const tsMatch = rawLine.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\]\s*(.*)$/);
      if (tsMatch) {
        const parsed = Date.parse(tsMatch[1]);
        if (!isNaN(parsed)) timestamp = parsed;
        text = tsMatch[2];
      }
    const lineEntry: { text: string; timestamp: number; type: 'output' } = { text, timestamp, type: 'output' };
    sessionLines[key].push(lineEntry);
    newLineEntries.push(lineEntry);
    }
    if (sessionLines[key].length > SESSION_LINES_MAX) {
      sessionLines[key] = sessionLines[key].slice(-SESSION_LINES_MAX);
    }
    saveSessionLinesToDisk(key, sessionLines[key]);
    // Broadcast each new line
    for (const line of newLineEntries) {
      broadcast('sessionLine', { key, line });
    }
  };
  rconManager.on('chatMessage', chatListener);

// Store process statuses by key

processManager.on('processStatus', (key: string, status: ProcessStatus) => {
  // Polling emits lightweight updates such as `{ running: false }`. Keep
  // the persisted manual-stop reason attached to every status update.
  const profile = getProfiles().find((p: any) => `${p.host}:${p.port}` === key);
  const enrichedStatus = { ...status, manuallyStopped: profile?.manuallyStopped === true };
  processStatuses[key] = enrichedStatus;
  broadcast('processStatus', { key, status: enrichedStatus });
});

processManager.on('serverCrash', (key: string, details: any) => {
  auditLog('server_crash', { key, ...details });
  // Add a system notice line to session lines
  const noticeText = `[CRASH ALERT] Server process exited unexpectedly${details.code !== undefined ? ` (exit code: ${details.code})` : ''} at ${new Date().toLocaleTimeString()}`;
  const crashLine: { text: string; timestamp: number; type: 'output' } = {
    text: noticeText,
    timestamp: Date.now(),
    type: 'output'
  };
  if (!sessionLines[key]) sessionLines[key] = [];
  sessionLines[key].push(crashLine);
  if (sessionLines[key].length > SESSION_LINES_MAX) {
    sessionLines[key] = sessionLines[key].slice(-SESSION_LINES_MAX);
  }
  saveSessionLinesToDisk(key, sessionLines[key]);
  broadcast('sessionLine', { key, line: crashLine });
  broadcast('serverCrash', { key, ...details });
});

processManager.startPeriodicStatusCheck(10000); // Check every 10 seconds

// WebSocket: send status updates to clients
// On WebSocket connection, send all session logs to the client

// --- WebSocket Message Handler Refactor ---
import { SessionHandler } from './handlers/SessionHandler';
import { ProfileHandler } from './handlers/ProfileHandler';
import { BaseInstallHandler } from './handlers/BaseInstallHandler';
import { IniHandler } from './handlers/IniHandler';


// Wire up profiles broadcast for websocket notifications
import { setProfileChangedEvent, setConfigWatcher } from './profiles';
import { createConfigWatcher, ConfigWatcher } from './configWatcher';
setProfileChangedEvent((type: string, payload: any) => {
  rconManager.loadProfiles();
  broadcast(type, payload);
}); 

// Hot reload watcher for external config.json changes
const configWatcher = createConfigWatcher({
  configPath,
  debounceMs: 250,
  onProfilesChanged: (newProfiles, changedKeys) => {
    config.profiles = newProfiles;
    rconManager.loadProfiles();
    broadcast('profilesChanged', { changedKeys, profiles: getProfiles() });
  },
  onConfigChanged: (newConfig) => {
    const oldBaseInstalls = JSON.stringify(config.baseInstalls || []);
    Object.assign(config, newConfig);
    const newBaseInstalls = JSON.stringify(config.baseInstalls || []);
    if (oldBaseInstalls !== newBaseInstalls) {
      broadcast('baseInstallsUpdated', { baseInstalls: config.baseInstalls, latestBuildId });
    }
  },
  logger: console
});
setConfigWatcher(configWatcher);

if (process.env.NODE_ENV !== 'test') {
  configWatcher.start();
}
export { configWatcher };

// Context object to pass shared dependencies to handlers
const handlerContext = {
  sessionLines,
  loadSessionLinesFromDisk,
  saveSessionLinesToDisk,
  broadcast,
  rconManager,
  getProfiles,
  saveProfiles,
  setServerManuallyStopped,
  processManager,
  config,
  fs,
  configPath,
  auditLog,
  spawn: require('child_process').spawn,
  SESSION_LINES_MAX,
  checkBaseInstallUpdates,
  configWatcher
};

// Instantiate handler classes
const sessionHandler = new SessionHandler(handlerContext);
const profileHandler = new ProfileHandler(handlerContext);
const baseInstallHandler = new BaseInstallHandler(handlerContext);
// Set broadcast handler so progress/status messages go to all clients
baseInstallHandler.setBroadcastHandler((type, payload) => broadcast(type, payload));
const iniHandler = new IniHandler(handlerContext);

// Merge all handler maps into a master handler map
const masterHandlers: { [msgType: string]: (ws: any, msg: any) => Promise<void> } = {
  ...sessionHandler.handlers,
  ...profileHandler.handlers,
  ...baseInstallHandler.handlers,
  ...iniHandler.handlers,
};

wss.on('connection', (ws, req) => {
  const authUser = getAuthenticatedUser(req as any, config);
  if (!authUser) { ws.close(1008, 'Authentication required'); return; }
  (ws as any).authUser = authUser;
  const canAccess = (key: string) => authUser.role === 'admin' || authUser.role === 'server-admin' || (authUser.assignedInstanceKeys || []).includes(key);
  const visibleProfiles = () => getProfiles().filter((p: any) => canAccess(`${p.host}:${p.port}`));
  ws.send(JSON.stringify({ type: 'hello', message: 'WebSocket connected' }));
  // On connect, reload all session lines from disk for all known keys
  const allKeys = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl')).map(f => f.replace(/\.jsonl$/, '').replace(/_/g, ':')).filter(canAccess);
  for (const key of allKeys) {
    if (!sessionLines[key]) sessionLines[key] = loadSessionLinesFromDisk(key);
  }
  ws.send(JSON.stringify({ type: 'sessionLines', data: sessionLines }));
  ws.send(JSON.stringify({ type: 'status', data: rconManager.getStatus() }));
  const statusListener = (key: string, state: any) => {
    ws.send(JSON.stringify({ type: 'status', data: [{ key, ...state }] }));
  };
  rconManager.on('status', statusListener);
  ws.on('close', () => {
    rconManager.off('status', statusListener);
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const requestedKeys = Array.isArray(msg.keys) ? msg.keys : (msg.key ? [msg.key] : []);
      const profileForIndex = typeof msg.idx === 'number' ? getProfiles()[msg.idx] : null;
      if (profileForIndex) requestedKeys.push(`${profileForIndex.host}:${profileForIndex.port}`);
      if (requestedKeys.some((key: string) => !canAccess(key))) {
        ws.send(JSON.stringify({ type: 'error', error: 'You do not have access to this server', requestId: msg.requestId })); return;
      }
      if (msg.type === 'saveProfiles' && !['admin', 'server-admin'].includes(authUser.role)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Server administration access required', requestId: msg.requestId })); return;
      }
      if (msg.type === 'saveProfiles' && authUser.role !== 'admin') {
        const allowed = new Set((authUser.role === 'server-admin' ? getProfiles() : visibleProfiles()).map((p: any) => `${p.host}:${p.port}`));
        if ((msg.profiles || []).some((p: any) => !allowed.has(`${p.host}:${p.port}`))) { ws.send(JSON.stringify({ type: 'error', error: 'You cannot add or modify an unassigned server', requestId: msg.requestId })); return; }
      }
      const handler = masterHandlers[msg.type];
      if (handler) {
        await handler(ws, msg);
      } else {
        // Optionally, send error for unknown message type
        // ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
      }
    } catch (err) {
      // Optionally, send error for parse/handler errors
      // ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
    }
  });
});

// API: Get server profiles
app.get('/api/profiles', (req, res) => {
  // Attach process status and base install metadata to each profile
  const profiles = getProfiles();
  const baseInstalls: BaseInstallInfo[] = config.baseInstalls || [];
  const profilesWithStatus = profiles.map((p: any) => {
    const key = `${p.host}:${p.port}`;
    const linkedBase = findLinkedBaseInstall(p.directory, baseInstalls);
    const effectiveBaseInstallId = p.baseInstallId || linkedBase?.id || null;
    const effectiveBaseInstallPath = p.baseInstallPath || linkedBase?.path || null;
    const updateAvailable = !!linkedBase?.updateAvailable;

    return {
      ...p,
      baseInstallId: effectiveBaseInstallId,
      baseInstallPath: effectiveBaseInstallPath,
      baseInstallVersion: linkedBase?.version || null,
      latestBuildId: linkedBase?.latestBuildId || latestBuildId || null,
      updateAvailable,
      processStatus: processStatuses[key] || null
    };
  });
  res.json(profilesWithStatus);
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
  const baseInstalls: BaseInstallInfo[] = config.baseInstalls || [];
  const status = profiles.map((profile: any) => {
    const key = `${profile.host}:${profile.port}`;
    // Use processManager abstraction
    const status = processManager.getStatus(key);
    const proc = (processManager as any).processes?.[key];
    const linkedBase = findLinkedBaseInstall(profile.directory, baseInstalls);
    const effectiveBaseInstallId = profile.baseInstallId || linkedBase?.id || null;
    const updateAvailable = !!linkedBase?.updateAvailable;

    return {
      key,
      running: !!proc && !proc.crashed,
      startTime: proc ? proc.startTime : null,
      crashed: !!proc?.crashed,
      exitCode: proc ? proc.exitCode : null,
      manuallyStopped: !!profile.manuallyStopped,
      autoStart: !!profile.autoStart,
      baseInstallId: effectiveBaseInstallId,
      updateAvailable
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
