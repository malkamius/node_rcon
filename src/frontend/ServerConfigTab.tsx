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
import React, { useState, useEffect } from 'react';
import { loadArkSettingsTemplate } from './arkSettingsTemplateLoader';

interface ServerProfile {
  name: string;
  host: string;
  port: number;
  password: string;
  game?: string;
  features?: any;
  layout?: any;
  directory?: string;
}

interface ServerConfigTabProps {
  serverProfiles: ServerProfile[];
  // statusMap: key -> { running, startTime, manuallyStopped, autoStart, baseInstallId }
  statusMap: Record<string, any>;
  selectedKey: string | null;
  onTabSelect: (key: string) => void;
  onManageServers: () => void;
}

export const ServerConfigTab: React.FC<ServerConfigTabProps & { ws?: WebSocket | null }> = ({ serverProfiles, statusMap, selectedKey, onTabSelect, onManageServers, ws }) => {
  const [editingFile, setEditingFile] = useState<'Game.ini' | 'GameUserSettings.ini' | null>(null);
  const [iniData, setIniData] = useState<any>(null); // parsed ini data
  const [formState, setFormState] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsTemplate, setSettingsTemplate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState(serverProfiles);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Helper to show a message for a short time
  const showMsg = (type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 2500);
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
    if (!selectedProfile || !settingsTemplate || !ws) return;
    setLoading(true);
    const idx = profiles.findIndex(p => `${p.host}:${p.port}` === selectedKey);
    wsRequest(ws, { type: 'getServerIni', idx, file }, (resp) => {
      if (resp.error || !resp.iniObj) {
        setIniData({});
        setFormState({});
        setLoading(false);
        return;
      }
      const iniObj = resp.iniObj;
      setIniData(iniObj);
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
      setLoading(false);
    });
  };

  const handleEditFile = (file: 'Game.ini' | 'GameUserSettings.ini') => {

    setEditingFile(file);
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


  // Save INI data to backend
  const handleSave = async () => {
    if (!selectedProfile || !editingFile || !settingsTemplate || !ws) return;
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
    const idx = profiles.findIndex(p => `${p.host}:${p.port}` === selectedKey);
    wsRequest(ws, { type: 'saveServerIni', idx, file: editingFile, iniObj }, (resp) => {
      if (resp.error) {
        setError(resp.error || 'Failed to save INI file');
        setSaving(false);
        return;
      }
      setEditingFile(null);
      setSaving(false);
    });
  };

  const handleCancel = () => {
    setEditingFile(null);
  };


  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2>Server Configuration</h2>
      {selectedProfile && (
        <div style={{ marginBottom: 8, color: running ? '#6f6' : manuallyStopped ? '#fa0' : '#f66', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 16 }}>
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
            style={{ background: running ? '#444' : '#2d4', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 16px', fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer' }}
            onClick={() => {
              if (!selectedProfile || !ws) return;
              const key = `${selectedProfile.host}:${selectedProfile.port}`;
              wsRequest(ws, { type: 'startServer', key }, (resp) => {
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
            style={{ background: !running ? '#444' : '#d44', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 16px', fontWeight: 600, cursor: !running ? 'not-allowed' : 'pointer' }}
            onClick={() => {
              if (!selectedProfile || !ws) return;
              const key = `${selectedProfile.host}:${selectedProfile.port}`;
              wsRequest(ws, { type: 'stopServer', key }, (resp) => {
                if (resp.error) {
                  showMsg('error', resp.error || 'Failed to stop server');
                  return;
                }
                showMsg('success', 'Stopped');
              });
            }}
          >Stop</button>
          {/* Inline feedback message */}
          {actionMsg && (
            <span style={{ marginLeft: 8, color: actionMsg.type === 'success' ? '#6f6' : '#f66', fontWeight: 600, fontSize: 14 }}>
              {actionMsg.text}
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
        <div style={{ marginBottom: 16 }}>
          <button
            disabled={!selectedProfile}
            style={{ marginRight: 8 }}
            onClick={() => handleEditFile('Game.ini')}
          >Edit Game.ini</button>
          <button
            disabled={!selectedProfile}
            onClick={() => handleEditFile('GameUserSettings.ini')}
          >Edit GameUserSettings.ini</button>
        </div>
        <div style={{ background: '#191c20', padding: 16, borderRadius: 6, color: '#eee', border: '1px solid #444', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {editingFile && selectedProfile ? (
            <div style={{flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0}}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Editing {editingFile} for {selectedProfile.name}</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                  <button onClick={handleCancel} disabled={saving}>Cancel</button>
                </div>
              </div>
              {loading ? (
                <div style={{ color: '#aaa', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>
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
                            const match = key.match(/^(w+)[(\d+)]$/);
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
    </div>
  );
};
