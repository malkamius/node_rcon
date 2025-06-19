import { RconTerminalManager } from './rconTerminalManager';
/// <reference path="./react-app-env.d.ts" />

import React from 'react';
import { ServerManagementModal } from './ServerManagementModal';
import { DisconnectedModal } from './DisconnectedModal';
import { TabManager } from './TabManager';
import { TerminalArea } from './TerminalArea';
import { CurrentPlayersWindow } from './CurrentPlayersWindow';
import { ServerConfigTab } from './ServerConfigTab';

// Main App class for RCON Manager UI
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

type ActivityTab = 'rcon' | 'serverConfig';
interface RconClientAppState {
  command: string;
  commandHistory: string[];
  historyIndex: number | null;
  showHistoryDropdown: boolean;
  showServerModal: boolean;
  serverProfiles: ServerProfile[];
  statusMap: Record<string, { status: string; since: number }>;
  activeTab: string | null;
  sessionVersion: number;
  currentPlayers: Record<string, { players: string[]; lastUpdate: number | null }>;
  sidebarWidth?: number;
  currentPlayersWidth?: number;
  profileLayoutVersion?: number;
  disconnected?: boolean;
  activity: ActivityTab;
}

export class RconClientApp extends React.Component<{}, RconClientAppState> {
  sidebarWidthDefault = 220;
  currentPlayersWidthDefault = 240;
  sidebarResizing = false;
  currentPlayersResizing = false;
  sidebarStartX = 0;
  sidebarStartWidth = 0;
  currentPlayersStartX = 0;
  currentPlayersStartWidth = 0;
  terminalManager: RconTerminalManager;
  reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  loadServerProfiles = async () => {
    try {
      const res = await fetch('/api/profiles');
      if (res.ok) {
        const profiles = await res.json();
        this.setState({ serverProfiles: profiles });
      }
    } catch (e) {
      // Optionally show error in UI
      console.error('Failed to load server profiles', e);
    }
  };
  inputRef: React.RefObject<HTMLInputElement>;
  dropdownRef: React.RefObject<HTMLDivElement>;
  ws!: WebSocket | null;

  constructor(props: {}) {
    super(props);
    this.terminalManager = new RconTerminalManager();
    this.state = {
      command: '',
      commandHistory: [],
      historyIndex: null,
      showHistoryDropdown: false,
      showServerModal: false,
      serverProfiles: [],
      statusMap: {},
      activeTab: null,
      sessionVersion: 0,
      currentPlayers: {},
      profileLayoutVersion: 0,
      activity: 'rcon',
    };
    this.reconnectTimer = null;
    this.inputRef = React.createRef();
    this.dropdownRef = React.createRef();
  }

  async loadServerProfilesAndResetWidths() {
    await this.loadServerProfiles();
    // After loading, reset widths to force reload from profile
    this.setState({
      sidebarWidth: undefined,
      currentPlayersWidth: undefined
    });
  }

  componentDidMount() {
    this.loadServerProfilesAndResetWidths();
    this.connectWebSocket();
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
  }

  componentWillUnmount() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
  }
  // --- Layout Persistence ---
  getActiveProfileKey() {
    const { activeTab } = this.state;
    return activeTab;
  }  getSidebarWidth() {
    const min = 100, max = 400;
    let w = typeof this.state.sidebarWidth === 'number'
      ? this.state.sidebarWidth
      : (() => {
          const { activeTab, serverProfiles } = this.state;
          if (!activeTab) return this.sidebarWidthDefault;
          const profile = serverProfiles.find(p => `${p.host}:${p.port}` === activeTab);
          const profileWidth = (profile && profile.layout && profile.layout.sidebarWidth) || this.sidebarWidthDefault;
          console.log(`getSidebarWidth: activeTab=${activeTab}, profileWidth=${profileWidth}, stateWidth=${this.state.sidebarWidth}`);
          return profileWidth;
        })();
    return Math.max(min, Math.min(max, w));
  }

  getCurrentPlayersWidth() {
    const min = 120, max = 400;
    let w = typeof this.state.currentPlayersWidth === 'number'
      ? this.state.currentPlayersWidth
      : (() => {
          const { activeTab, serverProfiles } = this.state;
          if (!activeTab) return this.currentPlayersWidthDefault;
          const profile = serverProfiles.find(p => `${p.host}:${p.port}` === activeTab);
          const profileWidth = (profile && profile.layout && profile.layout.currentPlayersWidth) || this.currentPlayersWidthDefault;
          console.log(`getCurrentPlayersWidth: activeTab=${activeTab}, profileWidth=${profileWidth}, stateWidth=${this.state.currentPlayersWidth}`);
          return profileWidth;
        })();
    return Math.max(min, Math.min(max, w));
  }

  saveLayoutToBackend(layout: Partial<{ sidebarWidth: number; currentPlayersWidth: number }>) {
    const key = this.getActiveProfileKey();
    if (!key) return;
    fetch(`/api/layout/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    });
  }

  // --- Sidebar Resize ---
  handleSidebarResizeStart = (e: React.MouseEvent) => {
    this.sidebarResizing = true;
    this.sidebarStartX = e.clientX;
    this.sidebarStartWidth = this.getSidebarWidth();
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  };

  handleMouseMove = (e: MouseEvent) => {
    if (this.sidebarResizing) {
      const delta = e.clientX - this.sidebarStartX;
      let newWidth = Math.max(120, this.sidebarStartWidth + delta);
      this.setState({ sidebarWidth: newWidth });
    }
    if (this.currentPlayersResizing) {
      const delta = e.clientX - this.currentPlayersStartX;
      let newWidth = Math.max(120, this.currentPlayersStartWidth + delta);
      this.setState({ currentPlayersWidth: newWidth });
    }
  };

  handleMouseUp = () => {
    if (this.sidebarResizing) {
      this.sidebarResizing = false;
      document.body.style.cursor = '';
      if (typeof this.state.sidebarWidth === 'number') {
        this.saveLayoutToBackend({ sidebarWidth: this.state.sidebarWidth });
        // Update in-memory profile
        this.updateProfileLayout('sidebarWidth', this.state.sidebarWidth);
      }
    }
    if (this.currentPlayersResizing) {
      this.currentPlayersResizing = false;
      document.body.style.cursor = '';
      if (typeof this.state.currentPlayersWidth === 'number') {
        this.saveLayoutToBackend({ currentPlayersWidth: this.state.currentPlayersWidth });
        // Update in-memory profile
        this.updateProfileLayout('currentPlayersWidth', this.state.currentPlayersWidth);
      }
    }
  };

  updateProfileLayout = (key: 'sidebarWidth' | 'currentPlayersWidth', value: number) => {
    const { activeTab, serverProfiles } = this.state;
    if (!activeTab) return;
    const idx = serverProfiles.findIndex(p => `${p.host}:${p.port}` === activeTab);
    if (idx === -1) return;
    const profile = serverProfiles[idx];
    const newProfile = {
      ...profile,
      layout: {
        ...profile.layout,
        [key]: value
      }
    };
    const newProfiles = serverProfiles.slice();
    newProfiles[idx] = newProfile;
    // Clear the state value so the getter uses the updated profile, then force re-render
    this.setState(prev => ({
      serverProfiles: newProfiles,
      sidebarWidth: key === 'sidebarWidth' ? undefined : prev.sidebarWidth,
      currentPlayersWidth: key === 'currentPlayersWidth' ? undefined : prev.currentPlayersWidth,
      sessionVersion: prev.sessionVersion + 1,
      profileLayoutVersion: (prev.profileLayoutVersion || 0) + 1
    }));
  };

  // --- Current Players Resize ---
  handleCurrentPlayersResizeStart = (e: React.MouseEvent) => {
    this.currentPlayersResizing = true;
    this.currentPlayersStartX = e.clientX;
    this.currentPlayersStartWidth = this.getCurrentPlayersWidth();
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  };

  connectWebSocket = () => {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = new window.WebSocket(`ws://${window.location.host}`);
    this.ws.onopen = () => {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.setState({ disconnected: false });
    };
    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status') {
          this.setState((prev) => {
            const statusMap = { ...prev.statusMap };
            for (const s of msg.data) {
              statusMap[s.key] = { status: s.status, since: s.since };
            }
            return { statusMap };
          });
        } else if (msg.type === 'output' && msg.key && typeof msg.output === 'string') {
          this.terminalManager.appendLine(msg.key, msg.output.replace(/\r?\n/g, '\r\n'));
          this.setState((prev) => ({ sessionVersion: prev.sessionVersion + 1 }));
        } else if (msg.type === 'chatMessage' && msg.key && typeof msg.output === 'string') {
          // Append chat message to terminal for the session
          this.terminalManager.appendLine(msg.key, msg.output.replace(/\r?\n/g, '\r\n'));
          // If this is the active tab, force terminal refresh
          if (this.state.activeTab === msg.key) {
            this.setState(prev => ({ sessionVersion: prev.sessionVersion + 1 }));
          }
        } else if (msg.type === 'currentPlayers' && msg.key && typeof msg.output === 'string') {
          // Parse ARK ListPlayers output
          const lines = msg.output.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
          // ARK: ListPlayers output: first line is count, then lines like "1. SteamName, id"
          let players: string[] = [];
          for (const line of lines) {
            if (/^\d+\s+players?\s+connected/i.test(line)) continue;
            const m = line.match(/^\d+\.\s*(.*)$/);
            if (m) players.push(m[1]);
          }
          this.setState(prev => {
            const prevPlayers = prev.currentPlayers[msg.key]?.players || [];
            const lastUpdate = prev.currentPlayers[msg.key]?.lastUpdate || null;
            let logLines: string[] = [];
            // Only log if not the first update
            if (lastUpdate) {
              // Players who joined
              for (const p of players) {
                if (!prevPlayers.includes(p)) {
                  logLines.push(`[PLAYER CONNECTED] ${p}`);
                }
              }
              // Players who left
              for (const p of prevPlayers) {
                if (!players.includes(p)) {
                  logLines.push(`[PLAYER DISCONNECTED] ${p}`);
                }
              }
            }
            let sessionVersion = prev.sessionVersion;
            if (logLines.length > 0) {
              for (const line of logLines) {
                this.terminalManager.appendLine(msg.key, line);
              }
              // If this is the active tab, force terminal refresh
              if (this.state.activeTab === msg.key) {
                sessionVersion = prev.sessionVersion + 1;
              }
            }
            return {
              currentPlayers: {
                ...prev.currentPlayers,
                [msg.key]: { players, lastUpdate: Date.now() },
              },
              sessionVersion
            };
          });
        }
      } catch {}
    };
    this.ws.onclose = () => {
      if (!this.state.disconnected) {
        this.setState({ disconnected: true });
      }
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(this.tryReconnect, 5000);
      }
    };
  };

  tryReconnect = () => {
    this.reconnectTimer = null;
    if (this.state.disconnected) {
      this.connectWebSocket();
    }
  }

  handleTabSelect = (key: string) => {
    console.log(`handleTabSelect called with key: ${key}`);
    console.log('Current state before tab switch:', {
      activeTab: this.state.activeTab,
      sidebarWidth: this.state.sidebarWidth,
      currentPlayersWidth: this.state.currentPlayersWidth,
      profileLayoutVersion: this.state.profileLayoutVersion
    });
    
    // Reset widths to undefined so the getters read from the new profile's layout
    this.setState({
      activeTab: key,
      sidebarWidth: undefined,
      currentPlayersWidth: undefined
    }, () => {
      console.log('State after first setState:', {
        activeTab: this.state.activeTab,
        sidebarWidth: this.state.sidebarWidth,
        currentPlayersWidth: this.state.currentPlayersWidth
      });
      
      // Force a re-render by incrementing both sessionVersion and profileLayoutVersion
      // This ensures the layout is re-read from the new active profile
      this.setState(prev => ({
        sessionVersion: prev.sessionVersion + 1,
        profileLayoutVersion: (prev.profileLayoutVersion || 0) + 1
      }), () => {
        console.log('State after second setState:', {
          activeTab: this.state.activeTab,
          profileLayoutVersion: this.state.profileLayoutVersion,
          sidebarWidth: this.getSidebarWidth(),
          currentPlayersWidth: this.getCurrentPlayersWidth()
        });
      });
    });
  };
  handleRetryConnection = () => {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connectWebSocket();
  }

  handleOpenServerModal = () => {
    this.setState({ showServerModal: true });
  };

  handleCloseServerModal = () => {
    this.setState({ showServerModal: false }, this.loadServerProfiles);
  };

  handleSaveServerProfiles = async (profiles: ServerProfile[]) => {
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profiles),
      });
      if (res.ok) {
        //this.setState({ serverProfiles: profiles, showServerModal: false });
      } else {
        // Optionally show error in UI
        alert('Failed to save server profiles');
      }
    } catch (e) {
      alert('Failed to save server profiles');
    }
  };

  handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ command: e.target.value, historyIndex: null });
  };

  handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { commandHistory, historyIndex } = this.state;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      let newIndex = historyIndex === null ? commandHistory.length - 1 : historyIndex - 1;
      if (newIndex < 0) newIndex = 0;
      this.setState({
        historyIndex: newIndex,
        command: commandHistory[newIndex] || '',
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      let newIndex = historyIndex === null ? 0 : historyIndex + 1;
      if (newIndex >= commandHistory.length) {
        this.setState({ historyIndex: null, command: '' });
      } else {
        this.setState({
          historyIndex: newIndex,
          command: commandHistory[newIndex] || '',
        });
      }
    } else if (e.key === 'Enter') {
      this.handleSendCommand();
    }
  };

  handleSendCommand = () => {
    const cmd = this.state.command.trim();
    const tab = this.state.activeTab;
    if (!cmd || !tab || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Send command to backend via WebSocket
    this.ws.send(JSON.stringify({ type: 'command', key: tab, command: cmd }));
    // Echo command in terminal
    this.terminalManager.appendLine(tab, '> ' + cmd);
    this.setState((prev) => ({
      command: '',
      commandHistory: prev.commandHistory.includes(cmd)
        ? prev.commandHistory
        : [...prev.commandHistory, cmd],
      historyIndex: null,
      showHistoryDropdown: false,
      sessionVersion: prev.sessionVersion + 1,
    }));
  };

  handleDropdownToggle = () => {
    this.setState((prev) => ({ showHistoryDropdown: !prev.showHistoryDropdown }));
  };

  handleHistoryClick = (cmd: string) => {
    this.setState({ command: cmd, showHistoryDropdown: false, historyIndex: null }, () => {
      this.inputRef.current?.focus();
    });
  };
  render() {
    const { activity } = this.state;
    // Tab bar for activity switching
    return (
      <div style={{display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden'}}>
        {/* Activity Tab Bar */}
        <div style={{display: 'flex', alignItems: 'center', background: '#222', color: '#fff', padding: '0.5em 1em', height: '3em'}}>
          <span style={{fontWeight: 'bold', fontSize: '1.2em', marginRight: '2em'}}>RCON Manager</span>
          <div style={{display: 'flex', gap: '1em'}}>
            <button
              style={{
                background: activity === 'rcon' ? '#444' : 'transparent',
                color: '#fff',
                border: 'none',
                borderBottom: activity === 'rcon' ? '2px solid #fff' : '2px solid transparent',
                fontWeight: activity === 'rcon' ? 'bold' : 'normal',
                fontSize: '1em',
                padding: '0.5em 1em',
                cursor: 'pointer',
              }}
              onClick={() => this.setState({ activity: 'rcon' })}
            >RCon</button>
            <button
              style={{
                background: activity === 'serverConfig' ? '#444' : 'transparent',
                color: '#fff',
                border: 'none',
                borderBottom: activity === 'serverConfig' ? '2px solid #fff' : '2px solid transparent',
                fontWeight: activity === 'serverConfig' ? 'bold' : 'normal',
                fontSize: '1em',
                padding: '0.5em 1em',
                cursor: 'pointer',
              }}
              onClick={() => this.setState({ activity: 'serverConfig' })}
            >Server Configuration</button>
          </div>
          <span style={{flex: 1}} />
          <button style={{marginRight: '1em'}} onClick={this.handleOpenServerModal}>Manage Servers</button>
        </div>
        {/* Main content area */}
        <div style={{flex: 1, minHeight: 0, overflow: 'hidden'}}>
          {activity === 'rcon' ? (
            // ...existing code for RCon tab...
            this.renderRconTab()
          ) : (
            <ServerConfigTab
              serverProfiles={this.state.serverProfiles}
              onManageServers={this.handleOpenServerModal}
            />
          )}
        </div>
        {/* Disconnected Modal */}
        <DisconnectedModal show={!!this.state.disconnected} onRetry={this.handleRetryConnection} />
        {/* Server Management Modal */}
        <ServerManagementModal
          show={this.state.showServerModal}
          onClose={this.handleCloseServerModal}
          serverProfiles={this.state.serverProfiles}
          onSave={this.handleSaveServerProfiles}
        />
      </div>
    );
  }

  // Extracted RCon tab rendering for clarity
  renderRconTab() {
    const { command, commandHistory, showHistoryDropdown, serverProfiles, sessionVersion, currentPlayers, activeTab, profileLayoutVersion } = this.state;
    const session = activeTab ? this.terminalManager.getSession(activeTab) : null;
    // Current Players logic
    let showCurrentPlayers = false;
    let currentPlayersList: string[] = [];
    let currentPlayersLastUpdate: number | null = null;
    if (activeTab) {
      const profile = serverProfiles.find(
        p => `${p.host}:${p.port}` === activeTab
      );
      if (profile && profile.features && profile.features.currentPlayers && profile.features.currentPlayers.enabled) {
        showCurrentPlayers = true;
        if (currentPlayers[activeTab]) {
          currentPlayersList = currentPlayers[activeTab].players;
          currentPlayersLastUpdate = currentPlayers[activeTab].lastUpdate;
        }
      }
    }
    const currentSidebarWidth = this.getSidebarWidth();
    const currentPlayersWidth = this.getCurrentPlayersWidth();
    return (
      <div style={{display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden'}}>
        {/* Sidebar for tabs, resizable */}
        <div
          key={`sidebar-${this.state.activeTab}-${profileLayoutVersion}`}
          style={{width: currentSidebarWidth, background: '#191c20', color: '#eee', borderRight: '1px solid #333', padding: '1em 0', position: 'relative', minWidth: 80, maxWidth: 400, flexShrink: 0, flexGrow: 0}}>
          <div style={{padding: '0 1em', fontWeight: 'bold'}}>Servers</div>
          <TabManager
            serverProfiles={serverProfiles}
            statusMap={this.state.statusMap}
            onTabSelect={this.handleTabSelect}
            activeTab={this.state.activeTab}
          />
          {/* Sidebar resize handle */}
          <div
            style={{position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 30, background: 'transparent'}}
            onMouseDown={this.handleSidebarResizeStart}
          />
        </div>

        {/* Main terminal area with terminal and status */}
        <div style={{flex: 1, background: '#23272e', display: 'flex', flexDirection: 'row', minHeight: 0, minWidth: 0, position: 'relative', overflow: 'hidden'}}>
          {/* Current Players window (if enabled), resizable */}
          {showCurrentPlayers && (
            <div
              key={`currentplayers-${this.state.activeTab}-${profileLayoutVersion}`}
              style={{
                width: currentPlayersWidth,
                minWidth: 80,
                maxWidth: 400,
                position: 'relative',
                flexShrink: 0,
                flexGrow: 0,
                height: '100%'
              }}
            >
              <CurrentPlayersWindow
                players={currentPlayersList}
                lastUpdate={currentPlayersLastUpdate}
                currentPlayersWidth={currentPlayersWidth}
              />
              {/* Current Players resize handle */}
              <div
                style={{position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 30, background: 'transparent'}}
                onMouseDown={this.handleCurrentPlayersResizeStart}
              />
            </div>
          )}
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden'}}>
            <TerminalArea
              activeTab={this.state.activeTab}
              status={this.state.activeTab ? this.state.statusMap[this.state.activeTab] : undefined}
              session={session}
              sessionVersion={sessionVersion}
            />

            {/* Command input area */}
            <div style={{display: 'flex', alignItems: 'center', background: '#20232a', borderTop: '1px solid #333', padding: '0.5em 1em', position: 'relative'}}>
              <input
                ref={this.inputRef}
                type="text"
                value={command}
                onChange={this.handleInputChange}
                onKeyDown={this.handleInputKeyDown}
                placeholder="Type command..."
                style={{flex: 1, fontSize: '1em', padding: '0.5em', background: '#23272e', color: '#eee', border: '1px solid #444', borderRadius: 4}}
                autoComplete="off"
              />
              <button
                style={{marginLeft: '0.5em', padding: '0.5em 1em'}}
                onClick={this.handleSendCommand}
              >Send</button>
              <button
                style={{marginLeft: '0.5em', padding: '0.5em 0.7em'}}
                onClick={this.handleDropdownToggle}
                tabIndex={-1}
                aria-label="Show command history"
              >&#x25BC;</button>
              {/* Custom dropdown for command history */}
              {showHistoryDropdown && commandHistory.length > 0 && (
                <div
                  ref={this.dropdownRef}
                  style={{
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: '#23272e',
                    border: '1px solid #444',
                    zIndex: 10,
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}
                >
                  {commandHistory.slice().reverse().map((cmd, idx) => (
                    <div
                      key={idx}
                      style={{padding: '0.5em 1em', cursor: 'pointer', color: '#eee'}}
                      onClick={() => this.handleHistoryClick(cmd)}
                      onMouseDown={e => e.preventDefault()}
                    >
                      {cmd}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}