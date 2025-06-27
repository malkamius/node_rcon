import React, { useState, useRef, useEffect } from 'react';
import { TerminalArea } from './TerminalArea';
import { RconTerminalManager } from './rconTerminalManager';
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
}

interface RconClientAppProps {
  serverProfiles: ServerProfile[];
  statusMap: Record<string, { status: string; since: number }>;
  selectedKey: string | null;
  onTabSelect: (key: string) => void;
  onManageServers: () => void;
  terminalManager?: RconTerminalManager;
  sessionVersion?: number;
  onSendCommand?: (key: string, command: string) => void;
  currentPlayers?: Record<string, { players: string[]; lastUpdate: number | null }>;
}

// If terminalManager/sessionVersion are not provided, create a local one (for backward compatibility/testing)
const defaultTerminalManager = new RconTerminalManager();

export const RconClientWindow: React.FC<RconClientAppProps> = ({
  serverProfiles,
  statusMap,
  selectedKey,
  onTabSelect,
  onManageServers,
  terminalManager = defaultTerminalManager,
  sessionVersion = 0,
  onSendCommand,
  currentPlayers = {},
}) => {
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [playersWidth, setPlayersWidth] = useState<number>(240);
  const [playersOpen, setPlayersOpen] = useState<boolean>(true);
  const [resizing, setResizing] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(240);

  const selectedProfile = selectedKey ? serverProfiles.find(p => `${p.host}:${p.port}` === selectedKey) : null;
  const session = selectedKey ? terminalManager.getSession(selectedKey) : null;
  const status = selectedKey ? statusMap[selectedKey] : undefined;

  // Player list logic
  let showPlayers = false;
  let playersList: string[] = [];
  let playersLastUpdate: number | null = null;
  if (selectedProfile && selectedProfile.features?.currentPlayers?.enabled) {
    showPlayers = true;
    if (selectedKey && currentPlayers[selectedKey]) {
      playersList = currentPlayers[selectedKey].players;
      playersLastUpdate = currentPlayers[selectedKey].lastUpdate;
    }
  }


  // Handle command send
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKey || !command.trim()) return;
    if (onSendCommand) {
      onSendCommand(selectedKey, command);
    } else {
      terminalManager.appendLine(selectedKey, '> ' + command);
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
      {selectedProfile ? (
        <>
          <div style={{ marginBottom: 8, color: '#aaa' }}>
            <b>Server:</b> {selectedProfile.name} ({selectedProfile.host}:{selectedProfile.port})
            <span style={{ marginLeft: 16, color: status?.status === 'connected' ? '#6f6' : '#f66' }}>
              {status?.status || 'disconnected'}
            </span>
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
                status={status}
                session={session}
                sessionVersion={sessionVersion}
              />
              <form onSubmit={handleSend} style={{ display: 'flex', marginTop: 8 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={command}
                  onChange={e => { setCommand(e.target.value); setHistoryIndex(null); }}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Enter RCON command..."
                  style={{ flex: 1, fontSize: 16, padding: 8, borderRadius: 4, border: '1px solid #444', background: '#23272e', color: '#eee' }}
                  disabled={!selectedKey || status?.status !== 'connected'}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  style={{ marginLeft: 8, padding: '8px 18px', borderRadius: 4, border: '1px solid #444', background: '#23272e', color: '#eee', fontWeight: 600, cursor: 'pointer' }}
                  disabled={!selectedKey || status?.status !== 'connected' || !command.trim()}
                >Send</button>
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
