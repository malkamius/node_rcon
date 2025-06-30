
import React, { useEffect, useState } from 'react';


interface BaseInstall {
  id: string;
  path: string;
  version?: string;
  lastUpdated?: string;
  updateAvailable?: boolean;
  latestBuildId?: string;
}

export const BaseInstallManager: React.FC = () => {


  const [baseInstalls, setBaseInstalls] = useState<BaseInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [form, setForm] = useState<Partial<BaseInstall>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadBaseInstalls = () => {
    setLoading(true);
    fetch('/api/base-installs')
      .then(res => res.json())
      .then(data => {
        setBaseInstalls(data.baseInstalls || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load base installs');
        setLoading(false);
      });
  };
  useEffect(() => {
    loadBaseInstalls();
  }, []);

  const handleSelect = (id: string) => setSelectedId(id === selectedId ? null : id);

  // Add
  const handleAdd = () => {
    setForm({ id: '', path: '' });
    setFormError(null);
    setShowAdd(true);
  };
  const handleAddSubmit = async () => {
    setFormError(null);
    if (!form.id || !form.path) {
      setFormError('ID and Path are required.');
      return;
    }
    if (baseInstalls.some(b => b.id === form.id)) {
      setFormError('ID must be unique.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/base-installs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const msg = await res.text();
        setFormError(msg || 'Failed to add base install');
        return;
      }
      setShowAdd(false);
      loadBaseInstalls();
    } catch (e) {
      setFormError('Failed to add base install');
    } finally {
      setActionLoading(false);
    }
  };

  // Update
  const handleUpdate = () => {
    const bi = baseInstalls.find(b => b.id === selectedId);
    if (bi) {
      setForm({ ...bi });
      setFormError(null);
      setShowUpdate(true);
    }
  };
  const handleUpdateSubmit = async () => {
    setFormError(null);
    if (!form.path) {
      setFormError('Path is required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/base-installs/${encodeURIComponent(selectedId!)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      );
      if (!res.ok) {
        const msg = await res.text();
        setFormError(msg || 'Failed to update base install');
        return;
      }
      setShowUpdate(false);
      loadBaseInstalls();
    } catch (e) {
      setFormError('Failed to update base install');
    } finally {
      setActionLoading(false);
    }
  };

  // Remove
  const handleRemove = async () => {
    if (!selectedId) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/base-installs/${encodeURIComponent(selectedId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove base install');
      setSelectedId(null);
      loadBaseInstalls();
    } catch (e) {
      setError('Failed to remove base install');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Base Install Management</h2>
      {loading && <div>Loading...</div>}
      {error && <div style={{ color: '#f66' }}>{error}</div>}
      {/* Controls: Add, Update, Remove */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <button onClick={handleAdd} disabled={actionLoading}>Add Base Install</button>
        <button onClick={handleUpdate} disabled={!selectedId || actionLoading}>Update Selected</button>
        <button onClick={handleRemove} disabled={!selectedId || actionLoading}>Remove Selected</button>
      </div>
      <table style={{ width: '100%', background: '#23272e', color: '#eee', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th></th>
            <th>ID</th>
            <th>Path</th>
            <th>Version</th>
            <th>Last Updated</th>
            <th>Update Available</th>
            <th>Latest Build</th>
          </tr>
        </thead>
        <tbody>
          {baseInstalls.map(b => (
            <tr key={b.id} style={{ background: b.updateAvailable ? '#332' : (selectedId === b.id ? '#224' : undefined) }} onClick={() => handleSelect(b.id)}>
              <td><input type="radio" checked={selectedId === b.id} onChange={() => handleSelect(b.id)} /></td>
              <td>{b.id}</td>
              <td>{b.path}</td>
              <td>{b.version || '-'}</td>
              <td>{b.lastUpdated ? new Date(b.lastUpdated).toLocaleString() : '-'}</td>
              <td style={{ color: b.updateAvailable ? '#fa0' : '#6f6' }}>{b.updateAvailable ? 'Yes' : 'No'}</td>
              <td>{b.latestBuildId || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000a', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#23272e', color: '#eee', padding: 24, borderRadius: 8, minWidth: 320 }}>
            <h3>Add Base Install</h3>
            {formError && <div style={{ color: '#f66', marginBottom: 8 }}>{formError}</div>}
            <div style={{ marginBottom: 12 }}>
              <label>ID:<br /><input value={form.id || ''} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} style={{ width: '100%' }} /></label>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Path:<br /><input value={form.path || ''} onChange={e => setForm(f => ({ ...f, path: e.target.value }))} style={{ width: '100%' }} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} disabled={actionLoading}>Cancel</button>
              <button onClick={handleAddSubmit} disabled={actionLoading}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Update Modal */}
      {showUpdate && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000a', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#23272e', color: '#eee', padding: 24, borderRadius: 8, minWidth: 320 }}>
            <h3>Update Base Install</h3>
            {formError && <div style={{ color: '#f66', marginBottom: 8 }}>{formError}</div>}
            <div style={{ marginBottom: 12 }}>
              <label>ID:<br /><input value={form.id || ''} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} style={{ width: '100%' }} disabled /></label>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Path:<br /><input value={form.path || ''} onChange={e => setForm(f => ({ ...f, path: e.target.value }))} style={{ width: '100%' }} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUpdate(false)} disabled={actionLoading}>Cancel</button>
              <button onClick={handleUpdateSubmit} disabled={actionLoading}>Update</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
