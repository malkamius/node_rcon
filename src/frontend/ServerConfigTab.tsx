import React, { useState, useEffect, useRef, useCallback } from 'react';


import { loadArkSettingsTemplate } from './arkSettingsTemplateLoader';
import { IniRevisionModal } from './IniRevisionModal';

interface ServerProfile {
  name: string;
  host: string;
  port: number;
  password: string;
  game?: string;
  features?: any;
  layout?: any;
  directory?: string;
  baseInstallId?: string;
  baseInstallPath?: string;
  baseInstallVersion?: string;
  latestBuildId?: string;
  updateAvailable?: boolean;
}

interface ServerConfigTabProps {
  serverProfiles: ServerProfile[];
  // statusMap: key -> { running, startTime, manuallyStopped, autoStart, baseInstallId }
  statusMap: Record<string, any>;
  selectedKey: string | null;
  onTabSelect: (key: string) => void;
  onManageServers: () => void;
  onViewLogs?: (key: string) => void;
  wsRef: React.MutableRefObject<WebSocket | null>;
}

// --- WebSocket request/response utility (copy from ServerManagerPage) ---
function wsRequest(ws: WebSocket | null, payload: any, cb: (data: any) => void, timeout = 8000) {
  if (!ws || ws.readyState !== 1) {
    cb({ error: 'WebSocket not connected' });
    return;
  }
  const requestId = 'req' + Math.random().toString(36).slice(2);
  payload.requestId = requestId;
  let timeoutTimer = setTimeout(() => {
    ws.removeEventListener('message', handleMessage);
    cb({ error: 'WebSocket request timeout' });
  }, timeout);
  const handleMessage = (event: MessageEvent) => {
    try {
      
      const msg = JSON.parse(event.data);
      if (msg.requestId === requestId) {
        clearTimeout(timeoutTimer);
        ws.removeEventListener('message', handleMessage);
        cb(msg);
      }
    } catch {}
  };
  ws.addEventListener('message', handleMessage);
  ws.send(JSON.stringify(payload));
  
}

export const ServerConfigTab: React.FC<ServerConfigTabProps & { wsRef?: React.MutableRefObject<WebSocket | null> }> = ({ serverProfiles, statusMap, selectedKey, onTabSelect, onManageServers, onViewLogs, wsRef }) => {
  const [editingFile, setEditingFile] = useState<'Game.ini' | 'GameUserSettings.ini' | null>(null);
  const [viewMode, setViewMode] = useState<'form' | 'raw'>('form');
  const [rawText, setRawText] = useState<string>('');
  const [initialRawText, setInitialRawText] = useState<string>('');
  const [customSections, setCustomSections] = useState<{ [sectionName: string]: { [key: string]: string } }>({});
  const [newSectionName, setNewSectionName] = useState<string>('');
  const [iniData, setIniData] = useState<any>(null); // parsed ini data
  const [formState, setFormState] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsTemplate, setSettingsTemplate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState(serverProfiles);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revisionModalOpen, setRevisionModalOpen] = useState<boolean>(false);
  const [revisionModalTarget, setRevisionModalTarget] = useState<'GameUserSettings.ini' | 'Game.ini'>('GameUserSettings.ini');
  // Helper to show a message for a short time
  const showMsg = (type: 'success' | 'error', text: string, timeout = 3500) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), timeout);
  };
  const handleOpenRevisionHistory = (target?: 'GameUserSettings.ini' | 'Game.ini') => {
    setRevisionModalTarget(target || editingFile || 'GameUserSettings.ini');
    setRevisionModalOpen(true);
  };
  const handleRestored = (restoredFile: string, _newActiveContent: string) => {
    showMsg(
      'success',
      running
        ? `Restored ${restoredFile} successfully. (Note: Server is currently running; restart is required for changes to take effect.)`
        : `Restored ${restoredFile} successfully`,
      5000
    );
    if (editingFile) {
      fetchIni(editingFile);
    }
  };

  const selectedProfile = selectedKey ? profiles.find(p => `${p.host}:${p.port}` === selectedKey) : null;
  const procStatus = selectedKey ? statusMap[selectedKey] : undefined;
  const running = !!procStatus?.running;
  const manuallyStopped = !!procStatus?.manuallyStopped;
  const autoStart = !!procStatus?.autoStart;
  const startTime = procStatus?.startTime;

  // Load settings template on mount
  useEffect(() => {
    loadArkSettingsTemplate().then(setSettingsTemplate).catch(() => setSettingsTemplate(null));
  }, []);
  // Reload profiles when serverProfiles prop changes (after save)
  useEffect(() => {
    setProfiles(serverProfiles);
  }, [serverProfiles]);

  // Fetch INI data from backend
  const fetchIni = async (file: 'Game.ini' | 'GameUserSettings.ini') => {
    if (!selectedProfile || !settingsTemplate || !wsRef.current) return;
    setLoading(true);
    const idx = profiles.findIndex(p => `${p.host}:${p.port}` === selectedKey);

    wsRequest(wsRef.current, { type: 'getServerIni', idx, file }, (resp) => {
      if (resp.error || !resp.iniObj) {
        setIniData({});
        setFormState({});
        setCustomSections({});
        const rText = resp.rawText || '';
        setRawText(rText);
        setInitialRawText(rText);
        setLoading(false);
        return;
      }
      const iniObj = resp.iniObj;
      setIniData(iniObj);
      const rText = resp.rawText || '';
      setRawText(rText);
      setInitialRawText(rText);

      // Helper to get nested value from iniObj using period-separated section name
      function getNestedSection(obj: any, sectionPath: string) {
        const parts = sectionPath.split('.');
        let curr = obj;
        for (const part of parts) {
          if (curr && Object.prototype.hasOwnProperty.call(curr, part)) {
            curr = curr[part];
          } else {
            return undefined;
          }
        }
        return curr;
      }
      // Map iniObj to formState
      const newFormState: any = {};
      const templateSections = settingsTemplate[file]?.sections || {};
      for (const sectionName in templateSections) {
        newFormState[sectionName] = {};
        const section = templateSections[sectionName];
        // Remove brackets and split by period for nested lookup
        const iniSectionName = sectionName.replace(/(^\[|\]$)/g, '');
        const sectionParts = iniSectionName.split('.');
        const iniSectionObj = getNestedSection(iniObj, sectionParts.join('.'));
        for (const key in section.settings) {
          const setting = section.settings[key];
          const val = iniSectionObj?.[key];
          // Use value from iniObj if present, otherwise use default from template
          if (setting.type === 'bool') {
            let boolVal;
            if (val !== undefined) { boolVal = (val === 'True' || val === true); } else { boolVal = !!setting.default; }
            newFormState[sectionName][key] = { value: boolVal };
          } else if (setting.type === 'int' || setting.type === 'float') {
            let numVal;
            if (val !== undefined && val !== '') { numVal = Number(val); } else if (setting.default !== undefined) { numVal = Number(setting.default); } else { numVal = ''; }
            newFormState[sectionName][key] = { value: numVal };
          } else if (setting.type === 'array') {
            let arrVal;
            if (Array.isArray(val)) { arrVal = val; } else if (val) { arrVal = [String(val)]; } else if (Array.isArray(setting.default)) { arrVal = setting.default; } else if (setting.default) { arrVal = [String(setting.default)]; } else { arrVal = []; }
            newFormState[sectionName][key] = { value: arrVal };
          } else {
            let strVal;
            if (val !== undefined && val !== null) { strVal = String(val); } else if (setting.default !== undefined) { strVal = String(setting.default); } else { strVal = ''; }
            newFormState[sectionName][key] = { value: strVal };
          }
        }
      }
      setFormState(newFormState);

      // Extract custom sections not present in template
      const templateCleanNames = new Set(
        Object.keys(templateSections).map(s => s.replace(/(^\[|\]$)/g, '').toLowerCase().trim())
      );
      const newCustomSections: { [sectionName: string]: { [key: string]: string } } = {};

      for (const sectionKey of Object.keys(iniObj)) {
        const cleanKey = sectionKey.replace(/(^\[|\]$)/g, '').toLowerCase().trim();
        if (!templateCleanNames.has(cleanKey)) {
          const secVal = iniObj[sectionKey];
          if (secVal && typeof secVal === 'object' && !Array.isArray(secVal)) {
            const formattedName = sectionKey.startsWith('[') && sectionKey.endsWith(']') ? sectionKey : `[${sectionKey}]`;
            newCustomSections[formattedName] = {};
            for (const [k, v] of Object.entries(secVal)) {
              if (v !== undefined && v !== null && typeof v !== 'object') {
                newCustomSections[formattedName][k] = String(v);
              }
            }
          }
        }
      }
      setCustomSections(newCustomSections);

      setLoading(false);
    });
  };

  const handleEditFile = (file: 'Game.ini' | 'GameUserSettings.ini') => {
    setEditingFile(file);
    setViewMode('form');
    fetchIni(file);
  };

  const handleFormChange = (section: string, key: string, field: 'enabled' | 'value', value: any) => {
    setFormState((prev: any) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: {
          ...prev[section]?.[key],
          [field]: value
        }
      }
    }));
  };


  // Custom section manipulation handlers
  const handleCustomKeyChange = (sectionName: string, key: string, value: string) => {
    setCustomSections(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        [key]: value
      }
    }));
  };

  const handleCustomKeyRename = (sectionName: string, oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    setCustomSections(prev => {
      const section = { ...prev[sectionName] };
      const val = section[oldKey] ?? '';
      delete section[oldKey];
      section[newKey] = val;
      return {
        ...prev,
        [sectionName]: section
      };
    });
  };

  const handleAddCustomKey = (sectionName: string) => {
    let newKey = 'NewKey';
    let counter = 1;
    while (customSections[sectionName] && Object.prototype.hasOwnProperty.call(customSections[sectionName], newKey)) {
      newKey = `NewKey_${counter++}`;
    }
    setCustomSections(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        [newKey]: ''
      }
    }));
  };

  const handleDeleteCustomKey = (sectionName: string, key: string) => {
    setCustomSections(prev => {
      const section = { ...prev[sectionName] };
      delete section[key];
      return {
        ...prev,
        [sectionName]: section
      };
    });
  };

  const handleAddCustomSection = () => {
    let trimmed = newSectionName.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('[')) trimmed = `[${trimmed}`;
    if (!trimmed.endsWith(']')) trimmed = `${trimmed}]`;

    if (customSections[trimmed]) {
      setError(`Section ${trimmed} already exists.`);
      return;
    }

    setCustomSections(prev => ({
      ...prev,
      [trimmed]: {}
    }));
    setNewSectionName('');
  };

  const handleDeleteCustomSection = (sectionName: string) => {
    setCustomSections(prev => {
      const updated = { ...prev };
      delete updated[sectionName];
      return updated;
    });
  };

  // Save Raw INI
  const handleSaveRaw = async () => {
    if (!selectedProfile || !editingFile || !wsRef.current) return;
    setSaving(true);
    setError(null);
    const idx = profiles.findIndex(p => `${p.host}:${p.port}` === selectedKey);
    wsRequest(wsRef.current, { type: 'saveServerIni', idx, file: editingFile, rawText }, (resp) => {
      if (resp.error) {
        setError(resp.error || 'Failed to save INI file');
        setSaving(false);
        return;
      }
      setInitialRawText(rawText);
      setSaving(false);
      showMsg(
        'success',
        running
          ? 'Settings saved to disk. (Note: Server is currently running; restart is required for changes to take effect.)'
          : 'Raw INI saved successfully',
        5000
      );
    });
  };

  // Save INI data to backend (Form View)
  const handleSave = async () => {
    if (!selectedProfile || !editingFile || !settingsTemplate || !wsRef.current) return;
    setSaving(true);
    setError(null);
    // Build iniObj from formState, supporting nested/period-separated section names
    const iniObj: any = {};
    const templateSections = settingsTemplate[editingFile]?.sections || {};
    // Helper to set nested value in iniObj
    function setNestedSection(obj: any, sectionPath: string, key: string, value: any) {
      const parts = sectionPath.split('.');
      let curr = obj;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          if (!curr[part]) curr[part] = {};
          curr[part][key] = value;
        } else {
          if (!curr[part]) curr[part] = {};
          curr = curr[part];
        }
      }
    }
    for (const sectionName in templateSections) {
      const iniSectionName = sectionName.replace(/(^\[|\]$)/g, '');
      const sectionParts = iniSectionName.split('.');
      const section = templateSections[sectionName];
      for (const key in section.settings) {
        const setting = section.settings[key];
        const s = formState[sectionName]?.[key];
        // Only add if value differs from default
        let isDefault = false;
        if (setting.type === 'bool') {
          const val = !!s.value;
          const def = !!setting.default;
          isDefault = val === def;
          if (!isDefault) setNestedSection(iniObj, sectionParts.join('.'), key, val? "True" : "False");
        } else if (setting.type === 'int' || setting.type === 'float') {
          if (s.value !== '' && !isNaN(Number(s.value))) {
            const val = Number(s.value);
            const def = setting.default !== undefined ? Number(setting.default) : 0;
            isDefault = val === def;
            if (!isDefault) setNestedSection(iniObj, sectionParts.join('.'), key, val);
          }
        } else if (setting.type === 'array') {
          const val = Array.isArray(s.value) ? s.value : [];
          let def = [];
          if (Array.isArray(setting.default)) def = setting.default;
          else if (setting.default) def = [setting.default];
          isDefault = JSON.stringify(val) === JSON.stringify(def);
          if (!isDefault && val.length > 0) setNestedSection(iniObj, sectionParts.join('.'), key, val);
        } else {
          const val = s.value;
          const def = setting.default !== undefined ? setting.default : '';
          isDefault = val === def;
          if (!isDefault && val) setNestedSection(iniObj, sectionParts.join('.'), key, val);
        }
      }
    }

    // Merge customSections into iniObj
    for (const [secName, secKeys] of Object.entries(customSections)) {
      const cleanSecName = secName.replace(/(^\[|\]$)/g, '');
      if (!iniObj[cleanSecName]) {
        iniObj[cleanSecName] = {};
      }
      for (const [k, v] of Object.entries(secKeys)) {
        if (k.trim()) {
          iniObj[cleanSecName][k.trim()] = v;
        }
      }
    }

    const idx = profiles.findIndex(p => `${p.host}:${p.port}` === selectedKey);
    wsRequest(wsRef.current, { type: 'saveServerIni', idx, file: editingFile, iniObj }, (resp) => {
      if (resp.error) {
        setError(resp.error || 'Failed to save INI file');
        setSaving(false);
        return;
      }
      setEditingFile(null);
      setSaving(false);
      showMsg(
        'success',
        running
          ? 'Settings saved to disk. (Note: Server is currently running; restart is required for changes to take effect.)'
          : 'Settings saved to disk.',
        5000
      );
    });
  };

  const handleCancel = () => {
    setEditingFile(null);
  };


  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2>Server Configuration</h2>
      {selectedProfile && (
        <div style={{ marginBottom: 8, color: running ? '#6f6' : manuallyStopped ? '#fa0' : '#f66', fontWeight: 500, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>
            Status: {running ? 'Running' : (manuallyStopped ? 'Stopped (Manual)' : 'Stopped')}
            <span style={{ marginLeft: 12, fontSize: '0.95em', color: '#aaa' }}>
              {running && startTime ? `Started at ${new Date(startTime).toLocaleTimeString()}` :
                !running && manuallyStopped ? 'Stopped manually' :
                !running && autoStart ? 'Auto-start enabled' :
                !running ? 'Not running' : ''}
            </span>
          </span>
          {/* Start/Stop Controls */}
          <button
            disabled={running || !selectedProfile}
            style={{ background: running ? '#444' : '#2d4', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', minHeight: 34, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center' }}
            onClick={() => {
              if (!selectedProfile || !wsRef.current) return;
              const key = `${selectedProfile.host}:${selectedProfile.port}`;
              wsRequest(wsRef.current, { type: 'startServer', key }, (resp) => {
                if (resp.error) {
                  showMsg('error', resp.error || 'Failed to start server');
                  return;
                }
                showMsg('success', 'Started');
              });
            }}
          >Start</button>
          <button
            disabled={!running || !selectedProfile}
            style={{ background: !running ? '#444' : '#d44', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', minHeight: 34, fontWeight: 600, cursor: !running ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center' }}
            onClick={() => {
              if (!selectedProfile || !wsRef.current) return;
              const key = `${selectedProfile.host}:${selectedProfile.port}`;
              wsRequest(wsRef.current, { type: 'stopServer', key }, (resp) => {
                if (resp.error) {
                  showMsg('error', resp.error || 'Failed to stop server');
                  return;
                }
                showMsg('success', 'Stopped');
              });
            }}
          >Stop</button>

          {/* View Server Logs / Crash Reports Button */}
          {onViewLogs && selectedKey && (
            <button
              type="button"
              onClick={() => onViewLogs(selectedKey)}
              style={{
                background: '#282c34',
                color: '#61afef',
                border: '1px solid #3e4451',
                borderRadius: 4,
                padding: '6px 12px',
                minHeight: 34,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
              title="View ShooterGame.log and crash reports"
            >
              📜 View Logs & Crash Reports
            </button>
          )}

          {/* Inline feedback message */}
          {actionMsg && (
            <span style={{ marginLeft: 8, color: actionMsg.type === 'success' ? '#6f6' : '#f66', fontWeight: 600, fontSize: 14 }}>
              {actionMsg.text}
            </span>
          )}
        </div>
      )}

      {/* Base Install & Game Update Status Banner */}
      {selectedProfile && (
        <div
          style={{
            marginBottom: 12,
            padding: '6px 12px',
            background: (selectedProfile.updateAvailable || statusMap[selectedKey || '']?.updateAvailable) ? '#2d1a10' : '#1e2227',
            border: (selectedProfile.updateAvailable || statusMap[selectedKey || '']?.updateAvailable) ? '1px solid #d97706' : '1px solid #333',
            borderRadius: 4,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>
              <b style={{ color: '#888' }}>Base Install:</b>{' '}
              <span style={{ color: '#eee' }}>
                {selectedProfile.baseInstallId || statusMap[selectedKey || '']?.baseInstallId || selectedProfile.baseInstallPath || 'Automatic (Default)'}
              </span>
            </span>
            {selectedProfile.baseInstallVersion && (
              <span>
                <b style={{ color: '#888' }}>Installed Build:</b>{' '}
                <span style={{ color: '#61afef' }}>{selectedProfile.baseInstallVersion}</span>
              </span>
            )}
            {selectedProfile.latestBuildId && (
              <span>
                <b style={{ color: '#888' }}>Latest Build:</b>{' '}
                <span style={{ color: '#98c379' }}>{selectedProfile.latestBuildId}</span>
              </span>
            )}
          </div>
          {(selectedProfile.updateAvailable || statusMap[selectedKey || '']?.updateAvailable) ? (
            <span style={{ background: '#d97706', color: '#fff', padding: '2px 8px', borderRadius: 3, fontWeight: 700, fontSize: 11 }}>
              ⚠️ UPDATE AVAILABLE
            </span>
          ) : (
            <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 500 }}>
              ✓ Base Install Up to Date
            </span>
          )}
        </div>
      )}
      {error && (
        <div style={{ background: '#ffdddd', color: '#a00', padding: '8px 16px', textAlign: 'center', fontWeight: 600, border: '1px solid #a00', borderRadius: 4, marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 16, background: 'none', border: 'none', color: '#a00', fontWeight: 700, cursor: 'pointer' }}>×</button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            disabled={!selectedProfile}
            style={{
              marginRight: 0,
              minHeight: 34,
              padding: '6px 14px',
              borderRadius: 4,
              fontWeight: 600,
              cursor: selectedProfile ? 'pointer' : 'not-allowed',
            }}
            onClick={() => handleEditFile('Game.ini')}
          >
            Edit Game.ini
          </button>
          <button
            disabled={!selectedProfile}
            style={{
              minHeight: 34,
              padding: '6px 14px',
              borderRadius: 4,
              fontWeight: 600,
              cursor: selectedProfile ? 'pointer' : 'not-allowed',
            }}
            onClick={() => handleEditFile('GameUserSettings.ini')}
          >
            Edit GameUserSettings.ini
          </button>
          <button
            disabled={!selectedProfile}
            type="button"
            onClick={() => handleOpenRevisionHistory('GameUserSettings.ini')}
            style={{
              background: '#282c34',
              color: '#e5c07b',
              border: '1px solid #3e4451',
              borderRadius: 4,
              padding: '6px 14px',
              minHeight: 34,
              fontWeight: 600,
              fontSize: 13,
              cursor: selectedProfile ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
            title="Inspect timestamped backup snapshots, compare diffs, and restore"
          >
            🕒 Revision History / Restore Backup
          </button>
        </div>
        <div style={{ background: '#191c20', padding: 16, borderRadius: 6, color: '#eee', border: '1px solid #444', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>          {editingFile && selectedProfile ? (
            <div style={{flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0}}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0 }}>Editing {editingFile} for {selectedProfile.name}</h3>
                  {/* View Mode Switcher */}
                  <div style={{ display: 'inline-flex', background: '#121418', borderRadius: 4, padding: 2, border: '1px solid #333' }}>
                    <button
                      type="button"
                      onClick={() => setViewMode('form')}
                      style={{
                        padding: '3px 10px',
                        fontSize: '0.85em',
                        fontWeight: 600,
                        border: 'none',
                        borderRadius: 3,
                        cursor: 'pointer',
                        background: viewMode === 'form' ? '#1f6feb' : 'transparent',
                        color: viewMode === 'form' ? '#fff' : '#aaa'
                      }}
                    >
                      Form Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('raw')}
                      style={{
                        padding: '3px 10px',
                        fontSize: '0.85em',
                        fontWeight: 600,
                        border: 'none',
                        borderRadius: 3,
                        cursor: 'pointer',
                        background: viewMode === 'raw' ? '#1f6feb' : 'transparent',
                        color: viewMode === 'raw' ? '#fff' : '#aaa'
                      }}
                    >
                      Raw INI Editor
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenRevisionHistory(editingFile)}
                    style={{
                      background: '#282c34',
                      color: '#e5c07b',
                      border: '1px solid #3e4451',
                      borderRadius: 4,
                      padding: '5px 10px',
                      fontSize: '0.85em',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title="View revision history and restore earlier versions"
                  >
                    🕒 Revisions
                  </button>

                  {viewMode === 'raw' ? (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveRaw}
                        disabled={saving || rawText === initialRawText}
                        style={{
                          background: saving || rawText === initialRawText ? '#444' : '#238636',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          padding: '5px 14px',
                          fontWeight: 600,
                          cursor: saving || rawText === initialRawText ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {saving ? 'Saving...' : 'Save Raw INI'}
                      </button>
                      <button
                        type="button"
                        onClick={() => fetchIni(editingFile)}
                        disabled={saving || loading}
                        style={{
                          background: '#30363d',
                          color: '#c9d1d9',
                          border: '1px solid #484f58',
                          borderRadius: 4,
                          padding: '5px 12px',
                          fontWeight: 600,
                          cursor: saving || loading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Reload from Disk
                      </button>
                    </>
                  ) : (
                    <button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                  )}
                  <button onClick={handleCancel} disabled={saving}>Cancel</button>
                </div>
              </div>
              {loading ? (
                <div style={{ color: '#aaa', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>
              ) : viewMode === 'raw' ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82em', color: '#8b949e' }}>
                    <span>Direct text editor for {editingFile}. Changes are saved directly to disk without template normalization.</span>
                    <span style={{
                      padding: '2px 8px',
                      background: '#21262d',
                      border: '1px solid #30363d',
                      borderRadius: 12,
                      fontFamily: 'Consolas, Menlo, monospace',
                      color: '#58a6ff'
                    }}>
                      {rawText.split('\n').length} lines · {rawText.length} chars
                    </span>
                  </div>
                  <textarea
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                    spellCheck={false}
                    style={{
                      flex: 1,
                      minHeight: 400,
                      width: '100%',
                      boxSizing: 'border-box',
                      fontFamily: 'Consolas, Menlo, monospace',
                      fontSize: '0.9em',
                      lineHeight: 1.45,
                      background: '#181a20',
                      color: '#eee',
                      border: '1px solid #444',
                      borderRadius: 6,
                      padding: 12,
                      resize: 'none',
                      whiteSpace: 'pre',
                      overflowX: 'auto',
                      outline: 'none'
                    }}
                  />
                </div>
              ) : (
                <div style={{overflowY: 'auto', display:'flex', flexDirection: 'column', color: '#eee', border: '1px solid #444', background: '#23272e', borderRadius: 6}}>
                  <form onSubmit={e => { e.preventDefault(); handleSave(); }} style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                    <div style={{ minHeight: 200, padding: 24, display: 'flex', flexDirection: 'column' }}>
                      {settingsTemplate && editingFile ? (
                        Object.entries(settingsTemplate[editingFile].sections).map(([sectionName, section]: any) => {
                          // Group settings by base name if they match pattern BaseName[Number]
                          const grouped: { [base: string]: [string, any][] } = {};
                          const singles: [string, any][] = [];
                          Object.entries(section.settings).forEach(([key, setting]: any) => {
                            const match = key.match(/^( w+)[(\d+)]$/);
                            if (match) {
                              const base = match[1];
                              if (!grouped[base]) grouped[base] = [];
                              grouped[base].push([key, setting]);
                            } else {
                              singles.push([key, setting]);
                            }
                          });
                          return (
                            <div key={sectionName} style={{ display: 'flex', flexDirection: 'column', marginBottom: 24 }}>
                              <div style={{ display:'flex', fontWeight: 'bold', marginBottom: 8 }}>{sectionName}</div>
                              {/* Render grouped settings as sub-frames */}
                              {Object.entries(grouped).map(([base, items]) => (
                                <div key={base} style={{ display: 'flex', flexDirection: 'column', border: '1px solid #333', borderRadius: 4, marginBottom: 12, padding: 12, background: '#222' }}>
                                  <div style={{ display:'flex', fontWeight: 'bold', marginBottom: 8 }}>{base}</div>
                                  {items.map(([key, setting]) => {
                                    const s = formState[sectionName]?.[key] || { value: setting.type === 'bool' ? false : '' };
                                    // Render input based on type (same as before)
                                    if (setting.type === 'bool') {
                                      return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                          <input
                                            type="checkbox"
                                            checked={!!s.value}
                                            onChange={e => handleFormChange(sectionName, key, 'value', e.target.checked)}
                                            style={{ marginRight: 8 }}
                                          />
                                          <label style={{ flex: 1 }} title={setting.description || ''}>{setting.label || key}</label>
                                        </div>
                                      );
                                    } else if (setting.type === 'int' || setting.type === 'float') {
                                      return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                          <label style={{ flex: 1, marginRight: 8 }} title={setting.description || ''}>{setting.label || key}</label>
                                          <input
                                            type="number"
                                            value={s.value === '' ? '' : s.value}
                                            min={setting.min}
                                            max={setting.max}
                                            step={setting.step}
                                            onChange={e => {
                                              const val = e.target.value;
                                              handleFormChange(
                                                sectionName,
                                                key,
                                                'value',
                                                val === '' ? '' : (!isNaN(Number(val)) ? Number(val) : s.value)
                                              );
                                            }}
                                            style={{ width: 120 }}
                                          />
                                        </div>
                                      );
                                    } else if (setting.type === 'enum') {
                                      return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                          <label style={{ flex: 1, marginRight: 8 }} title={setting.description || ''}>{setting.label || key}</label>
                                          <select
                                            value={s.value}
                                            onChange={e => handleFormChange(sectionName, key, 'value', e.target.value)}
                                            style={{ width: 160 }}
                                          >
                                            {setting.options.map((opt: string) => (
                                              <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    } else if (setting.type === 'array') {
                                      return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                          <label style={{ flex: 1, marginRight: 8 }} title={setting.description || ''}>{setting.label || key}</label>
                                          <input
                                            type="text"
                                            value={Array.isArray(s.value) ? s.value.join(',') : ''}
                                            onChange={e => handleFormChange(sectionName, key, 'value', e.target.value.split(',').map((v: string) => v.trim()).filter((v: string) => v.length > 0))}
                                            style={{ width: 200 }}
                                            placeholder="Comma separated"
                                          />
                                        </div>
                                      );
                                    } else if (setting.type === 'string') {
                                      return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                          <label style={{ flex: 1, marginRight: 8 }} title={setting.description || ''}>{setting.label || key}</label>
                                          <input
                                            type={setting.multiline ? 'textarea' : 'text'}
                                            value={s.value}
                                            onChange={e => handleFormChange(sectionName, key, 'value', e.target.value)}
                                            style={{ width: 200 }}
                                          />
                                        </div>
                                      );
                                    }
                                    return null;
                                  })}
                                </div>
                              ))}
                              {/* Render non-grouped (single) settings */}
                              {singles.map(([key, setting]) => {
                                const s = formState[sectionName]?.[key] || { value: setting.type === 'bool' ? false : '' };
                                if (setting.type === 'bool') {
                                  return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                      <input
                                        type="checkbox"
                                        checked={!!s.value}
                                        onChange={e => handleFormChange(sectionName, key, 'value', e.target.checked)}
                                        style={{ marginRight: 8 }}
                                      />
                                      <label style={{ flex: 1 }} title={setting.description || ''}>{setting.label || key}</label>
                                    </div>
                                  );
                                } else if (setting.type === 'int' || setting.type === 'float') {
                                  return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                      <label style={{ flex: 1, marginRight: 8 }} title={setting.description || ''}>{setting.label || key}</label>
                                      <input
                                        type="number"
                                        value={s.value === '' ? '' : s.value}
                                        min={setting.min}
                                        max={setting.max}
                                        step={setting.step}
                                        onChange={e => {
                                          const val = e.target.value;
                                          handleFormChange(
                                            sectionName,
                                            key,
                                            'value',
                                            val === '' ? '' : (!isNaN(Number(val)) ? Number(val) : s.value)
                                          );
                                        }}
                                        style={{ width: 120 }}
                                      />
                                    </div>
                                  );
                                } else if (setting.type === 'enum') {
                                  return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                      <label style={{ flex: 1, marginRight: 8 }} title={setting.description || ''}>{setting.label || key}</label>
                                      <select
                                        value={s.value}
                                        onChange={e => handleFormChange(sectionName, key, 'value', e.target.value)}
                                        style={{ width: 160 }}
                                      >
                                        {setting.options.map((opt: string) => (
                                          <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                } else if (setting.type === 'array') {
                                  return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                      <label style={{ flex: 1, marginRight: 8 }} title={setting.description || ''}>{setting.label || key}</label>
                                      <input
                                        type="text"
                                        value={Array.isArray(s.value) ? s.value.join(',') : ''}
                                        onChange={e => handleFormChange(sectionName, key, 'value', e.target.value.split(',').map((v: string) => v.trim()).filter((v: string) => v.length > 0))}
                                        style={{ width: 200 }}
                                        placeholder="Comma separated"
                                      />
                                    </div>
                                  );
                                } else if (setting.type === 'string') {
                                  return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                      <label style={{ flex: 1, marginRight: 8 }} title={setting.description || ''}>{setting.label || key}</label>
                                      <input
                                        type={setting.multiline ? 'textarea' : 'text'}
                                        value={s.value}
                                        onChange={e => handleFormChange(sectionName, key, 'value', e.target.value)}
                                        style={{ width: 200 }}
                                      />
                                    </div>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          );
                        })
                      ) : null}

                      {/* Custom & Mod INI Sections */}
                      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12, borderTop: '2px solid #388bfd44', paddingTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: '1.1em', fontWeight: 700, color: '#58a6ff' }}>Custom & Mod INI Sections</div>
                            <div style={{ fontSize: '0.82em', color: '#8b949e', marginTop: 2 }}>
                              Configure mod-specific sections (e.g. <code>[StructuresPlus]</code>, <code>[DinoStorage]</code>) or custom INI overrides.
                            </div>
                          </div>
                        </div>

                        {/* List of Custom Sections */}
                        {Object.entries(customSections).map(([secName, secKeys]) => (
                          <div
                            key={secName}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              border: '1px solid #30363d',
                              borderRadius: 6,
                              marginBottom: 14,
                              padding: 14,
                              background: '#1c2128'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #30363d', paddingBottom: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: '0.95em', color: '#e6edf3', fontFamily: 'monospace' }}>
                                {secName}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomSection(secName)}
                                style={{
                                  background: '#da363322',
                                  color: '#f85149',
                                  border: '1px solid #da363355',
                                  borderRadius: 4,
                                  padding: '2px 8px',
                                  fontSize: '0.78em',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Delete Section
                              </button>
                            </div>

                            {/* Keys in this section */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {Object.entries(secKeys).map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <input
                                    type="text"
                                    defaultValue={k}
                                    onBlur={e => handleCustomKeyRename(secName, k, e.target.value.trim())}
                                    placeholder="SettingKey"
                                    style={{
                                      width: 180,
                                      padding: '5px 8px',
                                      fontSize: '0.88em',
                                      fontFamily: 'monospace',
                                      background: '#16191f',
                                      border: '1px solid #30363d',
                                      borderRadius: 4,
                                      color: '#eee'
                                    }}
                                  />
                                  <span style={{ color: '#8b949e', fontWeight: 600 }}>=</span>
                                  <input
                                    type="text"
                                    value={v}
                                    onChange={e => handleCustomKeyChange(secName, k, e.target.value)}
                                    placeholder="Value"
                                    style={{
                                      flex: '1 1 200px',
                                      padding: '5px 8px',
                                      fontSize: '0.88em',
                                      fontFamily: 'monospace',
                                      background: '#16191f',
                                      border: '1px solid #30363d',
                                      borderRadius: 4,
                                      color: '#eee'
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCustomKey(secName, k)}
                                    title="Delete key"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#f85149',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                      fontSize: '1em',
                                      padding: '0 4px'
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}

                              {Object.keys(secKeys).length === 0 && (
                                <div style={{ fontSize: '0.82em', color: '#8b949e', fontStyle: 'italic' }}>
                                  No settings yet in this section.
                                </div>
                              )}

                              <div>
                                <button
                                  type="button"
                                  onClick={() => handleAddCustomKey(secName)}
                                  style={{
                                    marginTop: 4,
                                    padding: '3px 10px',
                                    fontSize: '0.8em',
                                    background: '#21262d',
                                    color: '#c9d1d9',
                                    border: '1px solid #30363d',
                                    borderRadius: 4,
                                    cursor: 'pointer'
                                  }}
                                >
                                  + Add Setting
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Add New Section Input */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                          <input
                            type="text"
                            value={newSectionName}
                            onChange={e => setNewSectionName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomSection();
                              }
                            }}
                            placeholder="e.g. [StructuresPlus] or [DinoStorage]"
                            style={{
                              width: 280,
                              padding: '6px 10px',
                              fontSize: '0.88em',
                              fontFamily: 'monospace',
                              background: '#181a20',
                              border: '1px solid #30363d',
                              borderRadius: 4,
                              color: '#eee'
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomSection}
                            style={{
                              padding: '6px 14px',
                              background: '#238636',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 4,
                              fontWeight: 600,
                              fontSize: '0.85em',
                              cursor: 'pointer'
                            }}
                          >
                            + Add Section
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : selectedProfile ? (
            <div style={{flex: 1}}>
              <div style={{ display:'flex', fontWeight: 'bold', marginBottom: 8 }}>Editing: {selectedProfile.name}</div>
              <div style={{ display:'flex',color: '#aaa', fontSize: '0.95em', marginBottom: 8 }}>
                Directory: {selectedProfile.directory || <span style={{ color: '#f66' }}>Not set</span>}
              </div>
              <div style={{ display:'flex',color: '#aaa', fontSize: '0.95em' }}>
                Host: {selectedProfile.host || <span style={{ color: '#888' }}>N/A</span>}<br />
                Port: {selectedProfile.port || <span style={{ color: '#888' }}>N/A</span>}
              </div>
              <div style={{ display:'flex',marginTop: 24, color: '#888' }}>
                (Select a file to edit its settings.)
              </div>
            </div>
          ) : (
            <div style={{ color: '#888', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Select a server to begin editing its configuration.</div>
          )}
        </div>
      </div>

      {/* INI Revision History & Backup Restore Modal */}
      <IniRevisionModal
        open={revisionModalOpen}
        onClose={() => setRevisionModalOpen(false)}
        serverKey={selectedKey}
        serverProfiles={profiles}
        targetFile={revisionModalTarget}
        onRestored={handleRestored}
        wsRef={wsRef}
        serverRunning={running}
      />
    </div>
  );
};

