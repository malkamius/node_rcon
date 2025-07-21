import React, { useEffect, useState } from 'react';

interface SteamCmdManagerProps {
  ws: WebSocket | null;
}

export const SteamCmdManager: React.FC<SteamCmdManagerProps> = ({ ws }) => {
  const [steamCmdPath, setSteamCmdPath] = useState('');
  const [detected, setDetected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'getSteamCmdInstall') {
          setSteamCmdPath(msg.result.steamCmdPath || '');
          setDetected(!!msg.result.found);
          setLoading(false);
        }
        if (msg.type === 'installSteamCmd') {
          setInstalling(false);
          if (msg.ok) {
            setDetected(true);
          } else {
            setError(msg.error || 'Failed to install SteamCMD');
          }
        }
      } catch {}
    };
    ws.addEventListener('message', handleMessage);
    ws.send(JSON.stringify({ type: 'getSteamCmdInstall', requestId: 'steamcmd1' }));
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  const handleInstall = () => {
    if (!ws) return;
    setInstalling(true);
    setError(null);
    ws.send(JSON.stringify({ type: 'installSteamCmd', baseInstallPath: steamCmdPath, requestId: 'steamcmd2' }));
  };

  return (
    <div style={{ marginBottom: 24, background: '#23272e', padding: 16, borderRadius: 8 }}>
      <h3>SteamCMD Management</h3>
      {loading ? <div>Loading...</div> : (
        <>
          <div style={{ marginBottom: 8 }}>
            <label>SteamCMD Path:<br />
              <input
                value={steamCmdPath}
                onChange={e => setSteamCmdPath(e.target.value)}
                style={{ width: '100%' }}
                disabled={installing}
              />
            </label>
          </div>
          <div style={{ marginBottom: 8 }}>
            Status: {detected ? <span style={{ color: '#6f6' }}>Detected</span> : <span style={{ color: '#fa0' }}>Not Found</span>}
          </div>
          {!detected && (
            <button onClick={handleInstall} disabled={installing}>
              {installing ? 'Installing...' : 'Install SteamCMD'}
            </button>
          )}
          {error && <div style={{ color: '#f66' }}>{error}</div>}
        </>
      )}
    </div>
  );
};
