import React, { useState, useEffect } from 'react';
import { PRESET_MAPS, mergeModIds } from './commandlineUtils';
interface ModResult { id: string; name: string; author?: string; thumbnailUrl?: string; }

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
  installing?: boolean;
}

export interface InstanceInstallParams {
  baseInstallPath: string;
  instanceDirectory: string;
  queryPort: number;
  gamePort: number;
  rconPort?: number;
  mapName: string;
  sessionName: string;
  adminPassword: string;
  serverPassword?: string;
  modIds?: string;
}

export const InstanceInstallModal: React.FC<InstanceInstallModalProps> = ({
  show,
  onClose,
  baseInstalls,
  onInstall,
  error,
  clearError,
  installing,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [modQuery, setModQuery] = useState('');
  const [modResults, setModResults] = useState<ModResult[]>([]);
  const [modPage, setModPage] = useState(1);
  const [modHasMore, setModHasMore] = useState(false);
  const [modLoading, setModLoading] = useState(false);
  const [modError, setModError] = useState<string | null>(null);
  const [modCache, setModCache] = useState<Record<string, ModResult[]>>({});
  const [form, setForm] = useState<InstanceInstallParams>({
    baseInstallPath: '',
    instanceDirectory: '',
    queryPort: 27015,
    gamePort: 7777,
    rconPort: 27020,
    mapName: 'TheIsland_WP',
    sessionName: '',
    adminPassword: '',
    serverPassword: '',
    modIds: '',
  });

  const isInstalling = Boolean(installing || submitting);
  const selectedMap = PRESET_MAPS.some(m => m.id.toLowerCase() === form.mapName.toLowerCase())
    ? form.mapName
    : 'custom';

  useEffect(() => {
    if (!show || error) {
      setSubmitting(false);
    }
  }, [show, error]);

  useEffect(() => {
    if (baseInstalls.length > 0 && !form.baseInstallPath) {
      setForm(f => ({ ...f, baseInstallPath: baseInstalls[0].path }));
    }
  }, [baseInstalls]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm(f => ({
      ...f,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleMapSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value !== 'custom') {
      setForm(f => ({ ...f, mapName: value }));
    }
  };
  const searchMods = async (page = 1) => {
    const query = modQuery.trim(); if (!query) return;
    const key = `${query.toLowerCase()}:${page}`;
    if (modCache[key]) { setModResults(page === 1 ? modCache[key] : [...modResults, ...modCache[key]]); setModPage(page); return; }
    setModLoading(true); setModError(null);
    try { const r = await fetch(`/api/mods/search?q=${encodeURIComponent(query)}&page=${page}&pageSize=12`); const b = await r.json(); if (!r.ok) throw new Error(b.error || 'Mod search failed'); setModResults(page === 1 ? b.results : [...modResults, ...b.results]); setModPage(page); setModHasMore(Boolean(b.hasMore)); setModCache(c => ({ ...c, [key]: b.results })); } catch (e: any) { setModError(e.message); } finally { setModLoading(false); }
  };
  const selectedIds = (form.modIds || '').split(/[;,\s]+/).filter(Boolean);
  const addMod = (id: string) => setForm(f => ({ ...f, modIds: mergeModIds(f.modIds || '', [id]) }));
  const removeMod = (id: string) => setForm(f => ({ ...f, modIds: (f.modIds || '').split(',').filter(v => v.toLowerCase() !== id.toLowerCase()).join(',') }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.baseInstallPath || !form.instanceDirectory || !form.queryPort || !form.gamePort || !form.mapName || !form.sessionName || !form.adminPassword) {
      if (clearError) clearError();
      return;
    }
    setSubmitting(true);
    onInstall({
      ...form,
      queryPort: Number(form.queryPort),
      gamePort: Number(form.gamePort),
      rconPort: form.rconPort !== undefined && form.rconPort !== null && (form.rconPort as any) !== '' ? Number(form.rconPort) : 27020,
    });
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
            <select name="baseInstallPath" value={form.baseInstallPath} onChange={handleChange} disabled={isInstalling} style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}}>
              {baseInstalls.map(b => (
                <option key={b.id} value={b.path}>{b.path}</option>
              ))}
            </select>
          </label>
          <label>Instance Directory:
            <input name="instanceDirectory" value={form.instanceDirectory} onChange={handleChange} disabled={isInstalling} placeholder="e.g. D:\\ArkServers\\MyNewInstance" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Query Port:
            <input name="queryPort" type="number" value={form.queryPort} onChange={handleChange} disabled={isInstalling} style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Game Port:
            <input name="gamePort" type="number" value={form.gamePort} onChange={handleChange} disabled={isInstalling} style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>RCON Port:
            <input name="rconPort" type="number" value={form.rconPort ?? ''} onChange={handleChange} disabled={isInstalling} style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Map Name:
            <select value={selectedMap} onChange={handleMapSelection} disabled={isInstalling} style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}}>
              {PRESET_MAPS.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
              ))}
              <option value="custom">Custom / Other Map...</option>
            </select>
            {selectedMap === 'custom' && (
              <input name="mapName" value={form.mapName} onChange={handleChange} disabled={isInstalling} placeholder="e.g. Svartalfheim_WP" style={{width: '100%', marginTop: 6, padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
            )}
          </label>
          <label>Session Name:
            <input name="sessionName" value={form.sessionName} onChange={handleChange} disabled={isInstalling} placeholder="e.g. My Ark Server" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Admin Password:
            <input name="adminPassword" value={form.adminPassword} onChange={handleChange} disabled={isInstalling} type="password" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Server Password (optional):
            <input name="serverPassword" value={form.serverPassword} onChange={handleChange} disabled={isInstalling} type="password" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <label>Mod IDs (manual or selected):
            <input name="modIds" value={form.modIds || ''} onChange={handleChange} disabled={isInstalling} placeholder="e.g. 928708,930389" style={{width: '100%', padding: 6, borderRadius: 4, border: '1px solid #444', background: '#181a20', color: '#eee'}} />
          </label>
          <div style={{border: '1px solid #444', padding: 10, borderRadius: 4}}><strong>Select Mods</strong>
            <div style={{display: 'flex', gap: 6, marginTop: 6}}><input value={modQuery} onChange={e => setModQuery(e.target.value)} placeholder="Search by mod name or ID" style={{flex: 1}} /><button type="button" onClick={() => searchMods()} disabled={modLoading}>Search</button></div>
            {selectedIds.length > 0 && <div style={{marginTop: 8}}>Selected: {selectedIds.map(id => <button type="button" key={id} onClick={() => removeMod(id)} style={{margin: 2}}>{id} ×</button>)}</div>}
            {modLoading && <div style={{color: '#aaa'}}>Searching…</div>}{modError && <div style={{color: '#f88'}}>{modError} <button type="button" onClick={() => searchMods(modPage)}>Retry</button></div>}
            {!modLoading && !modError && modQuery && !modResults.length && <div style={{color: '#aaa'}}>No mods found.</div>}
            {modResults.map(m => <div key={m.id} style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, background: '#181a20', padding: 6}}>{m.thumbnailUrl && <img src={m.thumbnailUrl} width="40" height="40" alt="" />}<span style={{flex: 1}}><b>{m.name}</b><br /><small>{m.id} · {m.author || 'Unknown author'}</small></span><button type="button" onClick={() => addMod(m.id)} disabled={selectedIds.some(id => id.toLowerCase() === m.id.toLowerCase())}>Add</button></div>)}
            {modHasMore && <button type="button" onClick={() => searchMods(modPage + 1)} disabled={modLoading}>Load more</button>}
          </div>
          <div style={{display: 'flex', gap: 8, marginTop: 8}}>
            <button type="submit" disabled={isInstalling} style={{flex: 1}}>
              {isInstalling ? 'Installing Instance...' : 'Install Instance'}
            </button>
            <button type="button" onClick={onClose} disabled={isInstalling} style={{flex: 1}}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};
