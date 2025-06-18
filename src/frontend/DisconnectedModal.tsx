import React from 'react';

interface DisconnectedModalProps {
  show: boolean;
  onRetry: () => void;
}

export const DisconnectedModal: React.FC<DisconnectedModalProps> = ({ show, onRetry }) => {
  if (!show) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.7)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: '#23272e',
        color: '#fff',
        padding: '2em 3em',
        borderRadius: 8,
        boxShadow: '0 2px 16px #000',
        textAlign: 'center',
        minWidth: 320,
      }}>
        <h2>Disconnected from Backend</h2>
        <p>Attempting to reconnect...</p>
        <button onClick={onRetry} style={{marginTop: '1em', padding: '0.5em 2em'}}>Retry Now</button>
      </div>
    </div>
  );
};
