import React, { useState, useEffect } from 'react';

interface BaseInstall {
  path: string;
  id: string;
}

interface InstanceInstallModalProps {
  show: boolean;
  onClose: () => void;
  baseInstalls: BaseInstall[];
  onInstall: (params: InstanceInstallParams) => void;
  error?: string | null;
  clearError?: () => void;
}

export interface InstanceInstallParams {
  baseInstallPath: string;
  instanceDirectory: string;
  queryPort: number;
  gamePort: number;
  mapName: string;
  sessionName: string;
  adminPassword: string;
  serverPassword?: string;
}

export const InstanceInstallModal: React.FC<InstanceInstallModalProps> = ({
  show,
  onClose,
  baseInstalls,
  onInstall,
  error,
  clearError,
}) => {
  const [form, setForm] = useState<InstanceInstallParams>({
    baseInstallPath: '',
    instanceDirectory: '',
    queryPort: 27020,
    gamePort: 7777,
    mapName: 'TheIsland',
    sessionName: '',
    adminPassword: '',
    serverPassword: '',
  });

  useEffect(() => {
    if (baseInstalls.length > 0 && !form.baseInstallPath) {
      setForm(f => ({ ...f, baseInstallPath: baseInstalls[0].path }));
    }
  }, [baseInstalls]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.baseInstallPath || !form.instanceDirectory || !form.queryPort || !form.gamePort || !form.mapName || !form.sessionName || !form.adminPassword) {
      if (clearError) clearError();
      return;
    }
    onInstall(form);
  };

  if (!show) return null;
  return (
    <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{background: '#23272e', color: '#eee', padding: 20, borderRadius: 8, minWidth: 0, maxWidth: 500, width: '95vw', boxShadow: '0 2px 16px #0008', position: 'relative', margin: 8, display: 'flex', flexDirection: 'column'}}>
        <h2 style={{marginTop: 0, fontSize: '1.3em'}}>Install New Server Instance</h2>
        {error && (
          <div style={{ background: '#ffdddd', color: '#a00', padding: '8px 16px', textAlign: 'center', fontWeight: 600, borderRadius: 4, marginBottom: 12, border: '1px solid #a00' }}>
            {error}
            <button onClick={clearError} style={{ marginLeft: 16, background: 'none', border: 'none', color: '#a00', fontWeight: 700, cursor: 'pointer' }}>×</button>
          </div>
        )}
        <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: 10}}>
          <label>Base Install:
            <select name="baseInstallPath" value={form.baseInstallPath} onChange={handleChange} style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}}>
              {baseInstalls.map(b => (
                <option key={b.id} value={b.path}>{b.path}</option>
              ))}
            </select>
          </label>
          <label>Instance Directory:
            <input name="instanceDirectory" value={form.instanceDirectory} onChange={handleChange} placeholder="e.g. D:\\ArkServers\\MyNewInstance" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Query Port:
            <input name="queryPort" type="number" value={form.queryPort} onChange={handleChange} style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Game Port:
            <input name="gamePort" type="number" value={form.gamePort} onChange={handleChange} style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Map Name:
            <input name="mapName" value={form.mapName} onChange={handleChange} placeholder="e.g. TheIsland" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Session Name:
            <input name="sessionName" value={form.sessionName} onChange={handleChange} placeholder="e.g. My Ark Server" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Admin Password:
            <input name="adminPassword" value={form.adminPassword} onChange={handleChange} type="password" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Server Password (optional):
            <input name="serverPassword" value={form.serverPassword} onChange={handleChange} type="password" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <div style={{display: 'flex', gap: 8, marginTop: 8}}>
            <button type="submit" style={{flex: 1}}>Install Instance</button>
            <button type="button" onClick={onClose} style={{flex: 1}}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};
