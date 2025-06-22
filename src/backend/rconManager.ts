

import { EventEmitter } from 'events';
import { getProfiles } from './profiles';
import { Rcon } from 'rcon-client';


interface ServerProfile {
  name: string;
  host: string;
  port: number;
  password: string;
  game?: string;
  features?: {
    currentPlayers?: {
      enabled: boolean;
      updateInterval: number;
    }
  };
  layout?: {
    sidebarWidth?: number;
    currentPlayersWidth?: number;
  };
}

interface ConnectionState {
  status: 'connected' | 'disconnected' | 'connecting';
  since: number;
  rcon?: Rcon;
}

export class RconManager extends EventEmitter {
  private connections: Map<string, ConnectionState> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private disconnectedSince: Map<string, number> = new Map();

  constructor() {
    super();
    this.loadProfiles();
  }

  loadProfiles() {
    const profiles: ServerProfile[] = getProfiles();
    for (const profile of profiles) {
      this.ensureConnection(profile);
      this.setupFeaturePolling(profile);
    }
  }

  setupFeaturePolling(profile: ServerProfile) {
    const key = profile.host + ':' + profile.port;
    // Clear any previous polling
    if (this.pollingIntervals.has(key)) {
      clearInterval(this.pollingIntervals.get(key));
      this.pollingIntervals.delete(key);
    }

    // --- Current Players Polling ---
    if (
      profile.features &&
      profile.features.currentPlayers &&
      profile.features.currentPlayers.enabled &&
      profile.game &&
      (profile.game === 'ark_se' || profile.game === 'ark_sa')
    ) {
      const interval = Math.max(2, profile.features.currentPlayers.updateInterval || 10);
      const pollPlayers = async () => {
        const conn = this.connections.get(key);
        if (conn && conn.status === 'connected' && conn.rcon) {
          try {
            const output = await conn.rcon.send('ListPlayers');
            this.emit('currentPlayers', key, output);
          } catch (e) {}
        }
      };
      this.pollingIntervals.set(key, setInterval(pollPlayers, interval * 1000));
      // Fire immediately
      pollPlayers();
    }

    // --- Chat Polling ---
    // Always poll for chat if ARK SE/SA, regardless of currentPlayers feature
    if (profile.game && (profile.game === 'ark_se' || profile.game === 'ark_sa')) {
      // Use same interval as currentPlayers if available, else default 5s
      const chatInterval = 1;
      // Store last chat message to avoid duplicates
      let lastChatRaw: string | undefined = undefined;
      const pollChat = async () => {
        const conn = this.connections.get(key);
        if (conn && conn.status === 'connected' && conn.rcon) {
          try {
            const output = await conn.rcon.send('getchat');
            const trimmed = (output || '').replace(/\r/g, '').replace(/\n/g, '').trim();
            if (trimmed && trimmed !== 'Server received, But no response!!') {// && trimmed !== lastChatRaw) {
              lastChatRaw = trimmed;
              this.emit('chatMessage', key, output.trim());
            }
          } catch (e) {}
        }
      };
      // Use a separate interval for chat polling
      setInterval(pollChat, chatInterval * 1000);
    }
  }

  ensureConnection(profile: ServerProfile) {
    const key = profile.host + ':' + profile.port;
    if (this.connections.has(key)) return;
    this.connect(profile);
  }

  async connect(profile: ServerProfile) {
    const key = profile.host + ':' + profile.port;
    this.connections.set(key, { status: 'connecting', since: Date.now() });
    this.emit('status', key, { status: 'connecting', since: Date.now() });
    try {
      const rcon = new Rcon({ host: profile.host, port: profile.port, password: profile.password });
      await rcon.connect();
      // On successful connect, clear disconnectedSince
      if (this.disconnectedSince.has(key)) {
        this.disconnectedSince.delete(key);
      }
      this.connections.set(key, { status: 'connected', since: Date.now(), rcon });
      this.emit('status', key, { status: 'connected', since: Date.now() });
      rcon.on('end', () => this.handleDisconnect(profile));
      rcon.on('error', () => this.handleDisconnect(profile));
    } catch (e) {
      this.handleDisconnect(profile);
    }
  }

async handleDisconnect(profile: ServerProfile) {
    const key = profile.host + ':' + profile.port;
    const state = this.connections.get(key);
    try {
      if (state && state.rcon) {
        // Remove only the listeners we added
        state.rcon.off('end', () => this.handleDisconnect(profile));
        state.rcon.off('error', () => this.handleDisconnect(profile));
        // Call end only once and await it
        await state.rcon.end();
        //// Remove rcon instance to prevent double end
        //delete state.rcon;
      }
    } catch (err) {
      // Log error but do not crash
      console.error('[RCON DISCONNECT ERROR]', err);
    }
    let since = Date.now();
    if (this.disconnectedSince.has(key)) {
      since = this.disconnectedSince.get(key)!;
    } else {
      this.disconnectedSince.set(key, since);
    }
    this.connections.set(key, { status: 'disconnected', since });
    this.emit('status', key, { status: 'disconnected', since });
    // Attempt reconnect every 5 seconds
    if (!this.reconnectTimers.has(key)) {
      const timer = setInterval(() => this.connect(profile), 5000);
      this.reconnectTimers.set(key, timer);
    }
  }

  async sendCommand(key: string, command: string): Promise<string> {
    const state = this.connections.get(key);
    if (state && state.status === 'connected' && state.rcon) {
      try {
        const result = await state.rcon.send(command);
        return result.replace('\r', '').replace('\n', '\r\n').trimEnd();
      } catch (e) {
        return '[RCON ERROR] ' + (e instanceof Error ? e.message : String(e));
      }
    }
    return '[RCON] Not connected';
  }

  removeConnection(profile: ServerProfile) {
    const key = profile.host + ':' + profile.port;
    this.connections.delete(key);
    if (this.reconnectTimers.has(key)) {
      clearInterval(this.reconnectTimers.get(key));
      this.reconnectTimers.delete(key);
    }
  }

  getStatus() {
    return Array.from(this.connections.entries()).map(([key, state]) => ({ key, ...state }));
  }
}
