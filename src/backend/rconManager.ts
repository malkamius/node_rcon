

import { EventEmitter } from 'events';
import { getProfiles } from './profiles';
import { Rcon } from 'rcon-client';



export interface ServerProfile {
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
  directory?: string;
  autoStart?: boolean;
  manuallyStopped?: boolean;
  baseInstallId?: string;
}

export interface BaseInstallProfile {
  id: string;
  path: string;
  version: string;
  lastUpdated: Date;
  // Add any additional metadata as needed
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

  // Per-profile mutexes
  private locks: Map<string, Promise<void>> = new Map();
  private lockResolvers: Map<string, () => void> = new Map();

  // Acquire a lock for a given key (profile)
  private async acquireLock(key: string): Promise<void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let resolver: () => void;
    const p = new Promise<void>(resolve => { resolver = resolve; });
    this.locks.set(key, p);
    this.lockResolvers.set(key, resolver!);
  }

  // Release a lock for a given key (profile)
  private releaseLock(key: string): void {
    if (this.lockResolvers.has(key)) {
      this.lockResolvers.get(key)!();
      this.lockResolvers.delete(key);
      this.locks.delete(key);
    }
  }

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
      const interval = Math.max(2, profile.features.currentPlayers.updateInterval || 1);
      const pollPlayers = async () => {
        const conn = this.connections.get(key);
        if (conn && conn.status === 'connected' && conn.rcon) {
          try {
            const output = await conn.rcon.send('ListPlayers');
            this.emit('currentPlayers', key, output);
          } catch (e) {
            console.error('Error polling current players for', key, e);
          }
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
          } catch (e) {
            console.error('Error polling chat for', key, e);
          }
        }
      };
      // Use a separate interval for chat polling
      setInterval(pollChat, chatInterval * 1000);
    }
  }

  ensureConnection(profile: ServerProfile) {
    const key = profile.host + ':' + profile.port;
    if (this.connections.has(key)) {
      //console.log(`[RCON DEBUG] ensureConnection: Connection already exists for ${key}`);
      return;
    }
    //console.log(`[RCON DEBUG] ensureConnection: No connection for ${key}, calling connect`);
    this.connect(profile);
  }

  async connect(profile: ServerProfile) {
    //console.log(`[RCON DEBUG] connect: Called for ${profile.host}:${profile.port}`);
    //return;
    // --- The code below is currently short-circuited ---
    const key = profile.host + ':' + profile.port;
    await this.acquireLock(key);
    try {
      if (this.reconnectTimers.has(key)) {
        clearInterval(this.reconnectTimers.get(key));
        this.reconnectTimers.delete(key);
      }
      this.connections.set(key, { status: 'connecting', since: Date.now() });
      this.emit('status', key, { status: 'connecting', since: Date.now() });
      try {
        const rcon = new Rcon({ host: profile.host, port: profile.port, password: profile.password });
        rcon.on('end', () => this.handleDisconnect(profile));
        rcon.on('error', (err) => this.handleDisconnect(profile));
        await rcon.connect();
        // On successful connect, clear disconnectedSince
        if (this.disconnectedSince.has(key)) {
          this.disconnectedSince.delete(key);
        }
        this.connections.set(key, { status: 'connected', since: Date.now(), rcon });
        this.emit('status', key, { status: 'connected', since: Date.now() });
        
      } catch (e) {
        // Release lock before calling handleDisconnect to avoid deadlock
        this.releaseLock(key);
        await this.handleDisconnect(profile);
        return;
      }
    } finally {
      this.releaseLock(key);
    }
  }

  async handleDisconnect(profile: ServerProfile) {
    const key = profile.host + ':' + profile.port;
    await this.acquireLock(key);
    try {
      const state = this.connections.get(key);
      try {
        if (state && state.rcon) {
          // Remove rcon instance to prevent double end
          let rcon = state.rcon;
          delete state.rcon;
          // Remove only the listeners we added
          rcon.off('end', () => this.handleDisconnect(profile));
          rcon.off('error', () => this.handleDisconnect(profile));
          // Call end only once and await it
          if (rcon.socket && rcon.socket.writable) {
            await rcon.end();
          }
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
    } finally {
      this.releaseLock(key);
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
