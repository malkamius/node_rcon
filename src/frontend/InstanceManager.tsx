import React, { useEffect, useState } from 'react';

interface BaseInstall {
  id: string;
  path: string;
}

interface InstanceManagerProps {
  ws: WebSocket | null;
  baseInstalls: BaseInstall[];
  steamCmdDetected: boolean;
}


export const InstanceManager: React.FC<InstanceManagerProps> = ({ ws, baseInstalls, steamCmdDetected }) => {
  const [selectedBase, setSelectedBase] = useState<string>('');
  const [instancePath, setInstancePath] = useState('');
  const [queryPort, setQueryPort] = useState<number>(27020);
  const [gamePort, setGamePort] = useState<number>(7777);
  const [mapName, setMapName] = useState<string>('TheIsland');
  const [sessionName, setSessionName] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [serverPassword, setServerPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const handleInstall = () => {
    setError(null);
    setSuccess(null);
    if (!selectedBase || !instancePath || !queryPort || !gamePort || !mapName || !sessionName || !adminPassword) {
      setError('Please fill in all required fields.');
      return;
    }
    setInstalling(true);
    ws?.send(JSON.stringify({
      type: 'installInstance',
      baseInstallPath: baseInstalls.find(b => b.id === selectedBase)?.path,
      instanceDirectory: instancePath,
      queryPort,
      gamePort,
      mapName,
      sessionName,
      adminPassword,
      serverPassword,
      requestId: 'instance1',
    }));
  };

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'installInstance' && msg.requestId === 'instance1') {
          setInstalling(false);
          if (msg.ok) {
            setSuccess('Instance installed successfully.');
          } else {
            setError(msg.error || 'Failed to install instance.');
          }
        }
      } catch {}
    };
    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  return (
    <div style={{ marginBottom: 24, background: '#23272e', padding: 16, borderRadius: 8, maxWidth: 500 }}>
      <h3>Instance Management</h3>
      <div style={{ marginBottom: 8 }}>
        <label>Base Install:
          <select
            value={selectedBase}
            onChange={e => setSelectedBase(e.target.value)}
            disabled={!baseInstalls.length || !steamCmdDetected}
            style={{ marginLeft: 8 }}
          >
            <option value="">-- Select --</option>
            {baseInstalls.map(b => (
              <option key={b.id} value={b.id}>{b.id} ({b.path})</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Instance Path:
          <input
            value={instancePath}
            onChange={e => setInstancePath(e.target.value)}
            disabled={!baseInstalls.length || !steamCmdDetected}
            style={{ marginLeft: 8, width: 200 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Query Port:
          <input
            type="number"
            value={queryPort}
            onChange={e => setQueryPort(Number(e.target.value))}
            disabled={!baseInstalls.length || !steamCmdDetected}
            style={{ marginLeft: 8, width: 120 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Game Port:
          <input
            type="number"
            value={gamePort}
            onChange={e => setGamePort(Number(e.target.value))}
            disabled={!baseInstalls.length || !steamCmdDetected}
            style={{ marginLeft: 8, width: 120 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Map Name:
          <input
            value={mapName}
            onChange={e => setMapName(e.target.value)}
            disabled={!baseInstalls.length || !steamCmdDetected}
            style={{ marginLeft: 8, width: 180 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Session Name:
          <input
            value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            disabled={!baseInstalls.length || !steamCmdDetected}
            style={{ marginLeft: 8, width: 180 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Admin Password:
          <input
            type="password"
            value={adminPassword}
            onChange={e => setAdminPassword(e.target.value)}
            disabled={!baseInstalls.length || !steamCmdDetected}
            style={{ marginLeft: 8, width: 180 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Server Password (optional):
          <input
            type="password"
            value={serverPassword}
            onChange={e => setServerPassword(e.target.value)}
            disabled={!baseInstalls.length || !steamCmdDetected}
            style={{ marginLeft: 8, width: 180 }}
          />
        </label>
      </div>
      <button
        onClick={handleInstall}
        disabled={!baseInstalls.length || !steamCmdDetected || installing}
        style={{ marginTop: 8 }}
      >
        {installing ? 'Installing...' : 'Install Instance'}
      </button>
      {error && <div style={{ color: '#f66', marginTop: 8 }}>{error}</div>}
      {success && <div style={{ color: '#6f6', marginTop: 8 }}>{success}</div>}
    </div>
  );
};
