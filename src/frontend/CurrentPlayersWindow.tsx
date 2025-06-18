import React from 'react';

interface CurrentPlayersWindowProps {
  players: string[];
  lastUpdate: number | null;
  currentPlayersWidth?: number; // <-- add optional width prop
}

export const CurrentPlayersWindow: React.FC<CurrentPlayersWindowProps> = ({ players, lastUpdate, currentPlayersWidth }) => {
  return (
    <div
      style={{
        background: '#23272e',
        color: '#eee',
        border: '1px solid #444',
        borderRadius: 6,
        padding: 12,
        margin: 8
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Current Players</div>
      {lastUpdate && (
        <div style={{ fontSize: '0.85em', color: '#aaa', marginBottom: 6 }}>
          Last update: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      )}
      {players.length === 0 ? (
        <div style={{ color: '#888' }}>No players online.</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {players.map((p, i) => (
            <li key={i} style={{ padding: '2px 0' }}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
