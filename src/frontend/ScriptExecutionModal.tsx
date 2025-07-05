import React, { useState } from 'react';

interface ScriptExecutionModalProps {
  open: boolean;
  onClose: () => void;
  serverKeys: string[];
}

// Placeholder for available scripts (could be fetched from backend or static for now)
const BUILT_IN_SCRIPTS = [
  {
    name: 'Restart and Update (15 min warning)',
    content: [
      'serverchat SYSTEM: Restart and update in 15 minutes',
      'wait 300000',
      'serverchat SYSTEM: Restart and update in 10 minutes',
      'wait 300000',
      'serverchat SYSTEM: Restart and update in 5 minutes',
      'wait 240000',
      'serverchat SYSTEM: Restart and update in 1 minute',
      'wait 50000',
      'serverchat SYSTEM: Restart and update in 10 seconds',
      'wait 10000',
      'update-base-install <baseInstallId>'
    ].join('\n'),
  },
];

const ScriptExecutionModal: React.FC<ScriptExecutionModalProps> = ({ open, onClose, serverKeys }) => {
  const [selectedScript, setSelectedScript] = useState(BUILT_IN_SCRIPTS[0].content);
  const [isExecuting, setIsExecuting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Placeholder: implement API call to execute script
  const handleExecute = async () => {
    setIsExecuting(true);
    setStatus('Executing...');
    setError(null);
    // TODO: Call backend API to start script for all serverKeys
    // TODO: Poll status and update UI
    // Simulate execution
    setTimeout(() => {
      setIsExecuting(false);
      setStatus('Completed');
    }, 2000);
  };

  // Placeholder: implement API call to cancel script
  const handleCancel = () => {
    setIsExecuting(false);
    setStatus('Cancelled');
    setError(null);
    // TODO: Call backend API to cancel script
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Execute RCON Script</h2>
        <label>
          Select Script:
          <select
            value={selectedScript}
            onChange={e => setSelectedScript(e.target.value)}
            disabled={isExecuting}
          >
            {BUILT_IN_SCRIPTS.map((script, idx) => (
              <option key={idx} value={script.content}>{script.name}</option>
            ))}
          </select>
        </label>
        <textarea
          value={selectedScript}
          readOnly
          rows={8}
          style={{ width: '100%', marginTop: 8 }}
        />
        <div style={{ marginTop: 16 }}>
          <button onClick={handleExecute} disabled={isExecuting}>Execute</button>
          <button onClick={handleCancel} disabled={!isExecuting}>Cancel</button>
          <button onClick={onClose} disabled={isExecuting}>Close</button>
        </div>
        {status && <div style={{ marginTop: 8 }}>Status: {status}</div>}
        {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
};

export default ScriptExecutionModal;
