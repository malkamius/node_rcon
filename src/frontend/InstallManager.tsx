import React, { useEffect, useState } from 'react';
import { SteamCmdManager } from './SteamCmdManager';
import { BaseInstallManager } from './BaseInstallManager';

interface InstallManagerProps {
  ws?: WebSocket | null;
  wsRef?: React.MutableRefObject<WebSocket | null>;
  handleUpdateBaseInstallFiles: (path: string) => void;
  active?: boolean;
}

export const InstallManager: React.FC<InstallManagerProps> = ({ ws, wsRef, handleUpdateBaseInstallFiles, active }) => {
  const [baseInstalls, setBaseInstalls] = useState<any[]>([]);
  const [steamCmdDetected, setSteamCmdDetected] = useState(false);

  const effectiveWs = (wsRef ? wsRef.current : ws) || null;

  useEffect(() => {
    const socket = wsRef ? wsRef.current : ws;
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'baseInstalls') {
          setBaseInstalls(msg.baseInstalls || []);
        }
        if (msg.type === 'baseInstallsUpdated') {
          setBaseInstalls(msg.baseInstalls || []);
        }
        if (msg.type === 'getSteamCmdInstall' && msg.result) {
          setSteamCmdDetected(!!msg.result.found);
        }
      } catch {}
    };

    const sendInitialRequests = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'getBaseInstalls', requestId: 'mgmt1' }));
        socket.send(JSON.stringify({ type: 'getSteamCmdInstall', requestId: 'mgmt2' }));
      }
    };

    socket.addEventListener('message', handleMessage);

    if (socket.readyState === WebSocket.OPEN) {
      sendInitialRequests();
    } else if (socket.readyState === WebSocket.CONNECTING) {
      socket.addEventListener('open', sendInitialRequests);
    }

    return () => {
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('open', sendInitialRequests);
    };
  }, [ws, wsRef]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, overflow: 'auto' }}>
      <h2>Server Management</h2>
      <SteamCmdManager ws={effectiveWs} />
      <BaseInstallManager ws={effectiveWs} steamCmdDetected={steamCmdDetected} handleUpdate={handleUpdateBaseInstallFiles} active={active} />
    </div>
  );
};
