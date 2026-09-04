import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface IniBackupItem {
  filename: string;
  baseFile: string;
  timestamp: string;
  formattedDate: string;
  size: number;
  mtime: string;
  isSafetyBackup: boolean;
}

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface SideBySideDiffRow {
  left?: { lineNumber: number; content: string; type: 'unchanged' | 'removed' };
  right?: { lineNumber: number; content: string; type: 'unchanged' | 'added' };
}

export interface IniRevisionModalProps {
  open: boolean;
  onClose: () => void;
  serverKey: string | null;
  serverProfiles: { name: string; host: string; port: number; directory?: string }[];
  targetFile?: 'GameUserSettings.ini' | 'Game.ini' | null;
  onRestored?: (file: string, activeContent: string) => void;
  wsRef?: React.MutableRefObject<WebSocket | null>;
  serverRunning?: boolean;
}

export const IniRevisionModal: React.FC<IniRevisionModalProps> = ({
  open,
  onClose,
  serverKey,
  serverProfiles,
  targetFile = 'GameUserSettings.ini',
  onRestored,
  wsRef,
  serverRunning = false
}) => {
  const [selectedBaseFile, setSelectedBaseFile] = useState<'GameUserSettings.ini' | 'Game.ini'>(
    targetFile || 'GameUserSettings.ini'
  );
  const [backups, setBackups] = useState<IniBackupItem[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [backupContent, setBackupContent] = useState<string>('');
  const [activeContent, setActiveContent] = useState<string>('');
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [sideBySideRows, setSideBySideRows] = useState<SideBySideDiffRow[]>([]);
  const [viewMode, setViewMode] = useState<'sideBySide' | 'unified' | 'raw'>('sideBySide');

  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingContent, setLoadingContent] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Retention / cleanup popover states
  const [cleanupOpen, setCleanupOpen] = useState<boolean>(false);
  const [cleanupKeepCount, setCleanupKeepCount] = useState<number | string>(10);
  const [cleanupOlderThanDays, setCleanupOlderThanDays] = useState<number | string>(14);
  const [enableOlderThan, setEnableOlderThan] = useState<boolean>(false);
  const [cleanupPreserveSafety, setCleanupPreserveSafety] = useState<boolean>(true);
  const [pruning, setPruning] = useState<boolean>(false);

  // Single snapshot deletion states
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<IniBackupItem | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const activeProfile = serverKey
    ? serverProfiles.find(p => `${p.host}:${p.port}` === serverKey)
    : null;

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Update selectedBaseFile if targetFile prop changes when modal opens
  useEffect(() => {
    if (targetFile) {
      setSelectedBaseFile(targetFile);
    }
  }, [targetFile, open]);

  // Fetch list of backups for selected server & base file
  const fetchBackups = useCallback(async () => {
    if (!open || !serverKey) return;
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/server-ini/${encodeURIComponent(serverKey)}/backups?file=${encodeURIComponent(selectedBaseFile)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load backup snapshots');
      }
      const list: IniBackupItem[] = data.backups || [];
      setBackups(list);

      if (list.length > 0) {
        setSelectedBackup(prev => {
          if (prev && list.some(b => b.filename === prev)) return prev;
          return list[0].filename;
        });
      } else {
        setSelectedBackup(null);
        setBackupContent('');
        setActiveContent('');
        setDiffLines([]);
        setSideBySideRows([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading backups');
    } finally {
      setLoadingList(false);
    }
  }, [open, serverKey, selectedBaseFile]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Fetch content and diff for the selected backup
  const fetchBackupDetails = useCallback(async () => {
    if (!open || !serverKey || !selectedBackup) return;
    setLoadingContent(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/server-ini/${encodeURIComponent(serverKey)}/backups/${encodeURIComponent(selectedBackup)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load backup details');
      }
      setBackupContent(data.content || '');
      setActiveContent(data.activeContent || '');
      setDiffLines(data.diff || []);
      setSideBySideRows(data.sideBySide || []);
    } catch (err: any) {
      setError(err?.message || 'Error loading revision details');
    } finally {
      setLoadingContent(false);
    }
  }, [open, serverKey, selectedBackup]);

  useEffect(() => {
    fetchBackupDetails();
  }, [fetchBackupDetails]);

  // Handle restoring selected revision
  const handleRestore = async () => {
    if (!serverKey || !selectedBackup) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch(`/api/server-ini/${encodeURIComponent(serverKey)}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupFilename: selectedBackup })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore INI revision');
      }

      setConfirmRestoreOpen(false);
      const safetyNotice = data.result?.safetyBackupFile
        ? ` (Safety snapshot saved: ${data.result.safetyBackupFile})`
        : '';
      setSuccessMsg(`Restored ${data.result?.restoredFile || selectedBaseFile} successfully!${safetyNotice}`);
      setTimeout(() => setSuccessMsg(null), 5000);

      // Notify parent to refresh current editor
      if (onRestored && data.result?.activeContent) {
        onRestored(data.result.restoredFile || selectedBaseFile, data.result.activeContent);
      }

      // Re-fetch backups so pre-restore safety snapshot appears
      await fetchBackups();
    } catch (err: any) {
      setError(err?.message || 'Error during restore operation');
    } finally {
      setRestoring(false);
    }
  };

  // Handle pruning historical snapshots
  const handlePruneBackups = async () => {
    if (!serverKey) return;
    setPruning(true);
    setError(null);
    try {
      const body: any = {
        file: selectedBaseFile,
        preserveSafetyBackups: cleanupPreserveSafety
      };
      if (cleanupKeepCount !== '' && !isNaN(Number(cleanupKeepCount))) {
        body.keepCount = Number(cleanupKeepCount);
      }
      if (enableOlderThan && cleanupOlderThanDays !== '' && !isNaN(Number(cleanupOlderThanDays))) {
        body.olderThanDays = Number(cleanupOlderThanDays);
      }

      const res = await fetch(`/api/server-ini/${encodeURIComponent(serverKey)}/backups/prune`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to prune snapshots');
      }

      setCleanupOpen(false);
      setSuccessMsg(`Pruned ${data.prunedCount} snapshots (${data.keptCount} preserved)`);
      setTimeout(() => setSuccessMsg(null), 5000);

      await fetchBackups();
    } catch (err: any) {
      setError(err?.message || 'Error pruning backups');
    } finally {
      setPruning(false);
    }
  };

  // Handle deleting a single backup snapshot
  const handleDeleteBackup = async () => {
    if (!serverKey || !deleteConfirmItem) return;
    const targetFilename = deleteConfirmItem.filename;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/server-ini/${encodeURIComponent(serverKey)}/backups/${encodeURIComponent(targetFilename)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to delete snapshot "${targetFilename}"`);
      }

      setDeleteConfirmItem(null);
      setSuccessMsg(`Deleted snapshot "${targetFilename}".`);
      setTimeout(() => setSuccessMsg(null), 5000);

      if (selectedBackup === targetFilename) {
        const remaining = backups.filter(b => b.filename !== targetFilename);
        setSelectedBackup(remaining.length > 0 ? remaining[0].filename : null);
        if (remaining.length === 0) {
          setBackupContent('');
          setActiveContent('');
          setDiffLines([]);
          setSideBySideRows([]);
        }
      }

      await fetchBackups();
    } catch (err: any) {
      setError(err?.message || 'Error deleting backup snapshot');
    } finally {
      setDeleting(false);
    }
  };

  // Keyboard shortcut: Escape closes modal or confirm dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        if (deleteConfirmItem) {
          setDeleteConfirmItem(null);
        } else if (confirmRestoreOpen) {
          setConfirmRestoreOpen(false);
        } else if (cleanupOpen) {
          setCleanupOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, deleteConfirmItem, confirmRestoreOpen, cleanupOpen, onClose]);

  if (!open) return null;

  const currentSelectedMeta = backups.find(b => b.filename === selectedBackup);

  const additionsCount = diffLines.filter(d => d.type === 'added').length;
  const deletionsCount = diffLines.filter(d => d.type === 'removed').length;
  const unchangedCount = diffLines.filter(d => d.type === 'unchanged').length;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !confirmRestoreOpen) onClose();
      }}
    >
      <div
        style={{
          background: '#191c20',
          border: '1px solid #333',
          borderRadius: 8,
          width: '95vw',
          maxWidth: 1300,
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          color: '#eee',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #333',
            background: '#121418',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🕒</span> INI Revision History & Backup Restore
            </h3>
            {activeProfile && (
              <span style={{ fontSize: 13, color: '#888', background: '#21252b', padding: '3px 8px', borderRadius: 4 }}>
                Server: <b style={{ color: '#61afef' }}>{activeProfile.name}</b> ({serverKey})
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Target File Selector Toggle */}
            <div style={{ display: 'inline-flex', background: '#21252b', borderRadius: 4, padding: 2, border: '1px solid #3e4451' }}>
              <button
                type="button"
                onClick={() => setSelectedBaseFile('GameUserSettings.ini')}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                  background: selectedBaseFile === 'GameUserSettings.ini' ? '#1f6feb' : 'transparent',
                  color: selectedBaseFile === 'GameUserSettings.ini' ? '#fff' : '#aaa'
                }}
              >
                GameUserSettings.ini
              </button>
              <button
                type="button"
                onClick={() => setSelectedBaseFile('Game.ini')}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                  background: selectedBaseFile === 'Game.ini' ? '#1f6feb' : 'transparent',
                  color: selectedBaseFile === 'Game.ini' ? '#fff' : '#aaa'
                }}
              >
                Game.ini
              </button>
            </div>

            <button
              onClick={fetchBackups}
              disabled={loadingList}
              title="Refresh backup list"
              style={{
                background: '#282c34',
                color: '#abb2bf',
                border: '1px solid #3e4451',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 13,
                cursor: loadingList ? 'not-allowed' : 'pointer'
              }}
            >
              🔄 Refresh
            </button>

            {/* Retention / Cleanup Popover Toggle */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setCleanupOpen(prev => !prev)}
                title="Prune and clean up old backup snapshots"
                style={{
                  background: cleanupOpen ? '#1f6feb' : '#282c34',
                  color: cleanupOpen ? '#fff' : '#abb2bf',
                  border: '1px solid #3e4451',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                🧹 Cleanup Backups
              </button>

              {cleanupOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 6,
                    background: '#1e2227',
                    border: '1px solid #4b5563',
                    borderRadius: 6,
                    padding: 16,
                    width: 320,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    zIndex: 1250,
                    color: '#eee',
                    fontSize: 13
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #374151', paddingBottom: 8 }}>
                    <b style={{ color: '#f3f4f6' }}>🧹 Snapshot Retention & Cleanup</b>
                    <button
                      type="button"
                      onClick={() => setCleanupOpen(false)}
                      style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, color: '#d1d5db', fontSize: 12, fontWeight: 500 }}>
                      Keep newest snapshots:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min="0"
                        max="500"
                        value={cleanupKeepCount}
                        onChange={e => setCleanupKeepCount(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                        style={{
                          width: 80,
                          background: '#111827',
                          border: '1px solid #374151',
                          borderRadius: 4,
                          color: '#fff',
                          padding: '4px 8px',
                          fontSize: 13
                        }}
                      />
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>newest snapshots</span>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <input
                        type="checkbox"
                        id="enableOlderThan"
                        checked={enableOlderThan}
                        onChange={e => setEnableOlderThan(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor="enableOlderThan" style={{ cursor: 'pointer', color: '#d1d5db', fontSize: 12, fontWeight: 500 }}>
                        Or older than X days:
                      </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 20 }}>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        disabled={!enableOlderThan}
                        value={cleanupOlderThanDays}
                        onChange={e => setCleanupOlderThanDays(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                        style={{
                          width: 80,
                          background: enableOlderThan ? '#111827' : '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: 4,
                          color: enableOlderThan ? '#fff' : '#6b7280',
                          padding: '4px 8px',
                          fontSize: 13
                        }}
                      />
                      <span style={{ fontSize: 12, color: enableOlderThan ? '#9ca3af' : '#6b7280' }}>days old</span>
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#d1d5db' }}>
                      <input
                        type="checkbox"
                        checked={cleanupPreserveSafety}
                        onChange={e => setCleanupPreserveSafety(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Preserve pre-restore safety backups (🛡️)</span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setCleanupOpen(false)}
                      disabled={pruning}
                      style={{
                        background: '#374151',
                        color: '#d1d5db',
                        border: 'none',
                        borderRadius: 4,
                        padding: '5px 12px',
                        fontSize: 12,
                        cursor: pruning ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handlePruneBackups}
                      disabled={pruning}
                      style={{
                        background: pruning ? '#4b5563' : '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '5px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: pruning ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {pruning ? 'Pruning...' : 'Prune Snapshots'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#aaa',
                fontSize: 22,
                cursor: 'pointer',
                lineHeight: 1
              }}
              title="Close (Esc)"
            >
              ×
            </button>
          </div>
        </div>

        {/* Running Server Warning Banner */}
        {serverRunning && (
          <div
            style={{
              background: '#3d2c00',
              color: '#fef08a',
              borderBottom: '1px solid #854d0e',
              padding: '10px 20px',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              lineHeight: 1.4
            }}
          >
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              <b>Server is Currently Running:</b> ARK server processes hold configuration in memory. Any changes or backups restored now will not take effect until the server is restarted, and the running server could overwrite configuration files upon shutdown.
            </span>
          </div>
        )}

        {/* Notifications / Alerts Banner */}
        {error && (
          <div style={{ background: '#3b1d1d', color: '#ff8888', padding: '8px 20px', fontSize: 13, borderBottom: '1px solid #662222', display: 'flex', justifyContent: 'space-between' }}>
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#ff8888', cursor: 'pointer' }}>×</button>
          </div>
        )}
        {successMsg && (
          <div style={{ background: '#1d3b24', color: '#4ade80', padding: '8px 20px', fontSize: 13, borderBottom: '1px solid #285e35', display: 'flex', justifyContent: 'space-between' }}>
            <span>✓ {successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer' }}>×</button>
          </div>
        )}

        {/* Main Content Split: Left Sidebar (Revisions) & Right Workspace (Diff/Preview) */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left Sidebar: Snapshots List */}
          <div
            style={{
              width: 320,
              borderRight: '1px solid #333',
              background: '#15181c',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid #282c34',
                fontSize: 12,
                color: '#888',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ fontWeight: 600, color: '#aaa' }}>REVISION SNAPSHOTS</span>
              <span style={{ background: '#21252b', padding: '2px 6px', borderRadius: 10, fontSize: 11 }}>
                {backups.length} found
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {loadingList ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 13 }}>
                  Scanning backups...
                </div>
              ) : backups.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#777', fontSize: 13 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
                  No backup snapshots found for <b>{selectedBaseFile}</b>.
                  <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
                    Backups are automatically generated when saving changes or syncing settings.
                  </div>
                </div>
              ) : (
                backups.map(item => {
                  const isSelected = item.filename === selectedBackup;
                  return (
                    <div
                      key={item.filename}
                      onClick={() => setSelectedBackup(item.filename)}
                      style={{
                        padding: '10px 12px',
                        marginBottom: 6,
                        borderRadius: 6,
                        background: isSelected ? '#1f2838' : '#1b1f24',
                        border: isSelected ? '1px solid #3b82f6' : '1px solid #282c34',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#93c5fd' : '#e2e8f0' }}>
                          {item.formattedDate}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#888' }}>
                            {formatSize(item.size)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmItem(item);
                            }}
                            title={`Delete snapshot "${item.filename}"`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#888',
                              cursor: 'pointer',
                              padding: '1px 3px',
                              borderRadius: 3,
                              fontSize: 12,
                              lineHeight: 1
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {item.isSafetyBackup ? (
                          <span
                            style={{
                              background: '#78350f',
                              color: '#fef3c7',
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 3
                            }}
                          >
                            🛡️ PRE-RESTORE SAFETY
                          </span>
                        ) : (
                          <span
                            style={{
                              background: '#1e3a8a',
                              color: '#bfdbfe',
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '1px 5px',
                              borderRadius: 3
                            }}
                          >
                            SNAPSHOT
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 11,
                            color: '#666',
                            fontFamily: 'Consolas, monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 180
                          }}
                          title={item.filename}
                        >
                          {item.filename}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Workspace: Diff & Preview Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#191c20' }}>
            {selectedBackup && currentSelectedMeta ? (
              <>
                {/* Revision Actions & View Bar */}
                <div
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid #333',
                    background: '#16191d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                        {currentSelectedMeta.filename}
                      </div>
                      <div style={{ fontSize: 11, color: '#888' }}>
                        Snapshot Date: <b>{currentSelectedMeta.formattedDate}</b> • Size: {formatSize(currentSelectedMeta.size)}
                      </div>
                    </div>

                    {/* Diff Summary Badges */}
                    {diffLines.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, fontSize: 11, alignItems: 'center' }}>
                        <span style={{ color: '#4ade80', background: '#143820', padding: '2px 6px', borderRadius: 3 }}>
                          +{additionsCount} added
                        </span>
                        <span style={{ color: '#f87171', background: '#3b1a1a', padding: '2px 6px', borderRadius: 3 }}>
                          -{deletionsCount} removed
                        </span>
                        <span style={{ color: '#94a3b8', background: '#21262d', padding: '2px 6px', borderRadius: 3 }}>
                          {unchangedCount} unchanged
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* View Mode Toggle */}
                    <div style={{ display: 'inline-flex', background: '#121418', borderRadius: 4, padding: 2, border: '1px solid #333' }}>
                      <button
                        type="button"
                        onClick={() => setViewMode('sideBySide')}
                        style={{
                          padding: '3px 10px',
                          fontSize: 12,
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                          background: viewMode === 'sideBySide' ? '#1f6feb' : 'transparent',
                          color: viewMode === 'sideBySide' ? '#fff' : '#aaa'
                        }}
                      >
                        Side-by-Side Diff
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('unified')}
                        style={{
                          padding: '3px 10px',
                          fontSize: 12,
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                          background: viewMode === 'unified' ? '#1f6feb' : 'transparent',
                          color: viewMode === 'unified' ? '#fff' : '#aaa'
                        }}
                      >
                        Unified Diff
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('raw')}
                        style={{
                          padding: '3px 10px',
                          fontSize: 12,
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                          background: viewMode === 'raw' ? '#1f6feb' : 'transparent',
                          color: viewMode === 'raw' ? '#fff' : '#aaa'
                        }}
                      >
                        Raw Backup View
                      </button>
                    </div>

                    {/* Restore Action Button */}
                    <button
                      type="button"
                      onClick={() => setConfirmRestoreOpen(true)}
                      style={{
                        background: '#238636',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '6px 16px',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                      }}
                    >
                      <span>🔄</span> Restore this Revision
                    </button>
                  </div>
                </div>

                {/* Diff Viewer Body */}
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#121418', position: 'relative' }}>
                  {loadingContent ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
                      Computing diff and loading revision details...
                    </div>
                  ) : viewMode === 'sideBySide' ? (
                    /* Side-by-Side Dual Pane */
                    <div style={{ display: 'flex', minWidth: '100%', height: '100%' }}>
                      {/* Left Column: Selected Backup */}
                      <div style={{ flex: 1, borderRight: '1px solid #333', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div
                          style={{
                            background: '#1a202c',
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#93c5fd',
                            borderBottom: '1px solid #2d3748',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10
                          }}
                        >
                          ◀ Backup Snapshot ({currentSelectedMeta.formattedDate})
                        </div>
                        <div style={{ flex: 1, fontFamily: 'Consolas, Menlo, monospace', fontSize: 12, lineHeight: '20px' }}>
                          {sideBySideRows.map((row, idx) => {
                            const left = row.left;
                            const isRemoved = left?.type === 'removed';
                            return (
                              <div
                                key={`l-${idx}`}
                                style={{
                                  display: 'flex',
                                  background: isRemoved ? 'rgba(239, 68, 68, 0.18)' : 'transparent',
                                  color: isRemoved ? '#fca5a5' : '#cbd5e1',
                                  minHeight: 20
                                }}
                              >
                                <span
                                  style={{
                                    width: 44,
                                    userSelect: 'none',
                                    textAlign: 'right',
                                    paddingRight: 8,
                                    color: '#64748b',
                                    borderRight: '1px solid #262626',
                                    background: '#0d1117'
                                  }}
                                >
                                  {left?.lineNumber || ''}
                                </span>
                                <span style={{ paddingLeft: 8, whiteSpace: 'pre', overflowX: 'hidden' }}>
                                  {left?.content ?? ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Column: Current Active INI */}
                      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div
                          style={{
                            background: '#16221c',
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#86efac',
                            borderBottom: '1px solid #22543d',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10
                          }}
                        >
                          ▶ Current Active INI ({selectedBaseFile})
                        </div>
                        <div style={{ flex: 1, fontFamily: 'Consolas, Menlo, monospace', fontSize: 12, lineHeight: '20px' }}>
                          {sideBySideRows.map((row, idx) => {
                            const right = row.right;
                            const isAdded = right?.type === 'added';
                            return (
                              <div
                                key={`r-${idx}`}
                                style={{
                                  display: 'flex',
                                  background: isAdded ? 'rgba(34, 197, 94, 0.18)' : 'transparent',
                                  color: isAdded ? '#86efac' : '#cbd5e1',
                                  minHeight: 20
                                }}
                              >
                                <span
                                  style={{
                                    width: 44,
                                    userSelect: 'none',
                                    textAlign: 'right',
                                    paddingRight: 8,
                                    color: '#64748b',
                                    borderRight: '1px solid #262626',
                                    background: '#0d1117'
                                  }}
                                >
                                  {right?.lineNumber || ''}
                                </span>
                                <span style={{ paddingLeft: 8, whiteSpace: 'pre', overflowX: 'hidden' }}>
                                  {right?.content ?? ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : viewMode === 'unified' ? (
                    /* Unified Diff */
                    <div style={{ fontFamily: 'Consolas, Menlo, monospace', fontSize: 12, lineHeight: '20px', padding: '8px 0' }}>
                      {diffLines.map((line, idx) => {
                        const isAdded = line.type === 'added';
                        const isRemoved = line.type === 'removed';
                        const bg = isAdded
                          ? 'rgba(34, 197, 94, 0.15)'
                          : isRemoved
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'transparent';
                        const col = isAdded ? '#86efac' : isRemoved ? '#fca5a5' : '#cbd5e1';
                        const sign = isAdded ? '+' : isRemoved ? '-' : ' ';

                        return (
                          <div key={idx} style={{ display: 'flex', background: bg, color: col }}>
                            <span
                              style={{
                                width: 36,
                                textAlign: 'right',
                                paddingRight: 6,
                                color: '#64748b',
                                userSelect: 'none',
                                background: '#0d1117'
                              }}
                            >
                              {line.oldLineNumber || ''}
                            </span>
                            <span
                              style={{
                                width: 36,
                                textAlign: 'right',
                                paddingRight: 8,
                                color: '#64748b',
                                userSelect: 'none',
                                borderRight: '1px solid #262626',
                                background: '#0d1117'
                              }}
                            >
                              {line.newLineNumber || ''}
                            </span>
                            <span style={{ width: 18, textAlign: 'center', userSelect: 'none', color: '#64748b' }}>
                              {sign}
                            </span>
                            <span style={{ paddingLeft: 4, whiteSpace: 'pre' }}>{line.content}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Raw Backup View */
                    <pre
                      style={{
                        margin: 0,
                        padding: 16,
                        fontFamily: 'Consolas, Menlo, monospace',
                        fontSize: 12,
                        color: '#abb2bf',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}
                    >
                      {backupContent}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777' }}>
                Select a revision snapshot from the left panel to inspect diff and restore options.
              </div>
            )}
          </div>
        </div>

        {/* Restore Confirmation Modal Dialog */}
        {confirmRestoreOpen && currentSelectedMeta && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1300,
              padding: 20
            }}
          >
            <div
              style={{
                background: '#1e2227',
                border: '1px solid #eab308',
                borderRadius: 8,
                maxWidth: 520,
                width: '100%',
                padding: 24,
                boxShadow: '0 12px 36px rgba(0,0,0,0.7)',
                color: '#eee'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 28 }}>⚠️</span>
                <h4 style={{ margin: 0, fontSize: 18, color: '#fef08a' }}>
                  Restore Configuration Snapshot?
                </h4>
              </div>

              <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                Restoring this snapshot will overwrite the active <b>{selectedBaseFile}</b> file on disk with settings from:
              </p>

              <div
                style={{
                  background: '#121418',
                  border: '1px solid #333',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 16,
                  fontSize: 12
                }}
              >
                <div>
                  <b style={{ color: '#888' }}>Snapshot:</b>{' '}
                  <span style={{ color: '#93c5fd', fontFamily: 'monospace' }}>{currentSelectedMeta.filename}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <b style={{ color: '#888' }}>Date:</b>{' '}
                  <span style={{ color: '#f1f5f9' }}>{currentSelectedMeta.formattedDate}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <b style={{ color: '#888' }}>Target:</b>{' '}
                  <span style={{ color: '#86efac' }}>{selectedBaseFile}</span>
                </div>
              </div>

              {serverRunning && (
                <div
                  style={{
                    background: '#451a03',
                    border: '1px solid #b45309',
                    borderRadius: 6,
                    padding: '10px 12px',
                    marginBottom: 16,
                    fontSize: 12,
                    color: '#fef08a',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    lineHeight: 1.4
                  }}
                >
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span>
                    <b>Notice: Server is currently active.</b> You must restart the server after restoring for changes to take effect. If possible, stop the server before restoring to prevent memory overwrite.
                  </span>
                </div>
              )}

              <div
                style={{
                  background: '#1c2438',
                  border: '1px solid #2563eb',
                  borderRadius: 6,
                  padding: '8px 12px',
                  marginBottom: 20,
                  fontSize: 12,
                  color: '#93c5fd',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <span>🛡️</span>
                <span>
                  <b>Automatic Safety Snapshot:</b> A pre-restore snapshot of your current INI will be created before restoring so this action can be undone at any time.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setConfirmRestoreOpen(false)}
                  disabled={restoring}
                  style={{
                    background: '#30363d',
                    color: '#c9d1d9',
                    border: '1px solid #484f58',
                    borderRadius: 4,
                    padding: '6px 16px',
                    fontWeight: 600,
                    cursor: restoring ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={restoring}
                  style={{
                    background: restoring ? '#444' : '#d97706',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '6px 20px',
                    fontWeight: 700,
                    cursor: restoring ? 'not-allowed' : 'pointer'
                  }}
                >
                  {restoring ? 'Restoring...' : 'Yes, Restore Revision'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Single Backup Deletion Confirmation Modal */}
        {deleteConfirmItem && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 1300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20
            }}
            onClick={() => {
              if (!deleting) setDeleteConfirmItem(null);
            }}
          >
            <div
              style={{
                background: '#1e2227',
                border: '1px solid #ef4444',
                borderRadius: 8,
                maxWidth: 480,
                width: '100%',
                padding: 24,
                boxShadow: '0 12px 36px rgba(0,0,0,0.8)',
                color: '#eee'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 26 }}>🗑️</span>
                <h4 style={{ margin: 0, fontSize: 18, color: '#fca5a5' }}>
                  Delete Backup Snapshot?
                </h4>
              </div>

              <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                Delete backup snapshot <b style={{ color: '#93c5fd', fontFamily: 'monospace' }}>"{deleteConfirmItem.filename}"</b>? This action cannot be undone.
              </p>

              {deleteConfirmItem.isSafetyBackup && (
                <div
                  style={{
                    background: '#451a03',
                    border: '1px solid #b45309',
                    borderRadius: 6,
                    padding: '10px 12px',
                    marginBottom: 16,
                    fontSize: 12,
                    color: '#fef08a',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    lineHeight: 1.4
                  }}
                >
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span>
                    <b>This is a PRE-RESTORE SAFETY snapshot.</b> Deleting it will remove the safety restore point.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmItem(null)}
                  disabled={deleting}
                  style={{
                    background: '#30363d',
                    color: '#c9d1d9',
                    border: '1px solid #484f58',
                    borderRadius: 4,
                    padding: '6px 16px',
                    fontWeight: 600,
                    cursor: deleting ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteBackup}
                  disabled={deleting}
                  style={{
                    background: deleting ? '#444' : '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '6px 20px',
                    fontWeight: 700,
                    cursor: deleting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete Snapshot'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
