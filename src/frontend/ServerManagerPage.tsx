
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchProcessStatusWS } from './processStatusApi';
// --- WebSocket request/response utility ---
function wsRequest(ws: WebSocket | null, payload: any, cb: (data: any) => void, timeout = 8000) {
  
  if (!ws || ws.readyState !== 1) {
    console.trace();
    cb({ error: 'WebSocket not connected' });
    return;
  }
  const requestId = 'req' + Math.random().toString(36).slice(2);
  payload.requestId = requestId;
  let timeoutTimer = setTimeout(() => {
    ws.removeEventListener('message', handleMessage);
    cb({ error: 'WebSocket request timeout' });
  }, timeout);

  const handleMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.requestId === requestId) {
        clearTimeout(timeoutTimer);
        ws.removeEventListener('message', handleMessage);
        cb(msg);
      }
    } catch {}
  };
  ws.addEventListener('message', handleMessage);
  
  ws.send(JSON.stringify(payload));
  
}
import { TabManager } from './TabManager';
import { RconClientWindow } from './RconClientWindow';
import { ServerConfigTab } from './ServerConfigTab';
import { ServerManagementModal, ServerProfile } from './ServerManagementModal';
// InstanceInstallModal is imported in ServerManagementModal
import { DisconnectedModal } from './DisconnectedModal';
import { RconTerminalManager, formatBroadcastResult } from './rconTerminalManager';

import { InstallManager } from './InstallManager';
import { ScriptExecutionModal } from './ScriptExecutionModal';
import { ServerLogsModal } from './ServerLogsModal';
import {
  ActivityTab,
  parseUrlParams,
  updateUrlHash,
  resolveBookmarkedServerKey,
  isValidActivity,
} from './urlRouting';


import { TabErrorBoundary } from './TabErrorBoundary';

export const ServerManagerPage: React.FC = () => {
  const [serverProfiles, setServerProfiles] = useState<ServerProfile[]>([]);
  const [serverPlayers, setServerPlayers] = useState<Record<string, any>>({});
  // statusMap: key -> { running, startTime, manuallyStopped, autoStart, baseInstallId }
  const [statusMap, setStatusMap] = useState<Record<string, any>>({});
  // rconStatusMap: key -> { status: 'connected' | 'connecting' | 'disconnected', since: number }
  const [rconStatusMap, setRconStatusMap] = useState<Record<string, any>>({});
  
  // Fetch process status from backend
  const loadProcessStatus = useCallback(async () => {
    try {
      const data = await fetchProcessStatusWS(wsRef.current);
      if (data && Array.isArray(data.status)) {
        // Map: key -> status object
        const map: Record<string, any> = {};
        for (const s of data.status) {
          map[s.key] = s;
        }
        setStatusMap(map);
      }
    } catch (e) {
      // Optionally handle error
    }
  }, []);

  // Poll process status every 10s
  useEffect(() => {
    loadProcessStatus();
    const interval = setInterval(loadProcessStatus, 10000);
    return () => clearInterval(interval);
  }, [loadProcessStatus]);
  // Deep URL routing initial parameters
  const initialParams = useRef(parseUrlParams());
  const [selectedKey, setSelectedKey] = useState<string | null>(initialParams.current.serverKey);
  const selectedKeyRef = useRef<string | null>(initialParams.current.serverKey);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [showScriptModal, setShowScriptModal] = useState<boolean>(false);
  const [scriptTargetKeys, setScriptTargetKeys] = useState<string[]>([]);
  const [showLogsModal, setShowLogsModal] = useState<boolean>(false);
  const [logsTargetKey, setLogsTargetKey] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityTab>(initialParams.current.activity || 'rcon');
  const activityRef = useRef<ActivityTab>(initialParams.current.activity || 'rcon');
  const serverProfilesRef = useRef<ServerProfile[]>([]);
  const [showServerModal, setShowServerModal] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [reconnectAttemptCount, setReconnectAttemptCount] = useState(0);
  const [nextRetrySeconds, setNextRetrySeconds] = useState(5);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(220);
  const [sidebarResizing, setSidebarResizing] = useState<boolean>(false);
  const sidebarStartX = useRef<number>(0);
  const sidebarStartWidth = useRef<number>(220);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalManager = useRef(new RconTerminalManager(100, wsRef));
  const broadcastResolversRef = useRef<Map<string, () => void>>(new Map());
  const [loadingSessions, setLoadingSessions] = useState<Record<string, boolean>>({});
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Resize listener for responsive mobile state
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep refs in sync
  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);

  useEffect(() => {
    serverProfilesRef.current = serverProfiles;
  }, [serverProfiles]);

  // Load session lines for a server key if not already cached
  const loadSessionLines = useCallback((key: string) => {
    if (!key || !wsRef.current || wsRef.current.readyState !== 1) return;
    if (!terminalManager.current.getSession(key).lines.length && !loadingSessions[key]) {
      setLoadingSessions((ls) => ({ ...ls, [key]: true }));
      wsRequest(wsRef.current, { type: 'getSessionLines', key }, (data) => {
        if (Array.isArray(data.lines)) {
          const session = terminalManager.current.getSession(key);
          session.lines = data.lines;
          setSessionVersion((v) => v + 1);
        } else {
          const session = terminalManager.current.getSession(key);
          session.lines = [];
          setSessionVersion((v) => v + 1);
        }
        setLoadingSessions((ls) => ({ ...ls, [key]: false }));
      });
    }
  }, [loadingSessions]);

  // Stop reconnection timers
  const stopReconnectTimers = useCallback(() => {
    if (reconnectTickerRef.current) {
      clearInterval(reconnectTickerRef.current);
      reconnectTickerRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Load server profiles (via WebSocket)
  const loadServerProfiles = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== 1) {
      setError('WebSocket not connected');
      return;
    }
    wsRequest(wsRef.current, { type: 'getProfiles' }, (msg) => {
      if (msg.error) {
        setError('Failed to load server profiles');
        return;
      }
      const profiles: ServerProfile[] = msg.profiles || [];
      setServerProfiles(profiles);
      serverProfilesRef.current = profiles;

      // Immediately populate statusMap from processStatus in profiles if present
      const initialStatusMap: Record<string, any> = {};
      for (const p of profiles) {
        const key = `${p.host}:${p.port}`;
        if (p.processStatus) initialStatusMap[key] = p.processStatus;
      }
      setStatusMap(initialStatusMap);
      setError(null);

      // Determine which server tab to select:
      // 1. If currently selected key is valid in profiles, preserve it
      // 2. Resolve bookmarked server from URL hash/query
      // 3. Fallback to first profile
      const currentSelected = selectedKeyRef.current;
      let keyToSelect: string | null = null;
      if (currentSelected && profiles.some((p) => `${p.host}:${p.port}` === currentSelected)) {
        keyToSelect = currentSelected;
      } else {
        const urlParams = parseUrlParams();
        const resolved = resolveBookmarkedServerKey(urlParams.serverKey, profiles);
        if (resolved) {
          keyToSelect = resolved;
        } else if (profiles.length > 0) {
          keyToSelect = `${profiles[0].host}:${profiles[0].port}`;
        }
      }

      if (keyToSelect) {
        setSelectedKey(keyToSelect);
        updateUrlHash(keyToSelect, activityRef.current);
        loadSessionLines(keyToSelect);
      }
    });
  }, [loadSessionLines]);

  // Start 5-second automatic reconnect cycle with 1-second countdown ticker
  const startReconnectCycle = useCallback(() => {
    stopReconnectTimers();
    setDisconnected(true);
    setIsReconnecting(false);
    setNextRetrySeconds(5);

    // 1-second interval ticker for countdown display
    reconnectTickerRef.current = setInterval(() => {
      setNextRetrySeconds((prev) => {
        if (prev <= 1) {
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    // 5-second automatic reconnection attempt
    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttemptCount((prev) => prev + 1);
      setIsReconnecting(true);
      connectWebSocket();
    }, 5000);
  }, [stopReconnectTimers]);

  // WebSocket connection & reconnect loop
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    const ws = new window.WebSocket(`ws://${window.location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      stopReconnectTimers();
      setDisconnected(false);
      setIsReconnecting(false);
      setReconnectAttemptCount(0);
      setNextRetrySeconds(5);
      loadServerProfiles();
    };

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'sessionLine' && msg.key && msg.line) {
          // Real-time new line from backend
          terminalManager.current.appendLine(msg.key, msg.line.text, msg.line.timestamp, false);
          if (selectedKeyRef.current === msg.key) setSessionVersion((v) => v + 1);
        } else if (msg.type === 'getSessionLines' && msg.key) {
          // Initial load of session lines
          const session = terminalManager.current.getSession(msg.key);
          if (Array.isArray(msg.lines)) {
            session.lines = msg.lines;
          }
          setSessionVersion((v) => v + 1);
        } else if (msg.type === 'broadcastCommandResult') {
          const lines = formatBroadcastResult(
            msg.command || '',
            msg.results || [],
            serverProfilesRef.current.length > 0 ? serverProfilesRef.current : serverProfiles
          );
          const broadcastSession = terminalManager.current.getSession('__broadcast__');
          const linesToAppend =
            broadcastSession.lines.length > 0 && broadcastSession.lines[broadcastSession.lines.length - 1].text === lines[0]
              ? lines.slice(1)
              : lines;
          for (const line of linesToAppend) {
            terminalManager.current.appendLine('__broadcast__', line, undefined, false);
          }
          if (msg.guid && broadcastResolversRef.current.has(msg.guid)) {
            const resolve = broadcastResolversRef.current.get(msg.guid);
            broadcastResolversRef.current.delete(msg.guid);
            resolve?.();
          } else if (broadcastResolversRef.current.size > 0) {
            const firstEntry = broadcastResolversRef.current.entries().next();
            if (!firstEntry.done) {
              const [firstGuid, firstResolver] = firstEntry.value;
              broadcastResolversRef.current.delete(firstGuid);
              firstResolver();
            }
          }
          setSessionVersion((v) => v + 1);
        } else if (msg.type === 'status') {
          setRconStatusMap((prev) => {
            const statusMap = { ...prev };
            for (const s of msg.data) {
              statusMap[s.key] = { status: s.status, since: s.since };
            }
            return statusMap;
          });
        } else if (msg.type === 'processStatus' && msg.key && msg.status) {
          // Real-time process status update from backend
          setStatusMap((prev) => ({ ...prev, [msg.key]: { ...prev[msg.key], ...msg.status } }));
        } else if (msg.type === 'output' && msg.key && typeof msg.output === 'string') {
          terminalManager.current.appendLine(msg.key, msg.output.replace(/\r?\n/g, '\r\n'), undefined, false);
          setSessionVersion((v) => v + 1);
        } else if (msg.type === 'chatMessage' && msg.key && typeof msg.output === 'string') {
          terminalManager.current.appendLine(msg.key, msg.output.replace(/\r?\n/g, '\r\n'), undefined, false);
          if (selectedKeyRef.current === msg.key) setSessionVersion((v) => v + 1);
        } else if (msg.type === 'currentPlayers' && msg.key) {
          setServerPlayers((prev) => ({
            ...prev,
            [msg.key]: {
              players: Array.isArray(msg.currentPlayers) ? msg.currentPlayers : [],
              lastUpdate: Date.now(),
            },
          }));
        } else if (msg.type === 'profilesChanged') {
          loadServerProfiles();
        }
      } catch {}
    });

    ws.onerror = () => {
      setDisconnected(true);
      setIsReconnecting(false);
    };

    ws.onclose = () => {
      setDisconnected(true);
      setIsReconnecting(false);
      startReconnectCycle();
    };
  }, [loadServerProfiles, startReconnectCycle, stopReconnectTimers]);

  // Manual retry trigger (when user clicks "Retry Now")
  const handleManualRetry = useCallback(() => {
    stopReconnectTimers();
    setReconnectAttemptCount((prev) => prev + 1);
    setIsReconnecting(true);
    connectWebSocket();
  }, [connectWebSocket, stopReconnectTimers]);

  // Initial load & cleanup
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      stopReconnectTimers();
    };
  }, [connectWebSocket, stopReconnectTimers]);

  // Listen for browser back/forward navigation and direct hash changes
  useEffect(() => {
    const handleUrlChange = () => {
      const parsed = parseUrlParams();
      if (parsed.activity && isValidActivity(parsed.activity) && parsed.activity !== activityRef.current) {
        setActivity(parsed.activity);
      }
      if (parsed.serverKey) {
        const resolved = resolveBookmarkedServerKey(parsed.serverKey, serverProfilesRef.current);
        const target = resolved || parsed.serverKey;
        if (target && target !== selectedKeyRef.current) {
          setSelectedKey(target);
          loadSessionLines(target);
        }
      }
    };

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [loadSessionLines]);

  // Tab select handler: load session lines if not loaded (WebSocket only)
  const handleTabSelect = (key: string, syncUrl: boolean = true) => {
    setSelectedKey(key);
    if (syncUrl) {
      updateUrlHash(key, activityRef.current);
    }
    loadSessionLines(key);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  // Send RCON command
  const handleSendCommand = (key: string, command: string, guid: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'command', key, command, guid }));
    // terminalManager.appendLine(key, '> ' + command, undefined, true, guid, 'command');
    setSessionVersion((v) => v + 1);
  };

  // Broadcast RCON command to multiple servers
  const handleBroadcastCommand = (keys: string[], command: string, guid: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket is not connected');
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'broadcastCommand', keys, command, guid }));
    terminalManager.current.appendLine(
      '__broadcast__',
      `\x1b[1;36m[BROADCAST]\x1b[0m > ${command}`,
      undefined,
      false,
      guid,
      'command'
    );
    setSessionVersion((v) => v + 1);

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        broadcastResolversRef.current.delete(guid);
        resolve();
      }, 15000);
      broadcastResolversRef.current.set(guid, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  const handleSendShutdown = (keys: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
    {
      setError('WebSocket is not connected');
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'shutdownserver', keys }));
  };

  
  const handleSendForceStart = (keys: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
    {
      setError('WebSocket is not connected');
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'startserver', keys }));
  };

  // Server management modal
  const handleManageServers = () => setShowServerModal(true);
  const handleCloseServerModal = () => {
    setShowServerModal(false);
    loadServerProfiles();
  };
  const handleSaveServerProfiles = (profiles: ServerProfile[]) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) {
      setError('WebSocket not connected');
      return;
    }
    wsRequest(wsRef.current, { type: 'saveProfiles', profiles }, (msg) => {
      if (msg.error) {
        setError('Failed to save server profiles');
      } else {
        setServerProfiles(profiles);
        setError(null);
      }
    });
  };

  // Error clear
  const clearError = () => setError(null);

  // Activity tab switch
  const handleActivitySwitch = (tab: ActivityTab, syncUrl: boolean = true) => {
    setActivity(tab);
    if (syncUrl) {
      updateUrlHash(selectedKeyRef.current, tab);
    }
  };


  // Sidebar resize handlers
  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    setSidebarResizing(true);
    sidebarStartX.current = e.clientX;
    sidebarStartWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  };

  useEffect(() => {
    if (!sidebarResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - sidebarStartX.current;
      let newWidth = Math.max(120, sidebarStartWidth.current + delta);
      newWidth = Math.min(newWidth, 400);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setSidebarResizing(false);
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sidebarResizing]);

  function handleUpdateBaseInstall(path: string): void {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
    {
      setError('WebSocket is not connected');
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'updatebaseinstall', path }));
  }

  // Render
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', minWidth: 0 }}>
      {error && (
        <div style={{ background: '#ffdddd', color: '#a00', padding: '8px 16px', textAlign: 'center', fontWeight: 600, borderBottom: '2px solid #a00', zIndex: 10001 }}>
          {error}
          <button onClick={clearError} style={{ marginLeft: 16, background: 'none', border: 'none', color: '#a00', fontWeight: 700, cursor: 'pointer' }}>×</button>
        </div>
      )}
      {/* Activity Tab Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#222',
          color: '#fff',
          padding: '0.5em 1em',
          minHeight: '3.2em',
          height: 'auto',
          flexWrap: 'wrap',
          gap: '0.5em',
          overflowX: 'auto',
        }}
      >
        {isMobile && (
          <button
            aria-label="Toggle server list drawer"
            onClick={() => setSidebarOpen((prev) => !prev)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1.4em',
              cursor: 'pointer',
              padding: '4px 8px',
              marginRight: '0.25em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 40,
              minHeight: 40,
            }}
          >
            ☰
          </button>
        )}
        <span style={{ fontWeight: 'bold', fontSize: '1.2em', marginRight: isMobile ? '0.5em' : '1.5em', whiteSpace: 'nowrap' }}>
          Server Manager
        </span>
        <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap' }}>
          <button
            style={{
              background: activity === 'rcon' ? '#444' : 'transparent',
              color: '#fff',
              border: 'none',
              borderBottom: activity === 'rcon' ? '2px solid #fff' : '2px solid transparent',
              fontWeight: activity === 'rcon' ? 'bold' : 'normal',
              fontSize: '1em',
              padding: '0.5em 0.9em',
              minHeight: 36,
              cursor: 'pointer',
              borderRadius: 4,
            }}
            onClick={() => handleActivitySwitch('rcon')}
          >
            RCON
          </button>
          <button
            style={{
              background: activity === 'config' ? '#444' : 'transparent',
              color: '#fff',
              border: 'none',
              borderBottom: activity === 'config' ? '2px solid #fff' : '2px solid transparent',
              fontWeight: activity === 'config' ? 'bold' : 'normal',
              fontSize: '1em',
              padding: '0.5em 0.9em',
              minHeight: 36,
              cursor: 'pointer',
              borderRadius: 4,
            }}
            onClick={() => handleActivitySwitch('config')}
          >
            Config
          </button>
          <button
            style={{
              background: activity === 'baseinstalls' ? '#444' : 'transparent',
              color: '#fff',
              border: 'none',
              borderBottom: activity === 'baseinstalls' ? '2px solid #fff' : '2px solid transparent',
              fontWeight: activity === 'baseinstalls' ? 'bold' : 'normal',
              fontSize: '1em',
              padding: '0.5em 0.9em',
              minHeight: 36,
              cursor: 'pointer',
              borderRadius: 4,
            }}
            onClick={() => handleActivitySwitch('baseinstalls')}
          >
            Base Installs
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <button
          style={{
            marginRight: isMobile ? 0 : '1em',
            padding: '0.5em 1em',
            minHeight: 36,
            borderRadius: 4,
            background: '#3a3f4b',
            color: '#fff',
            border: '1px solid #555',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onClick={handleManageServers}
        >
          Manage Servers
        </button>
      </div>
      {/* Main flex row: sidebar + content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
        {/* Mobile Drawer (Overlay & Backdrop) */}
        {isMobile && sidebarOpen && (
          <>
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                zIndex: 998,
              }}
            />
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: 'min(320px, 85vw)',
                background: '#191c20',
                zIndex: 999,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '4px 0 20px rgba(0,0,0,0.6)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#222',
                  borderBottom: '1px solid #333',
                }}
              >
                <span style={{ fontWeight: 'bold', fontSize: '1.1em', color: '#fff' }}>Servers</span>
                <button
                  aria-label="Close server drawer"
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ccc',
                    fontSize: '1.2em',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    minWidth: 32,
                    minHeight: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <TabManager
                  serverProfiles={serverProfiles}
                  statusMap={statusMap}
                  rconStatusMap={rconStatusMap}
                  onTabSelect={handleTabSelect}
                  activeTab={selectedKey}
                  onHandleSendServerShutdown={handleSendShutdown}
                  onHandleSendForceStart={handleSendForceStart}
                  onExecuteScript={(keys) => {
                    setScriptTargetKeys(keys);
                    setShowScriptModal(true);
                    setSidebarOpen(false);
                  }}
                  onViewLogs={(key) => {
                    setLogsTargetKey(key);
                    setShowLogsModal(true);
                    setSidebarOpen(false);
                  }}
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedKeys}
                />
              </div>
            </div>
          </>
        )}

        {/* Desktop Sidebar (inline) */}
        {!isMobile && (
          <div
            style={{
              width: sidebarWidth,
              minWidth: 120,
              maxWidth: 400,
              background: '#191c20',
              borderRight: '1px solid #333',
              color: '#eee',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 2,
              position: 'relative',
              height: '100%',
              flexShrink: 0,
              flexGrow: 0,
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <TabManager
                serverProfiles={serverProfiles}
                statusMap={statusMap}
                rconStatusMap={rconStatusMap}
                onTabSelect={handleTabSelect}
                activeTab={selectedKey}
                onHandleSendServerShutdown={handleSendShutdown}
                onHandleSendForceStart={handleSendForceStart}
                onExecuteScript={(keys) => {
                  setScriptTargetKeys(keys);
                  setShowScriptModal(true);
                }}
                onViewLogs={(key) => {
                  setLogsTargetKey(key);
                  setShowLogsModal(true);
                }}
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              />
            </div>
            {/* Sidebar resize handle */}
            <div
              style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 30, background: 'transparent' }}
              onMouseDown={handleSidebarResizeStart}
            />
          </div>
        )}
        {/* Main content area */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Multi-server info banner when 2+ servers are selected in RCON view */}
          {activity === 'rcon' && selectedKeys.length > 1 && (
            <div
              style={{
                background: '#282c34',
                borderBottom: '1px solid #3a424e',
                padding: '8px 16px',
                color: '#61afef',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 13,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span>
                ℹ️ <b>Multi-Server Selection Active:</b> {selectedKeys.length} servers selected. Commands entered in the terminal input broadcast to all selected servers. You can also use sidebar batch controls to Start, Stop, or Execute Scripts simultaneously.
              </span>
              <button
                onClick={() => {
                  setScriptTargetKeys(selectedKeys);
                  setShowScriptModal(true);
                }}
                style={{
                  background: '#3a3f4b',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: 4,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: 32,
                  flexShrink: 0,
                }}
              >
                Execute Script on All ({selectedKeys.length})
              </button>
            </div>
          )}
          <TabErrorBoundary tabName={activity} key={activity}>
            {activity === 'rcon' && (selectedKey || selectedKeys.length > 1) ? (
              <RconClientWindow
                serverProfiles={serverProfiles}
                statusMap={statusMap}
                rconStatusMap={rconStatusMap}
                selectedKey={selectedKey}
                selectedKeys={selectedKeys}
                onTabSelect={handleTabSelect}
                onManageServers={handleManageServers}
                terminalManager={terminalManager.current}
                sessionVersion={sessionVersion}
                onSendCommand={handleSendCommand}
                onBroadcastCommand={handleBroadcastCommand}
                onDeselectAll={() => setSelectedKeys([])}
                onClearLog={(key) => {
                  terminalManager.current.clear(key, wsRef.current);
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'clearSessionLines', key }));
                  }
                  setSessionVersion((v) => v + 1);
                }}
                currentPlayers={serverPlayers[selectedKey || ''] || { players: [], lastUpdate: null }} 
                disabled={selectedKeys.length <= 1 && (!selectedKey || !!loadingSessions[selectedKey])}
              />
            ) : activity === 'config' ? (
              <ServerConfigTab
                serverProfiles={serverProfiles}
                statusMap={statusMap}
                selectedKey={selectedKey}
                onTabSelect={handleTabSelect}
                onManageServers={handleManageServers}
                onViewLogs={(key) => {
                  setLogsTargetKey(key);
                  setShowLogsModal(true);
                }}
                wsRef={wsRef}
              />
            ) : activity === 'baseinstalls' ? (
              <InstallManager 
                handleUpdateBaseInstallFiles={handleUpdateBaseInstall}
                ws={wsRef.current}
                wsRef={wsRef}
                active={activity === 'baseinstalls'}
              />
            ) : null}
          </TabErrorBoundary>
        </div>
      </div>
      {/* Script Execution Modal */}
      <ScriptExecutionModal
        open={showScriptModal}
        onClose={() => setShowScriptModal(false)}
        serverKeys={scriptTargetKeys}
        serverProfiles={serverProfiles}
      />
      {/* Server Crash & Engine Logs Modal */}
      <ServerLogsModal
        open={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        serverKey={logsTargetKey || selectedKey}
        serverProfiles={serverProfiles}
        statusMap={statusMap}
      />
      {/* Disconnected Modal */}
      <DisconnectedModal
        show={!!disconnected}
        onRetry={handleManualRetry}
        attemptCount={reconnectAttemptCount || 1}
        nextRetrySeconds={nextRetrySeconds}
        isReconnecting={isReconnecting}
        backendUrl={`ws://${typeof window !== 'undefined' ? window.location.host : 'localhost'}`}
      />
      {/* Server Management Modal */}
      <ServerManagementModal
        show={showServerModal}
        onClose={handleCloseServerModal}
        serverProfiles={serverProfiles}
        onSave={handleSaveServerProfiles}
        wsRef={wsRef}
        error={error}
        clearError={clearError}
      />
    </div>
  );
};
