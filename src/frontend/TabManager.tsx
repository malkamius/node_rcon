import React, { useState, useEffect, useRef } from 'react';
import { copyBookmarkLink } from './urlRouting';

export interface TabManagerProps {
  serverProfiles: {
    name: string;
    host: string;
    port: number;
    password: string;
    directory?: string;
    baseInstallId?: string;
    updateAvailable?: boolean;
    latestBuildId?: string;
    [key: string]: any;
  }[];
  // statusMap: key -> { running, startTime, manuallyStopped, autoStart, baseInstallId, crashed, exitCode, updateAvailable }
  statusMap: Record<string, any>;
  rconStatusMap: Record<string, any>;
  onTabSelect: (key: string) => void;
  activeTab: string | null;
  onHandleSendServerShutdown: (keys: string[]) => void;
  onHandleSendForceStart: (keys: string[]) => void;
  onExecuteScript?: (keys: string[]) => void;
  onViewLogs?: (key: string) => void;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  serverKey: string;
}

export const TabManager: React.FC<TabManagerProps> = ({
  serverProfiles,
  statusMap,
  rconStatusMap,
  onTabSelect,
  activeTab,
  onHandleSendServerShutdown,
  onHandleSendForceStart,
  onExecuteScript,
  onViewLogs,
  selectedKeys = [],
  onSelectionChange
}) => {
  const [actionMsg, setActionMsg] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, serverKey: '' });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Helper to show inline feedback message for a server key
  const showMsg = (key: string, type: 'success' | 'error', text: string) => {
    setActionMsg((prev) => ({ ...prev, [key]: { type, text } }));
    setTimeout(() => setActionMsg((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    }), 2500);
  };

  // Close context menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    if (contextMenu.visible) {
      window.addEventListener('mousedown', handleGlobalClick);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', () => setContextMenu(prev => ({ ...prev, visible: false })), true);
    }
    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.visible]);

  // Context menu trigger
  const handleContextMenu = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Clamp inside viewport
    const menuWidth = 220;
    const menuHeight = 190;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    setContextMenu({
      visible: true,
      x: Math.max(10, x),
      y: Math.max(10, y),
      serverKey: key,
    });
  };

  // Open directory in Explorer via backend API
  const handleOpenDirectory = async (key: string) => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    try {
      const res = await fetch('/api/open-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showMsg(key, 'error', data.error || 'Failed to open directory');
      } else {
        showMsg(key, 'success', 'Opened in Explorer');
      }
    } catch (err: any) {
      showMsg(key, 'error', err?.message || 'Error opening folder');
    }
  };

  // Checkbox toggle for multi-selection
  const handleToggleSelect = (key: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    if (!onSelectionChange) return;

    if (selectedKeys.includes(key)) {
      onSelectionChange(selectedKeys.filter(k => k !== key));
    } else {
      onSelectionChange([...selectedKeys, key]);
    }
  };

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    const allKeys = serverProfiles.map(p => `${p.host}:${p.port}`);
    onSelectionChange(allKeys);
  };

  const handleDeselectAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange([]);
  };

  // Active server for context menu actions
  const contextProfile = serverProfiles.find(p => `${p.host}:${p.port}` === contextMenu.serverKey);
  const contextProcStatus = contextMenu.serverKey ? statusMap[contextMenu.serverKey] : null;
  const contextRunning = !!contextProcStatus?.running;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Batch Actions Bar (visible when servers are selected) */}
      {selectedKeys.length > 0 && (
        <div
          style={{
            background: '#1f242c',
            borderBottom: '1px solid #3a424e',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: '#61afef' }}>
              {selectedKeys.length} of {serverProfiles.length} selected
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {selectedKeys.length < serverProfiles.length && (
                <button
                  onClick={handleSelectAll}
                  style={{ background: 'transparent', border: 'none', color: '#98c379', fontSize: 11, cursor: 'pointer', padding: 0 }}
                >
                  Select All
                </button>
              )}
              <button
                onClick={handleDeselectAll}
                style={{ background: 'transparent', border: 'none', color: '#e06c75', fontSize: 11, cursor: 'pointer', padding: 0 }}
              >
                Clear
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => onHandleSendForceStart(selectedKeys)}
              style={{
                flex: '1 1 45%',
                minHeight: 32,
                background: '#2e7d32',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '6px 8px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Start all selected servers"
            >
              Start ({selectedKeys.length})
            </button>
            <button
              onClick={() => onHandleSendServerShutdown(selectedKeys)}
              style={{
                flex: '1 1 45%',
                minHeight: 32,
                background: '#d32f2f',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '6px 8px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Stop all selected servers"
            >
              Stop ({selectedKeys.length})
            </button>
            {onExecuteScript && (
              <button
                onClick={() => onExecuteScript(selectedKeys)}
                style={{
                  width: '100%',
                  minHeight: 32,
                  background: '#3a3f4b',
                  color: '#61afef',
                  border: '1px solid #4b5263',
                  borderRadius: 4,
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2
                }}
                title="Execute RCON script on selected servers"
              >
                Execute Script...
              </button>
            )}
          </div>
        </div>
      )}

      {/* Server List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {serverProfiles.map((profile) => {
          const key = profile.host + ':' + profile.port;
          const procStatus = statusMap[key];
          const running = !!procStatus?.running;
          const manuallyStopped = !!procStatus?.manuallyStopped;
          const autoStart = !!procStatus?.autoStart;
          const startTime = procStatus?.startTime;
          const crashed = !!procStatus?.crashed;
          const isSelected = selectedKeys.includes(key);

          let statusLabel = rconStatusMap[key]?.status === 'connecting'
            ? 'Connecting...'
            : rconStatusMap[key]?.status === 'connected'
            ? 'Connected'
            : running
            ? 'Running'
            : crashed
            ? 'Crashed'
            : manuallyStopped
            ? 'Stopped (Manual)'
            : 'Stopped';

          let statusColor = rconStatusMap[key]?.status === 'connecting'
            ? '#ff6'
            : running || rconStatusMap[key]?.status === 'connected'
            ? '#6f6'
            : crashed
            ? '#ff5555'
            : manuallyStopped
            ? '#fa0'
            : '#f66';

          return (
            <div
              key={key}
              onContextMenu={(e) => handleContextMenu(e, key)}
              onClick={(e) => {
                if (e.ctrlKey || e.shiftKey) {
                  handleToggleSelect(key, e);
                } else {
                  onTabSelect(key);
                }
              }}
              style={{
                padding: '8px 10px',
                minHeight: 44,
                boxSizing: 'border-box',
                background: isSelected
                  ? '#282c34'
                  : activeTab === key
                  ? '#21252b'
                  : 'transparent',
                cursor: 'pointer',
                borderBottom: '1px solid #282c34',
                borderLeft: activeTab === key ? '3px solid #61afef' : '3px solid transparent',
                color: statusColor,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                userSelect: 'none',
                transition: 'background 0.15s ease',
              }}
            >
              {/* Multi-select checkbox */}
              {onSelectionChange && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => handleToggleSelect(key, e)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ cursor: 'pointer', accentColor: '#61afef', flexShrink: 0 }}
                  title="Select for batch operations"
                />
              )}

              {/* Server Name & Status Details */}
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: activeTab === key ? 700 : 500, fontSize: 13, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                    {profile.name || key}
                  </span>
                  {(profile.updateAvailable || procStatus?.updateAvailable) && (
                    <span
                      style={{
                        background: '#d97706',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 3,
                        flexShrink: 0
                      }}
                      title="Game update available for this server's base install"
                    >
                      UPDATE
                    </span>
                  )}
                  <span style={{ fontSize: '0.8em', color: statusColor, flexShrink: 0 }}>
                    ({statusLabel})
                  </span>
                </div>
                <div style={{ fontSize: '0.7em', color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {running && startTime ? `Started ${new Date(startTime).toLocaleTimeString()}` :
                    crashed ? `Exited unexpectedly ${procStatus?.exitCode !== null ? `(exit code: ${procStatus.exitCode})` : ''}` :
                    !running && manuallyStopped ? 'Stopped manually' :
                    !running && autoStart ? 'Auto-start enabled' :
                    !running ? 'Not running' : ''}
                </div>
              </div>

              {/* Action Buttons (Start / Stop) */}
              <button
                disabled={running}
                style={{
                  flexShrink: 0,
                  minHeight: 30,
                  background: running ? '#333' : '#2da44e',
                  color: running ? '#777' : '#fff',
                  border: 'none',
                  borderRadius: 3,
                  padding: '4px 8px',
                  fontWeight: 600,
                  cursor: running ? 'not-allowed' : 'pointer',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Start server"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    onHandleSendForceStart([key]);
                  } catch (err: any) {
                    showMsg(key, 'error', err?.message || 'Failed to start');
                  }
                }}
              >
                Start
              </button>
              <button
                disabled={!running}
                style={{
                  flexShrink: 0,
                  minHeight: 30,
                  background: !running ? '#333' : '#cf222e',
                  color: !running ? '#777' : '#fff',
                  border: 'none',
                  borderRadius: 3,
                  padding: '4px 8px',
                  fontWeight: 600,
                  cursor: !running ? 'not-allowed' : 'pointer',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Stop server"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    onHandleSendServerShutdown([key]);
                  } catch (err: any) {
                    showMsg(key, 'error', err?.message || 'Failed to stop');
                  }
                }}
              >
                Stop
              </button>

              {/* Feedback toast */}
              {actionMsg[key] && (
                <span style={{ marginLeft: 4, color: actionMsg[key].type === 'success' ? '#6f6' : '#f66', fontWeight: 600, fontSize: 11 }}>
                  {actionMsg[key].text}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu.visible && contextProfile && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#21252b',
            border: '1px solid #3a424e',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
            zIndex: 100000,
            width: 210,
            padding: '4px 0',
            color: '#eee',
            fontSize: 13,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#888', borderBottom: '1px solid #2c313a', fontWeight: 600 }}>
            {contextProfile.name || contextMenu.serverKey}
          </div>

          {/* Start Server */}
          <div
            onClick={() => {
              if (!contextRunning) {
                setContextMenu(prev => ({ ...prev, visible: false }));
                onHandleSendForceStart([contextMenu.serverKey]);
              }
            }}
            style={{
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: contextRunning ? 'not-allowed' : 'pointer',
              color: contextRunning ? '#555' : '#eee',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!contextRunning) e.currentTarget.style.background = '#2c313a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ color: contextRunning ? '#555' : '#2da44e', fontWeight: 'bold' }}>▶</span>
            Start Server
          </div>

          {/* Stop Server / Graceful Shutdown */}
          <div
            onClick={() => {
              if (contextRunning) {
                setContextMenu(prev => ({ ...prev, visible: false }));
                onHandleSendServerShutdown([contextMenu.serverKey]);
              }
            }}
            style={{
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: !contextRunning ? 'not-allowed' : 'pointer',
              color: !contextRunning ? '#555' : '#eee',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              if (contextRunning) e.currentTarget.style.background = '#2c313a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ color: !contextRunning ? '#555' : '#cf222e', fontWeight: 'bold' }}>⏹</span>
            Stop Server / Shutdown
          </div>

          {/* Execute Script... */}
          {onExecuteScript && (
            <div
              onClick={() => {
                setContextMenu(prev => ({ ...prev, visible: false }));
                onExecuteScript([contextMenu.serverKey]);
              }}
              style={{
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                color: '#eee',
                background: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2c313a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ color: '#61afef', fontWeight: 'bold' }}>⚡</span>
              Execute Script...
            </div>
          )}

          {/* View Server Logs / Crash Reports */}
          {onViewLogs && (
            <div
              onClick={() => {
                setContextMenu(prev => ({ ...prev, visible: false }));
                onViewLogs(contextMenu.serverKey);
              }}
              style={{
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                color: '#eee',
                background: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2c313a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              title="View ShooterGame.log, historical logs, and crash reports"
            >
              <span style={{ color: '#e5c07b' }}>📜</span>
              View Server Logs / Crash...
            </div>
          )}

          <div style={{ height: 1, background: '#2c313a', margin: '4px 0' }} />

          {/* Open Directory in Explorer */}
          <div
            onClick={() => {
              if (contextProfile.directory) {
                handleOpenDirectory(contextMenu.serverKey);
              }
            }}
            style={{
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: !contextProfile.directory ? 'not-allowed' : 'pointer',
              color: !contextProfile.directory ? '#555' : '#eee',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              if (contextProfile.directory) e.currentTarget.style.background = '#2c313a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title={contextProfile.directory ? contextProfile.directory : 'No instance directory configured'}
          >
            <span style={{ color: !contextProfile.directory ? '#555' : '#d19a66' }}>📁</span>
            Open in Explorer
          </div>

          {/* Copy Bookmark Link */}
          <div
            onClick={async () => {
              setContextMenu(prev => ({ ...prev, visible: false }));
              const ok = await copyBookmarkLink(contextMenu.serverKey);
              if (ok) {
                showMsg(contextMenu.serverKey, 'success', 'Bookmark link copied!');
              } else {
                showMsg(contextMenu.serverKey, 'error', 'Failed to copy link');
              }
            }}
            style={{
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              color: '#eee',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2c313a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Copy direct bookmark link to this server"
          >
            <span style={{ color: '#61afef' }}>🔗</span>
            Copy Bookmark Link
          </div>

          {/* Multi-Select Toggle */}
          {onSelectionChange && (
            <div
              onClick={() => {
                handleToggleSelect(contextMenu.serverKey, { stopPropagation: () => {} } as any);
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              style={{
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                color: '#eee',
                background: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2c313a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ color: '#98c379' }}>☑</span>
              {selectedKeys.includes(contextMenu.serverKey) ? 'Deselect Server' : 'Select for Batch Action'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

