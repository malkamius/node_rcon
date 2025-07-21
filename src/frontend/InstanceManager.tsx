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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const handleInstall = () => {
    setError(null);
    setSuccess(null);
    if (!selectedBase || !instancePath) {
      setError('Select a base install and enter an instance path.');
      return;
    }
    setInstalling(true);
    ws?.send(JSON.stringify({
      type: 'installInstance',
      baseInstallPath: baseInstalls.find(b => b.id === selectedBase)?.path,
      instanceDirectory: instancePath,
      requestId: 'instance1',
      // Add other required fields as needed
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
    <div style={{ marginBottom: 24, background: '#23272e', padding: 16, borderRadius: 8 }}>
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
      <button
        onClick={handleInstall}
        disabled={!baseInstalls.length || !steamCmdDetected || installing}
      >
        {installing ? 'Installing...' : 'Install Instance'}
      </button>
      {error && <div style={{ color: '#f66', marginTop: 8 }}>{error}</div>}
      {success && <div style={{ color: '#6f6', marginTop: 8 }}>{success}</div>}
    </div>
  );
};
