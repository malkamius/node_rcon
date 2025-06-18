

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import { getProfiles, saveProfiles } from './profiles';
import { RconManager } from './rconManager';

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

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// RCON Manager instance
const rconManager = new RconManager();

// Serve static files
app.use(express.static(path.join(__dirname, '../../public')));

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

// WebSocket: send status updates to clients
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', message: 'WebSocket connected' }));
  // Send current status
  ws.send(JSON.stringify({ type: 'status', data: rconManager.getStatus() }));
  // Listen for status changes
  const statusListener = (key: string, state: any) => {
    ws.send(JSON.stringify({ type: 'status', data: [{ key, ...state }] }));
  };
  rconManager.on('status', statusListener);

  // Listen for currentPlayers updates
  const playersListener = (key: string, output: string) => {
    broadcast('currentPlayers', { key, output });
  };
  rconManager.on('currentPlayers', playersListener);

  // Listen for chatMessage updates
  const chatListener = (key: string, output: string) => {
    broadcast('chatMessage', { key, output });
  };
  rconManager.on('chatMessage', chatListener);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'command' && msg.key && typeof msg.command === 'string') {
        // Use real RCON connection
        const output = await rconManager.sendCommand(msg.key, msg.command);
        ws.send(JSON.stringify({ type: 'output', key: msg.key, output }));
      }
    } catch {}
  });

  ws.on('close', () => {
    rconManager.off('status', statusListener);
    rconManager.off('currentPlayers', playersListener);
    rconManager.off('chatMessage', chatListener);
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
  saveProfiles(req.body);
  // Reload RCON connections
  rconManager.loadProfiles();
  res.json({ success: true });
});

server.listen(config.webserver.port, config.webserver.host, () => {
  console.log(`Server running at http://${config.webserver.host}:${config.webserver.port}`);
});
