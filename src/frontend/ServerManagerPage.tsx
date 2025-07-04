
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchProcessStatus } from './processStatusApi';
import { TabManager } from './TabManager';
import { RconClientWindow } from './RconClientWindow';
import { ServerConfigTab } from './ServerConfigTab';
import { ServerManagementModal } from './ServerManagementModal';
import { DisconnectedModal } from './DisconnectedModal';
import { RconTerminalManager } from './rconTerminalManager';

import { BaseInstallManager } from './BaseInstallManager';

interface ServerProfile {
  name: string;
  host: string;
  port: number;
  password: string;
  game?: string;
  features?: any;
  layout?: any;
  directory?: string;
}

type ActivityTab = 'rcon' | 'config' | 'baseinstalls';

const terminalManager = new RconTerminalManager();

export const ServerManagerPage: React.FC = () => {
  const [serverProfiles, setServerProfiles] = useState<ServerProfile[]>([]);
  // statusMap: key -> { running, startTime, manuallyStopped, autoStart, baseInstallId }
  const [statusMap, setStatusMap] = useState<Record<string, any>>({});
  // rconStatusMap: key -> { status: 'connected' | 'connecting' | 'disconnected', since: number }
  const [rconStatusMap, setRconStatusMap] = useState<Record<string, any>>({});
  // Fetch process status from backend
  const loadProcessStatus = useCallback(async () => {
    try {
      const data = await fetchProcessStatus();
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedKeyRef = useRef<string | null>(null);
  const [activity, setActivity] = useState<ActivityTab>('rcon');
  const [showServerModal, setShowServerModal] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(220);
  const [sidebarResizing, setSidebarResizing] = useState<boolean>(false);
  const sidebarStartX = useRef<number>(0);
  const sidebarStartWidth = useRef<number>(220);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track loading state for each session key
  const [loadingSessions, setLoadingSessions] = useState<Record<string, boolean>>({});
  // Keep selectedKeyRef in sync
  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  // Load server profiles
  const loadServerProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/profiles');
      if (res.ok) {
        const profiles = await res.json();
        setServerProfiles(profiles);
        setError(null);
        if (!selectedKey && profiles.length > 0) {
          let key = `${profiles[0].host}:${profiles[0].port}`;
          setSelectedKey(key);
          if (!terminalManager.getSession(key).lines.length && !loadingSessions[key]) {
            setLoadingSessions(ls => ({ ...ls, [key]: true }));
            fetch(`/api/session-lines/${encodeURIComponent(key)}`)
              .then(res => res.json())
              .then(data => {
                if (Array.isArray(data.lines)) {
                  const session = terminalManager.getSession(key);
                  session.lines = data.lines;
                  setSessionVersion(v => v + 1);
                }
              })
              .finally(() => setLoadingSessions(ls => ({ ...ls, [key]: false })));
          }
        }
      } else {
        setError('Failed to load server profiles');
      }
    } catch (e) {
      setError('Failed to load server profiles');
      // eslint-disable-next-line no-console
      console.error('Failed to load server profiles', e);
    }
  }, [selectedKey]);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    const ws = new window.WebSocket(`ws://${window.location.host}`);
    wsRef.current = ws;
    ws.onopen = () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      setDisconnected(false);
    };
    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'sessionLine' && msg.key && msg.line) {
          // Real-time new line from backend
          terminalManager.appendLine(msg.key, msg.line.text, msg.line.timestamp, false);
          if (selectedKeyRef.current === msg.key) setSessionVersion((v) => v + 1);
        } else if (msg.type === 'sessionLines' && msg.key) {
          // Initial load of session lines
          const session = terminalManager.getSession(msg.key);
          session.lines = [];
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
          terminalManager.appendLine(msg.key, msg.output.replace(/\r?\n/g, '\r\n'), undefined, false);
          setSessionVersion((v) => v + 1);
        } else if (msg.type === 'chatMessage' && msg.key && typeof msg.output === 'string') {
          terminalManager.appendLine(msg.key, msg.output.replace(/\r?\n/g, '\r\n'), undefined, false);
          if (selectedKeyRef.current === msg.key) setSessionVersion((v) => v + 1);
        }
      } catch {}
    };
    ws.onclose = () => {
      setDisconnected(true);
      if (!reconnectTimer.current) {
        reconnectTimer.current = setTimeout(() => connectWebSocket(), 5000);
      }
    };
  }, []);

  // Initial load
  useEffect(() => {
    loadServerProfiles();
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab select handler: load session lines if not loaded
  const handleTabSelect = (key: string) => {
    setSelectedKey(key);
    if (!terminalManager.getSession(key).lines.length && !loadingSessions[key]) {
      setLoadingSessions(ls => ({ ...ls, [key]: true }));
      fetch(`/api/session-lines/${encodeURIComponent(key)}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data.lines)) {
            const session = terminalManager.getSession(key);
            session.lines = data.lines;
            setSessionVersion(v => v + 1);
          }
        })
        .finally(() => setLoadingSessions(ls => ({ ...ls, [key]: false })));
    }
  };

  // Send RCON command
  const handleSendCommand = (key: string, command: string, guid: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'command', key, command, guid }));
    // terminalManager.appendLine(key, '> ' + command, undefined, true, guid, 'command');
    setSessionVersion((v) => v + 1);
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
  const handleSaveServerProfiles = async (profiles: ServerProfile[]) => {
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profiles),
      });
      if (res.ok) {
        setServerProfiles(profiles);
        setError(null);
      } else {
        setError('Failed to save server profiles');
      }
    } catch (e) {
      setError('Failed to save server profiles');
    }
  };

  // Error clear
  const clearError = () => setError(null);

  // Activity tab switch
  const handleActivitySwitch = (tab: ActivityTab) => setActivity(tab);


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
      <div style={{ display: 'flex', alignItems: 'center', background: '#222', color: '#fff', padding: '0.5em 1em', height: '3em', overflowX: 'auto' }}>
        <span style={{ fontWeight: 'bold', fontSize: '1.2em', marginRight: '2em' }}>Server Manager</span>
        <div style={{ display: 'flex', gap: '1em' }}>
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
            onClick={() => handleActivitySwitch('rcon')}
          >RCON</button>
          <button
            style={{
              background: activity === 'config' ? '#444' : 'transparent',
              color: '#fff',
              border: 'none',
              borderBottom: activity === 'config' ? '2px solid #fff' : '2px solid transparent',
              fontWeight: activity === 'config' ? 'bold' : 'normal',
              fontSize: '1em',
              padding: '0.5em 1em',
              cursor: 'pointer',
            }}
            onClick={() => handleActivitySwitch('config')}
          >Config</button>
          <button
            style={{
              background: activity === 'baseinstalls' ? '#444' : 'transparent',
              color: '#fff',
              border: 'none',
              borderBottom: activity === 'baseinstalls' ? '2px solid #fff' : '2px solid transparent',
              fontWeight: activity === 'baseinstalls' ? 'bold' : 'normal',
              fontSize: '1em',
              padding: '0.5em 1em',
              cursor: 'pointer',
            }}
            onClick={() => handleActivitySwitch('baseinstalls')}
          >Base Installs</button>
        </div>
        <span style={{ flex: 1 }} />
        <button style={{ marginRight: '1em' }} onClick={handleManageServers}>Manage Servers</button>
      </div>
      {/* Main flex row: sidebar + content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        {/* Sidebar */}
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
            />
          </div>
          {/* Sidebar resize handle */}
          <div
            style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 30, background: 'transparent' }}
            onMouseDown={handleSidebarResizeStart}
          />
        </div>
        {/* Main content area */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activity === 'rcon' && selectedKey ? (
            <RconClientWindow
              serverProfiles={serverProfiles}
              statusMap={statusMap}
              rconStatusMap={rconStatusMap}
              selectedKey={selectedKey}
              onTabSelect={handleTabSelect}
              onManageServers={handleManageServers}
              terminalManager={terminalManager}
              sessionVersion={sessionVersion}
              onSendCommand={handleSendCommand}
              disabled={!!loadingSessions[selectedKey]}
            />
          ) : activity === 'config' ? (
            <ServerConfigTab
              serverProfiles={serverProfiles}
              statusMap={statusMap}
              selectedKey={selectedKey}
              onTabSelect={handleTabSelect}
              onManageServers={handleManageServers}
            />
          ) : activity === 'baseinstalls' ? (
            <BaseInstallManager 
            handleUpdate={handleUpdateBaseInstall}/>
          ) : null}
        </div>
      </div>
      {/* Disconnected Modal */}
      <DisconnectedModal show={!!disconnected} onRetry={connectWebSocket} />
      {/* Server Management Modal */}
      <ServerManagementModal
        show={showServerModal}
        onClose={handleCloseServerModal}
        serverProfiles={serverProfiles}
        onSave={handleSaveServerProfiles}
        error={error}
        clearError={clearError}
      />
    </div>
  );
};
