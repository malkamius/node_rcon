import React, { useEffect, useState } from 'react';
import { SteamCmdManager } from './SteamCmdManager';
import { BaseInstallManager } from './BaseInstallManager';
import { InstanceManager } from './InstanceManager';

export const InstallManager: React.FC<{ ws: WebSocket | null, handleUpdateBaseInstallFiles: (path: string) => void }> = ({ ws, handleUpdateBaseInstallFiles }) => {
  const [baseInstalls, setBaseInstalls] = useState<any[]>([]);
  const [steamCmdDetected, setSteamCmdDetected] = useState(false);

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'baseInstalls') {
          setBaseInstalls(msg.baseInstalls || []);
        }
        if (msg.type === 'baseInstallsUpdated') {
          setBaseInstalls(msg.baseInstalls || []);
        }
        if (msg.type === 'getSteamCmdInstall') {
          setSteamCmdDetected(!!msg.result.found);
        }
      } catch {}
    };
    ws.addEventListener('message', handleMessage);
    ws.send(JSON.stringify({ type: 'getBaseInstalls', requestId: 'mgmt1' }));
    ws.send(JSON.stringify({ type: 'getSteamCmdInstall', requestId: 'mgmt2' }));
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h2>Server Management</h2>
      <SteamCmdManager ws={ws} />
      <BaseInstallManager ws={ws} steamCmdDetected={steamCmdDetected} handleUpdate={handleUpdateBaseInstallFiles} />
      <InstanceManager ws={ws} baseInstalls={baseInstalls} steamCmdDetected={steamCmdDetected} />
    </div>
  );
};
