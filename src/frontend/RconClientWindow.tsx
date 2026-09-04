import React, { useState, useRef, useEffect } from 'react';
import { copyBookmarkLink } from './urlRouting';
import { TerminalArea } from './TerminalArea';
import { RconTerminalManager, getConnectionSummary } from './rconTerminalManager';
import { CurrentPlayersWindow } from './CurrentPlayersWindow';

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
  showTimestamps?: boolean; // Whether to show timestamps in terminal, default true
  baseInstallId?: string;
  updateAvailable?: boolean;
  latestBuildId?: string;
}

export interface RconClientAppProps {
  serverProfiles: ServerProfile[];
  // statusMap: key -> { running, startTime, manuallyStopped, autoStart, baseInstallId }
  statusMap: Record<string, any>;
  // rconStatusMap: key -> { status: 'connected' | 'connecting' | 'disconnected', since: number }
  rconStatusMap?: Record<string, { status: string; since: number }>;
  selectedKey: string | null;
  selectedKeys?: string[];
  onBroadcastCommand?: (keys: string[], command: string, guid: string) => Promise<any> | void;
  onDeselectAll?: () => void;
  broadcastSessionVersion?: number;
  onTabSelect: (key: string) => void;
  onManageServers: () => void;
  terminalManager?: RconTerminalManager;
  sessionVersion?: number;
  onSendCommand?: (key: string, command: string, guid: string) => void;
  onClearLog?: (key: string) => void;
  currentPlayers?: { players: string[]; lastUpdate: number | null };
  disabled?: boolean; // If true, disables input and send button
}

// If terminalManager/sessionVersion are not provided, create a local one (for backward compatibility/testing)
const defaultTerminalManager = new RconTerminalManager(100, { current: null } as React.MutableRefObject<WebSocket | null>);


export const RconClientWindow: React.FC<RconClientAppProps> = ({
  serverProfiles,
  statusMap,
  rconStatusMap = {},
  selectedKey,
  selectedKeys = [],
  onBroadcastCommand,
  onDeselectAll,
  broadcastSessionVersion,
  onTabSelect,
  onManageServers,
  terminalManager = defaultTerminalManager,
  sessionVersion = 0,
  onSendCommand,
  onClearLog,
  currentPlayers,
  disabled = false,
}) => {
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [playersWidth, setPlayersWidth] = useState<number>(240);
  const [playersOpen, setPlayersOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return false;
    }
    return true;
  });
  const [resizing, setResizing] = useState<boolean>(false);
  const [showTimestamps, setShowTimestamps] = useState<boolean>(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(240);

  const selectedProfile = selectedKey ? serverProfiles.find(p => `${p.host}:${p.port}` === selectedKey) : null;


  // Set showTimestamps from profile (default true)
  useEffect(() => {
    if (selectedProfile) {
      setShowTimestamps(selectedProfile.showTimestamps !== false);
    }
  }, [selectedProfile]);

  // Remove local WebSocket logic. Use onClearLog prop for clear log action.
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const handleCopyBookmark = async () => {
    if (!selectedKey) return;
    const ok = await copyBookmarkLink(selectedKey);
    if (ok) {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  const isMultiServer = Array.isArray(selectedKeys) && selectedKeys.length > 1;

  useEffect(() => {
    if (isBroadcasting) {
      setIsBroadcasting(false);
    }
  }, [broadcastSessionVersion, sessionVersion]);

  const handleClearLog = () => {
    if (isMultiServer) {
      if (onClearLog) {
        onClearLog('__broadcast__');
      } else {
        terminalManager.clear('__broadcast__', null);
      }
      return;
    }
    if (!selectedKey || !onClearLog) return;
    onClearLog(selectedKey);
  };
  const session = isMultiServer
    ? terminalManager.getSession('__broadcast__')
    : (selectedKey ? terminalManager.getSession(selectedKey) : null);
  const procStatus = selectedKey ? statusMap[selectedKey] : undefined;
  const running = !!procStatus?.running;
  const manuallyStopped = !!procStatus?.manuallyStopped;
  const autoStart = procStatus?.autoStart;
  const startTime = procStatus?.startTime;

  // RCON connection status
  const rconStatus = selectedKey && rconStatusMap[selectedKey]?.status ? rconStatusMap[selectedKey].status : 'disconnected';
  const rconConnected = rconStatus === 'connected';

  // Player list logic
  let showPlayers = false;
  let playersList: string[] = [];
  let playersLastUpdate: number | null = null;
  if (selectedProfile && selectedProfile.features?.currentPlayers?.enabled && currentPlayers) {
    showPlayers = true;
    if (selectedKey && currentPlayers) {
      playersList = currentPlayers.players;
      playersLastUpdate = currentPlayers.lastUpdate;
    } else {
      playersList = [];
      playersLastUpdate = null;
    }
  }


  // Generate a GUID (RFC4122 v4, simple)
  function generateGuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Handle command send
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    if (isMultiServer) {
      if (isBroadcasting) return;
      const cmd = command.trim();
      const guid = generateGuid();
      setIsBroadcasting(true);
      try {
        if (onBroadcastCommand) {
          await onBroadcastCommand(selectedKeys, cmd, guid);
        } else {
          terminalManager.appendLine('__broadcast__', `\x1b[1;36m[BROADCAST]\x1b[0m > ${cmd}`, undefined, true, guid, 'command');
        }
      } finally {
        setIsBroadcasting(false);
      }
      setCommand('');
      setHistoryIndex(null);
      setCommandHistory(prev => {
        if (cmd && !prev.includes(cmd)) {
          return [...prev, cmd];
        }
        return prev;
      });
      return;
    }

    if (!selectedKey) return;
    const guid = generateGuid();
    if (onSendCommand) {
      // Update: pass guid as third argument if supported
      (onSendCommand as any)(selectedKey, command, guid);
    } else {
      terminalManager.appendLine(selectedKey, '> ' + command, undefined, true, guid, 'command');
    }
    setCommand('');
    setHistoryIndex(null);
    setCommandHistory(prev => {
      if (command.trim() && !prev.includes(command.trim())) {
        return [...prev, command.trim()];
      }
      return prev;
    });
  };

  // Handle up/down arrow for command history
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      let newIndex = historyIndex === null ? commandHistory.length - 1 : historyIndex - 1;
      if (newIndex < 0) newIndex = 0;
      setHistoryIndex(newIndex);
      setCommand(commandHistory[newIndex] || '');
      // Select the input text after setting command
      setTimeout(() => {
        inputRef.current?.select();
      }, 0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      if (historyIndex === null) {
        // Do nothing if already at the newest entry
        return;
      }
      let newIndex = historyIndex + 1;
      if (newIndex >= commandHistory.length) {
        setHistoryIndex(null);
        setCommand('');
        // Optionally, select the input text
        setTimeout(() => {
          inputRef.current?.select();
        }, 0);
      } else {
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex] || '');
        setTimeout(() => {
          inputRef.current?.select();
        }, 0);
      }
    } else if (e.key === 'Enter') {
      setHistoryIndex(null);
    }
  };

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    setResizing(true);
    startX.current = e.clientX;
    startWidth.current = playersWidth;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  };
  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      let newWidth = Math.max(120, startWidth.current + delta);
      newWidth = Math.min(newWidth, 400);
      setPlayersWidth(newWidth);
    };
    const handleMouseUp = () => {
      setResizing(false);
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <h2>RCON Terminal</h2>
      {isMultiServer ? (
        <>
          <div
            style={{
              background: '#2b2a1a',
              border: '1px solid #735c0f',
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 8,
              color: '#e3b341',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span>
              ⚠️ Multi-Server Selection Active ({selectedKeys.length} servers): Real-time output streams and player lists for individual servers are unavailable. Batch controls in the sidebar and RCON Command Broadcasting are enabled.
            </span>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>
              <button
                onClick={handleClearLog}
                style={{
                  background: '#23272e',
                  color: '#eee',
                  border: '1px solid #444',
                  borderRadius: 4,
                  padding: '6px 12px',
                  fontSize: 13,
                  minHeight: 34,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                disabled={disabled}
                title="Clear broadcast log"
              >
                Clear Log
              </button>
              {onDeselectAll && (
                <button
                  onClick={onDeselectAll}
                  style={{
                    background: '#23272e',
                    color: '#eee',
                    border: '1px solid #444',
                    borderRadius: 4,
                    padding: '6px 12px',
                    fontSize: 13,
                    minHeight: 34,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                  title="Deselect all servers"
                >
                  Clear Selection
                </button>
              )}
              <label style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, color: '#ccc', cursor: 'pointer', minHeight: 34, padding: '0 4px' }}>
                <input
                  type="checkbox"
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Show timestamps
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div
              style={{
                background: '#1f242c',
                border: '1px solid #38444d',
                borderRadius: 12,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: '#88c0d0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>📡 Summary:</span>
              <span>{getConnectionSummary(selectedKeys, rconStatusMap).text}</span>
            </div>
            {selectedKeys.map((key) => {
              const profile = serverProfiles.find((p) => `${p.host}:${p.port}` === key);
              const serverName = profile?.name || key;
              const isConn = rconStatusMap[key]?.status === 'connected';
              return (
                <div
                  key={key}
                  style={{
                    background: '#21262d',
                    border: '1px solid #30363d',
                    borderRadius: 12,
                    padding: '2px 8px',
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#c9d1d9',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{serverName}</span>
                  <span style={{ color: '#8b949e', fontSize: 11 }}>({key})</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 8,
                      background: isConn ? '#194c25' : '#4c1919',
                      color: isConn ? '#3fb950' : '#f85149',
                      border: `1px solid ${isConn ? '#238636' : '#da3633'}`,
                    }}
                  >
                    {isConn ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', position: 'relative' }}>
            {/* Player list panel */}
            {playersOpen && (
              <div
                style={{
                  width: playersWidth,
                  minWidth: 120,
                  maxWidth: 400,
                  background: '#20232a',
                  borderRight: '1px solid #333',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  zIndex: 2,
                  height: '100%',
                  flexShrink: 0,
                  flexGrow: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    background: '#23272e',
                    borderBottom: '1px solid #333',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>Players</span>
                  <button
                    aria-label={playersOpen ? 'Hide player list' : 'Show player list'}
                    onClick={() => setPlayersOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer' }}
                  >
                    ⮜
                  </button>
                </div>
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                    color: '#888',
                    textAlign: 'center',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  Player list is unavailable when multiple servers are selected.
                </div>
                {/* Resize handle */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: -3,
                    width: 6,
                    height: '100%',
                    cursor: 'col-resize',
                    zIndex: 30,
                    background: 'transparent',
                  }}
                  onMouseDown={handleResizeStart}
                />
              </div>
            )}
            {!playersOpen && (
              <div
                style={{
                  width: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#23272e',
                  borderRight: '1px solid #333',
                  height: '100%',
                }}
              >
                <button
                  aria-label="Show player list"
                  onClick={() => setPlayersOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer' }}
                >
                  ⮞
                </button>
              </div>
            )}

            {/* Terminal area */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, position: 'relative', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <TerminalArea
                  activeTab="__broadcast__"
                  session={session}
                  sessionVersion={broadcastSessionVersion ?? sessionVersion}
                  showTimestamps={showTimestamps}
                  loading={false}
                />
                {(!session || session.lines.length === 0) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#888',
                      background: '#181c20',
                      zIndex: 5,
                      padding: 24,
                      textAlign: 'center',
                      fontSize: 14,
                    }}
                  >
                    Broadcast console ready. Commands entered below will be sent simultaneously to all {selectedKeys.length} selected servers.
                  </div>
                )}
              </div>
              <form onSubmit={handleSend} style={{ display: 'flex', marginTop: 8, gap: 6, flexWrap: 'nowrap' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={command}
                  onChange={(e) => {
                    setCommand(e.target.value);
                    setHistoryIndex(null);
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder={`Broadcast RCON command to ${selectedKeys.length} selected servers (e.g. SaveWorld, serverchat Announcement)...`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 16,
                    padding: '10px 12px',
                    minHeight: 40,
                    borderRadius: 4,
                    border: '1px solid #444',
                    background: '#23272e',
                    color: '#eee',
                    boxSizing: 'border-box',
                  }}
                  disabled={disabled || isBroadcasting}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  style={{
                    minHeight: 40,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    flexShrink: 0,
                    borderRadius: 4,
                    border: '1px solid #444',
                    background: '#23272e',
                    color: '#eee',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                  disabled={disabled || isBroadcasting || !command.trim()}
                >
                  {isBroadcasting ? 'Broadcasting...' : `Broadcast (${selectedKeys.length})`}
                </button>
              </form>
            </div>
          </div>
        </>
      ) : selectedProfile ? (
        <>
          <div style={{ marginBottom: 8, color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <b>Server:</b> {selectedProfile.name} ({selectedProfile.host}:{selectedProfile.port})
                <span style={{ marginLeft: 16, color: running ? '#6f6' : manuallyStopped ? '#fa0' : '#f66' }}>
                  {running ? 'Running' : (manuallyStopped ? 'Stopped (Manual)' : 'Stopped')}
                </span>
                <span style={{ marginLeft: 12, fontSize: '0.9em', color: '#aaa' }}>
                  {running && startTime ? `Started at ${new Date(startTime).toLocaleTimeString()}` :
                    !running && manuallyStopped ? 'Stopped manually' :
                    !running && autoStart ? 'Auto-start enabled' :
                    !running ? 'Not running' : ''}
                </span>
              </div>
              {(selectedProfile.updateAvailable || (selectedKey ? statusMap[selectedKey]?.updateAvailable : false)) && (
                <div
                  style={{
                    background: '#7c2d12',
                    color: '#fed7aa',
                    border: '1px solid #c2410c',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: '0.85em',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="A dedicated server update is available on Steam"
                >
                  ⚠️ Game Update Available {selectedProfile.latestBuildId ? `(Steam Build ${selectedProfile.latestBuildId})` : ''}
                </div>
              )}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <button
                onClick={handleCopyBookmark}
                style={{
                  background: copyFeedback ? '#2e7d32' : '#23272e',
                  color: '#eee',
                  border: '1px solid #444',
                  borderRadius: 4,
                  padding: '6px 12px',
                  fontSize: 14,
                  minHeight: 34,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'background 0.2s ease',
                }}
                disabled={!selectedKey}
                title="Copy direct bookmark link to this server"
              >
                <span>🔗</span>
                {copyFeedback ? 'Copied!' : 'Bookmark'}
              </button>
              <button
                onClick={handleClearLog}
                style={{
                  background: '#23272e',
                  color: '#eee',
                  border: '1px solid #444',
                  borderRadius: 4,
                  padding: '6px 12px',
                  fontSize: 14,
                  minHeight: 34,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                disabled={!selectedKey || disabled}
                title="Clear log"
              >
                Clear log
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', fontSize: 14, color: '#ccc', cursor: 'pointer', minHeight: 34, padding: '0 4px' }}>
                <input
                  type="checkbox"
                  checked={showTimestamps}
                  onChange={e => {
                    setShowTimestamps(e.target.checked);
                    // Save to profile (in-memory only)
                    if (selectedProfile) selectedProfile.showTimestamps = e.target.checked;
                  }}
                  style={{ marginRight: 6 }}
                />
                Show timestamps
              </label>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', position: 'relative' }}>
            {/* Player list panel */}
            {showPlayers && playersOpen && (
              <div style={{
                width: playersWidth,
                minWidth: 120,
                maxWidth: 400,
                background: '#20232a',
                borderRight: '1px solid #333',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                zIndex: 2,
                height: '100%',
                flexShrink: 0,
                flexGrow: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: '#23272e', borderBottom: '1px solid #333' }}>
                  <span style={{ fontWeight: 'bold' }}>Players</span>
                  <button
                    aria-label={playersOpen ? 'Hide player list' : 'Show player list'}
                    onClick={() => setPlayersOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer' }}
                  >⮜</button>
                </div>
                <CurrentPlayersWindow
                  players={playersList}
                  lastUpdate={playersLastUpdate}
                  currentPlayersWidth={playersWidth}
                />
                {/* Resize handle */}
                <div
                  style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 30, background: 'transparent' }}
                  onMouseDown={handleResizeStart}
                />
              </div>
            )}
            {/* Collapsed button */}
            {showPlayers && !playersOpen && (
              <div style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#23272e', borderRight: '1px solid #333', height: '100%' }}>
                <button
                  aria-label="Show player list"
                  onClick={() => setPlayersOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer' }}
                >⮞</button>
              </div>
            )}
            {/* Terminal area */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <TerminalArea
              activeTab={selectedKey}
              // Pass RCON connection status for display
              status={selectedKey && rconStatusMap[selectedKey] ? rconStatusMap[selectedKey] : { status: 'disconnected', since: Date.now() }}
              session={session}
              sessionVersion={sessionVersion}
              showTimestamps={showTimestamps}
              loading={disabled}
            />
              <form onSubmit={handleSend} style={{ display: 'flex', marginTop: 8, gap: 6, flexWrap: 'nowrap' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={command}
                  onChange={e => { setCommand(e.target.value); setHistoryIndex(null); }}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Enter RCON command..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 16,
                    padding: '10px 12px',
                    minHeight: 40,
                    borderRadius: 4,
                    border: '1px solid #444',
                    background: '#23272e',
                    color: '#eee',
                    boxSizing: 'border-box',
                  }}
                  disabled={disabled || !selectedKey || !rconConnected}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  style={{
                    minHeight: 40,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    flexShrink: 0,
                    borderRadius: 4,
                    border: '1px solid #444',
                    background: '#23272e',
                    color: '#eee',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                  disabled={disabled || !selectedKey || !rconConnected || !command.trim()}
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </>
      ) : (
        <div style={{ color: '#888', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Select a server to use the RCON terminal.</div>
      )}
    </div>
  );
}
