import React, { useState } from 'react';

interface TabManagerProps {
  serverProfiles: { name: string; host: string; port: number; password: string }[];
  // statusMap: key -> { running, startTime, manuallyStopped, autoStart, baseInstallId }
  statusMap: Record<string, any>;
  rconStatusMap: Record<string, any>;
  onTabSelect: (key: string) => void;
  activeTab: string | null;
}

export const TabManager: React.FC<TabManagerProps> = ({ serverProfiles, statusMap, rconStatusMap, onTabSelect, activeTab }) => {
  const [actionMsg, setActionMsg] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});
  // Helper to show a message for a key
  const showMsg = (key: string, type: 'success' | 'error', text: string) => {
    setActionMsg((prev) => ({ ...prev, [key]: { type, text } }));
    setTimeout(() => setActionMsg((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    }), 2500);
  };
  return (
    <div>
      {serverProfiles.map((profile) => {
        const key = profile.host + ':' + profile.port;
        const procStatus = statusMap[key];
        const running = !!procStatus?.running;
        const manuallyStopped = !!procStatus?.manuallyStopped;
        const autoStart = !!procStatus?.autoStart;
        const startTime = procStatus?.startTime;
        let statusLabel = rconStatusMap[key]?.status === 'connecting' ? 'Connecting...' : rconStatusMap[key]?.status === 'connected' ? 'Connected' : running ? 'Running' : (manuallyStopped ? 'Stopped (Manual)' : 'Stopped');
        let statusColor = rconStatusMap[key]?.status === 'connecting' ? '#ff6' : running || rconStatusMap[key]?.status === 'connected' ? '#6f6' : manuallyStopped ? '#fa0' : '#f66';
        return (
          <div
            key={key}
            style={{
              padding: '0.5em 1em',
              background: activeTab === key ? '#23272e' : undefined,
              cursor: 'pointer',
              borderBottom: '1px solid #222',
              color: statusColor,
              fontWeight: activeTab === key ? 'bold' : undefined,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ flex: 1 }} onClick={() => onTabSelect(key)}>
              {profile.name || key} <span style={{fontSize: '0.8em'}}>({statusLabel})</span>
              <div style={{fontSize: '0.7em', color: '#aaa'}}>
                {running && startTime ? `Started at ${new Date(startTime).toLocaleTimeString()}` :
                  !running && manuallyStopped ? 'Stopped manually' :
                  !running && autoStart ? 'Auto-start enabled' :
                  !running ? 'Not running' : ''}
              </div>
            </span>
            <button
              disabled={running}
              style={{ background: running ? '#444' : '#2d4', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 10px', fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer', fontSize: 12 }}
              title="Start server"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const res = await fetch(`/api/start-server/${encodeURIComponent(key)}`, { method: 'POST' });
                  if (!res.ok) {
                    let msg = 'Failed to start server';
                    try {
                      const data = await res.json();
                      if (data && data.error) msg = data.error;
                    } catch {}
                    showMsg(key, 'error', msg);
                    return;
                  }
                  showMsg(key, 'success', 'Started');
                } catch (e: any) {
                  showMsg(key, 'error', e?.message || 'Failed to start');
                }
              }}
            >Start</button>
            <button
              disabled={!running}
              style={{ background: !running ? '#444' : '#d44', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 10px', fontWeight: 600, cursor: !running ? 'not-allowed' : 'pointer', fontSize: 12 }}
              title="Stop server"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const res = await fetch(`/api/stop-server/${encodeURIComponent(key)}`, { method: 'POST' });
                  if (!res.ok) {
                    let msg = 'Failed to stop server';
                    try {
                      const data = await res.json();
                      if (data && data.error) msg = data.error;
                    } catch {}
                    showMsg(key, 'error', msg);
                    return;
                  }
                  showMsg(key, 'success', 'Stopped');
                } catch (e: any) {
                  showMsg(key, 'error', e?.message || 'Failed to stop');
                }
              }}
            >Stop</button>
            {/* Inline feedback message */}
            {actionMsg[key] && (
              <span style={{ marginLeft: 8, color: actionMsg[key].type === 'success' ? '#6f6' : '#f66', fontWeight: 600, fontSize: 12 }}>
                {actionMsg[key].text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
