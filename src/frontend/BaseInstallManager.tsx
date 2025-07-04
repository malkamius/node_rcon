
import React, { useEffect, useState } from 'react';


interface BaseInstall {
  id: string;
  path: string;
  version?: string;
  lastUpdated?: string;
  updateAvailable?: boolean;
  latestBuildId?: string;
}

interface BaseInstallManagerProps {
  handleUpdate: (path: string) => void;
}

export const BaseInstallManager: React.FC<BaseInstallManagerProps> = ({ handleUpdate }) => {


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
  // const handleUpdateSelected = () => {
  //   const bi = baseInstalls.find(b => b.id === selectedId);
  //   if (bi) {
  //     setForm({ ...bi });
  //     setFormError(null);
  //     setShowUpdate(true);
  //   }
  // };
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
        {/* <button onClick={handleUpdateSelected} disabled={!selectedId || actionLoading}>Update Selected</button> */}
        <button onClick={handleRemove} disabled={!selectedId || actionLoading}>Remove Selected</button>
      </div>
      {/* Flexbox-based header and rows */}
      <div style={{ width: '100%', background: '#23272e', color: '#eee', borderRadius: 4, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', fontWeight: 600, borderBottom: '2px solid #333', padding: '8px 0', textAlign: 'left' }}>
          <div style={{ flex: '0 0 40px', paddingLeft: 8 }}></div>
          <div style={{ flex: '1 1 120px', minWidth: 80 }}>ID</div>
          <div style={{ flex: '2 1 200px', minWidth: 120 }}>Path</div>
          <div style={{ flex: '1 1 80px', minWidth: 60 }}>Version</div>
          <div style={{ flex: '1 1 140px', minWidth: 100 }}>Last Updated</div>
          <div style={{ flex: '1 1 120px', minWidth: 80 }}>Update Available</div>
          <div style={{ flex: '1 1 100px', minWidth: 80 }}>Latest Build</div>
        </div>
        {/* Rows */}
        {baseInstalls.map(b => (
          <div
            key={b.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: b.updateAvailable ? '#332' : (selectedId === b.id ? '#224' : undefined),
              borderBottom: '1px solid #222',
              cursor: 'pointer',
              transition: 'background 0.2s',
              padding: '6px 0',
            }}
            onClick={() => handleSelect(b.id)}
          >
            <div style={{ flex: '0 0 40px', paddingLeft: 8 }}>
              <input type="radio" checked={selectedId === b.id} onChange={() => handleSelect(b.id)} />
            </div>
            <div style={{ flex: '1 1 120px', minWidth: 80, wordBreak: 'break-all' }}>{b.id}</div>
            <div style={{ flex: '2 1 200px', minWidth: 120, wordBreak: 'break-all' }}>{b.path}</div>
            <div style={{ flex: '1 1 80px', minWidth: 60 }}>{b.version || '-'}</div>
            <div style={{ flex: '1 1 140px', minWidth: 100 }}>{b.lastUpdated ? new Date(b.lastUpdated).toLocaleString() : '-'}</div>
            <div style={{ flex: '1 1 120px', minWidth: 80, color: b.updateAvailable ? '#fa0' : '#6f6' }}>
              {b.updateAvailable ? (
                <button
                  style={{
                    background: '#fa0',
                    color: '#222',
                    border: 'none',
                    borderRadius: 4,
                    padding: '2px 10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    handleUpdate(b.path);
                  }}
                  title="Update base install"
                >
                  Yes
                </button>
              ) : 'No'}
            </div>
            <div style={{ flex: '1 1 100px', minWidth: 80 }}>{b.latestBuildId || '-'}</div>
          </div>
        ))}
      </div>

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
