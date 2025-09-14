

import React, { useEffect, useState, useRef } from 'react';

interface BaseInstall {
  id: string;
  path: string;
  version?: string;
  lastUpdated?: string;
  updateAvailable?: boolean;
  latestBuildId?: string;
}

interface BaseInstallManagerProps {
  ws: WebSocket | null;
  steamCmdDetected: boolean;
  handleUpdate: (path: string) => void;
}

interface ExtendedBaseInstallManagerProps extends BaseInstallManagerProps {
  active?: boolean;
}

export const BaseInstallManager: React.FC<ExtendedBaseInstallManagerProps> = ({ ws, steamCmdDetected, handleUpdate, active }) => {
  const [baseInstalls, setBaseInstalls] = useState<BaseInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [form, setForm] = useState<Partial<BaseInstall>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const pendingRequests = useRef<Record<string, (data: any) => void>>({});
  const requestIdCounter = useRef(1);

  // --- WebSocket message handling ---
  function mergeBaseInstalls(newList: BaseInstall[]) {
    setBaseInstalls(prev => {
      if (!Array.isArray(newList)) return prev;
      // Map by id for quick lookup
      const prevMap = Object.fromEntries(prev.map(b => [b.id, b]));
      let changed = false;
      const merged = newList.map(newB => {
        const oldB = prevMap[newB.id];
        if (!oldB) {
          changed = true;
          return newB;
        }
        // Compare fields
        const keys = Object.keys(newB) as (keyof BaseInstall)[];
        for (const k of keys) {
          if (newB[k] !== oldB[k]) {
            changed = true;
            return { ...oldB, ...newB };
          }
        }
        return oldB;
      });
      // If length changed, update
      if (merged.length !== prev.length) changed = true;
      return changed ? merged : prev;
    });
  }

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg && msg.requestId && pendingRequests.current[msg.requestId]) {
          pendingRequests.current[msg.requestId](msg);
          delete pendingRequests.current[msg.requestId];
        } else if (msg.type === 'baseInstallsUpdated') {
          mergeBaseInstalls(msg.baseInstalls || []);
        }
      } catch {}
    };
    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  function sendWS(payload: any, cb?: (data: any) => void) {
    if (!ws || ws.readyState !== 1) {
      setError('WebSocket not connected');
      return;
    }
    const requestId = 'req' + (requestIdCounter.current++);
    const msg = { ...payload, requestId };
    if (cb) pendingRequests.current[requestId] = cb;
    ws.send(JSON.stringify(msg));
  }

  const loadBaseInstalls = () => {
    setLoading(true);
    sendWS({ type: 'getBaseInstalls' }, (data) => {
      mergeBaseInstalls(data.baseInstalls || []);
      setLoading(false);
    });
  };
  // Track previous active state
  const prevActiveRef = useRef<boolean | undefined>(undefined);

  // Initial load and poll when active
  useEffect(() => {
    let poller: NodeJS.Timeout | undefined;
    if (ws && ws.readyState === 1 && active) {
      loadBaseInstalls();
      poller = setInterval(loadBaseInstalls, 10000);
    }
    return () => {
      if (poller) clearInterval(poller);
    };
  }, [ws, active]);

  // Refresh when tab becomes active
  useEffect(() => {
    if (active && !prevActiveRef.current) {
      loadBaseInstalls();
    }
    prevActiveRef.current = active;
  }, [active]);

  const handleSelect = (id: string) => setSelectedId(id === selectedId ? null : id);

  // Add
  const handleAdd = () => {
    setForm({ id: '', path: '' });
    setFormError(null);
    setShowAdd(true);
  };
  const handleAddSubmit = () => {
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
    sendWS({ type: 'addBaseInstall', data: form }, (res) => {
      if (!res.ok) {
        setFormError(res.error || 'Failed to add base install');
      } else {
        setShowAdd(false);
        loadBaseInstalls();
      }
      setActionLoading(false);
    });
  };

  // Update
  const handleUpdateSubmit = () => {
    setFormError(null);
    if (!form.path) {
      setFormError('Path is required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    sendWS({ type: 'updateBaseInstall', id: selectedId, data: form }, (res) => {
      if (!res.ok) {
        setFormError(res.error || 'Failed to update base install');
      } else {
        setShowUpdate(false);
        loadBaseInstalls();
      }
      setActionLoading(false);
    });
  };

  // Remove
  const handleRemove = () => {
    if (!selectedId) return;
    setActionLoading(true);
    setError(null);
    sendWS({ type: 'removeBaseInstall', id: selectedId }, (res) => {
      if (!res.ok) {
        setError(res.error || 'Failed to remove base install');
      } else {
        setSelectedId(null);
        loadBaseInstalls();
      }
      setActionLoading(false);
    });
  };

  return (
    <div style={{ padding: 16, background: '#23272e', borderRadius: 8, marginBottom: 24 }}>
      <h3>Base Install Management</h3>
      {loading && <div>Loading...</div>}
      {error && <div style={{ color: '#f66' }}>{error}</div>}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <button onClick={handleAdd} disabled={actionLoading || !steamCmdDetected}>Add Base Install</button>
        <button onClick={handleRemove} disabled={!selectedId || actionLoading || !steamCmdDetected}>Remove Selected</button>
      </div>
      <div style={{ width: '100%', background: '#23272e', color: '#eee', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ display: 'flex', fontWeight: 600, borderBottom: '2px solid #333', padding: '8px 0', textAlign: 'left' }}>
          <div style={{ flex: '0 0 40px', paddingLeft: 8 }}></div>
          <div style={{ flex: '1 1 120px', minWidth: 80 }}>ID</div>
          <div style={{ flex: '2 1 200px', minWidth: 120 }}>Path</div>
          <div style={{ flex: '1 1 80px', minWidth: 60 }}>Version</div>
          <div style={{ flex: '1 1 140px', minWidth: 100 }}>Last Updated</div>
          <div style={{ flex: '1 1 120px', minWidth: 80 }}>Update Available</div>
          <div style={{ flex: '1 1 100px', minWidth: 80 }}>Latest Build</div>
        </div>
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
                    // handleUpdate(b.path); // Not supported if steamcmd not detected
                  }}
                  title="Update base install"
                  disabled={!steamCmdDetected}
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
              <button onClick={handleAddSubmit} disabled={actionLoading || !steamCmdDetected}>Add</button>
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
              <button onClick={handleUpdateSubmit} disabled={actionLoading || !steamCmdDetected}>Update</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
