import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';

import { getProfiles, saveProfiles } from './profiles';
import { RconManager } from './rconManager';
import iniApi from './iniApi';
import { serveArkSettingsTemplate } from './serveArkSettingsTemplate';
import { ensureSocketServer, sendAdminSocketCommand } from './adminSocketClient';
import { exit } from 'process';

const configPath = path.join(__dirname, '../../config.json');
const defaultConfig = {
  webserver: {
    host: '127.0.0.1',
    port: 3000
  },
  servers: []
};
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

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


const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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


// RCON Manager instance
const rconManager = new RconManager();

// Serve static files
app.use(express.static(path.join(__dirname, '../../public')));
// Serve ARK settings template JSON
serveArkSettingsTemplate(app);
// INI API
app.use(iniApi);

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
  const playersListener = (key: string, output: string) => {
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
// WebSocket: send status updates to clients
// On WebSocket connection, send all session logs to the client
wss.on('connection', (ws) => {
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




  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
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
      }
    } catch {}
  });

  ws.on('close', () => {
    rconManager.off('status', statusListener);
  });
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

server.listen(config.webserver.port, config.webserver.host, () => {
  console.log(`Server running at http://${config.webserver.host}:${config.webserver.port}`);
});
