import React from 'react';

interface TabManagerProps {
  serverProfiles: { name: string; host: string; port: number; password: string }[];
  statusMap: Record<string, { status: string; since: number }>;
  onTabSelect: (key: string) => void;
  activeTab: string | null;
}

export const TabManager: React.FC<TabManagerProps> = ({ serverProfiles, statusMap, onTabSelect, activeTab }) => {
  return (
    <div>
      {serverProfiles.map((profile) => {
        const key = profile.host + ':' + profile.port;
        const status = statusMap[key]?.status || 'disconnected';
        const since = statusMap[key]?.since;
        return (
          <div
            key={key}
            style={{
              padding: '0.5em 1em',
              background: activeTab === key ? '#23272e' : undefined,
              cursor: 'pointer',
              borderBottom: '1px solid #222',
              color: status === 'connected' ? '#6f6' : status === 'connecting' ? '#ff6' : '#f66',
              fontWeight: activeTab === key ? 'bold' : undefined,
            }}
            onClick={() => onTabSelect(key)}
          >
            {profile.name || key} <span style={{fontSize: '0.8em'}}>({status})</span>
            <div style={{fontSize: '0.7em', color: '#aaa'}}>
              {status === 'connected' && since ? `Connected since ${new Date(since).toLocaleTimeString()}` :
                status === 'disconnected' && since ? `Disconnected since ${new Date(since).toLocaleTimeString()}` :
                status === 'connecting' ? 'Connecting...' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
};
