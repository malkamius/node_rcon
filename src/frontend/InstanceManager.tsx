import React, { useState } from 'react';
import { InstanceInstallModal, InstanceInstallParams } from './InstanceInstallModal';
import { buildOrSyncCommandline, parseCommandline } from './commandlineUtils';

interface BaseInstall {
  id: string;
  path: string;
}

interface InstanceManagerProps {
  ws: WebSocket | null;
  baseInstalls: BaseInstall[];
  steamCmdDetected?: boolean;
  onInstanceInstalled?: () => void;
}

export const InstanceManager: React.FC<InstanceManagerProps> = ({
  ws,
  baseInstalls,
  steamCmdDetected = true,
  onInstanceInstalled,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleInstall = (params: InstanceInstallParams) => {
    if (!ws || ws.readyState !== 1) {
      setError('WebSocket not connected');
      return;
    }
    setError(null);
    setSuccess(null);
    setInstalling(true);
    const requestId = 'inst_' + Math.random().toString(36).slice(2);

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'installInstance' && msg.requestId === requestId) {
          ws.removeEventListener('message', handleMessage);
          setInstalling(false);
          if (msg.error) {
            setError(msg.error);
          } else {
            // Create and save new profile
            const newProfile = {
              name: params.sessionName,
              host: '127.0.0.1',
              port: params.rconPort || 27020,
              password: params.adminPassword,
              modIds: params.modIds,
              parsedCommandline: buildOrSyncCommandline(undefined, { ...parseCommandline(), mapName: params.mapName, queryPort: params.queryPort, gamePort: params.gamePort, serverPassword: params.serverPassword, modIds: params.modIds || '' }, { name: params.sessionName, password: params.adminPassword }),
              game: 'ark_sa',
              directory: params.instanceDirectory,
              features: {
                currentPlayers: {
                  enabled: true,
                  updateInterval: 10,
                },
              },
            };

            const profReqId = 'prof_' + Math.random().toString(36).slice(2);
            const profHandler = (pEvent: MessageEvent) => {
              try {
                const pMsg = JSON.parse(pEvent.data);
                if (pMsg.type === 'getProfiles' && pMsg.requestId === profReqId) {
                  ws.removeEventListener('message', profHandler);
                  const currentProfiles = pMsg.profiles || [];
                  if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({
                      type: 'saveProfiles',
                      profiles: [...currentProfiles, newProfile],
                    }));
                  }
                }
              } catch {}
            };
            ws.addEventListener('message', profHandler);
            if (ws && ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'getProfiles', requestId: profReqId }));
            }

            setSuccess('Instance installed successfully.');
            setShowModal(false);
            if (onInstanceInstalled) {
              onInstanceInstalled();
            }
          }
        }
      } catch {}
    };

    ws.addEventListener('message', handleMessage);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'installInstance',
        ...params,
        rconPort: params.rconPort || 27020,
        requestId,
      }));
    } else {
      setInstalling(false);
      setError('WebSocket not connected');
    }
  };

  return (
    <div style={{ marginBottom: 24, background: '#23272e', padding: 16, borderRadius: 8, maxWidth: 500 }}>
      <h3 style={{ marginTop: 0 }}>Instance Management</h3>
      <p style={{ color: '#aaa', fontSize: '0.9em' }}>
        Create a new server instance linked to an existing base install.
      </p>
      <button
        onClick={() => {
          setError(null);
          setSuccess(null);
          setShowModal(true);
        }}
        disabled={!baseInstalls.length || steamCmdDetected === false}
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        Install New Instance
      </button>
      {(!baseInstalls.length || steamCmdDetected === false) && (
        <div style={{ color: '#aaa', fontSize: '0.85em', marginTop: 8 }}>
          {!steamCmdDetected ? 'SteamCMD must be detected.' : 'At least one base install is required.'}
        </div>
      )}
      {error && <div style={{ color: '#f66', marginTop: 8 }}>{error}</div>}
      {success && <div style={{ color: '#6f6', marginTop: 8 }}>{success}</div>}

      <InstanceInstallModal
        show={showModal}
        onClose={() => {
          if (!installing) {
            setShowModal(false);
            setError(null);
          }
        }}
        baseInstalls={baseInstalls}
        onInstall={handleInstall}
        error={error}
        clearError={() => setError(null)}
        installing={installing}
      />
    </div>
  );
};
