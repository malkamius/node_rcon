import React, { useState, useEffect, useRef } from 'react';
import { loadArkSettingsTemplate } from './arkSettingsTemplateLoader';


export const ServerConfigTab: React.FC<{ serverProfiles: Array<{
  name: string;
  host: string;
  port: number;
  password: string;
  game?: string;
  features?: any;
  layout?: any;
  directory?: string;
}>; onManageServers: () => void; }> = ({ serverProfiles, onManageServers }) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [editingFile, setEditingFile] = useState<'Game.ini' | 'GameUserSettings.ini' | null>(null);
  const [iniData, setIniData] = useState<any>(null); // parsed ini data
  const [formState, setFormState] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsTemplate, setSettingsTemplate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedProfile = selectedIdx !== null ? serverProfiles[selectedIdx] : null;

  // Ref and state for dynamic maxHeight
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const [editorMaxHeight, setEditorMaxHeight] = useState<string>('');

  useEffect(() => {
    function updateMaxHeight() {
      requestAnimationFrame(() => {
        if (editorAreaRef.current) {
          const rect = editorAreaRef.current.getBoundingClientRect();
          const offsetTop = rect.top + window.scrollY;
          const maxHeight = window.innerHeight - (rect.top) - 100;
          setEditorMaxHeight(maxHeight > 40 ? `${maxHeight}px` : '40px');
        }
      });
    }
    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);
    window.addEventListener('scroll', updateMaxHeight, true);
    return () => {
      window.removeEventListener('resize', updateMaxHeight);
      window.removeEventListener('scroll', updateMaxHeight, true);
    };
  }, [editingFile, selectedIdx]);

  // Load settings template on mount
  useEffect(() => {
    loadArkSettingsTemplate().then(setSettingsTemplate).catch(() => setSettingsTemplate(null));
  }, []);

  // Fetch INI data from backend
  const fetchIni = async (file: 'Game.ini' | 'GameUserSettings.ini') => {
    if (selectedIdx === null || !settingsTemplate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/server-ini/${selectedIdx}/${file}`);
      const iniObj = await res.json();
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
            if (val !== undefined) {
              if (typeof val === 'boolean') {
                boolVal = val;
              } else if (typeof val === 'string') {
                boolVal = val.toLowerCase() === 'true' || val === '1';
              } else {
                boolVal = Boolean(val);
              }
            } else {
              boolVal = !!setting.default;
            }
            newFormState[sectionName][key] = { value: boolVal };
          } else if (setting.type === 'int' || setting.type === 'float') {
            let numVal;
            if (val !== undefined && val !== '') {
              numVal = Number(val);
            } else if (setting.default !== undefined) {
              numVal = Number(setting.default);
            } else {
              numVal = 0;
            }
            newFormState[sectionName][key] = { value: numVal };
          } else if (setting.type === 'array') {
            let arrVal;
            if (Array.isArray(val)) {
              arrVal = val;
            } else if (val) {
              arrVal = [val];
            } else if (Array.isArray(setting.default)) {
              arrVal = setting.default;
            } else if (setting.default) {
              arrVal = [setting.default];
            } else {
              arrVal = [];
            }
            newFormState[sectionName][key] = { value: arrVal };
          } else {
            let strVal;
            if (val !== undefined && val !== null) {
              strVal = val;
            } else if (setting.default !== undefined) {
              strVal = setting.default;
            } else {
              strVal = '';
            }
            newFormState[sectionName][key] = { value: strVal };
          }
        }
      }
      setFormState(newFormState);
    } catch (e) {
      setIniData({});
      setFormState({});
    }
    // Calculate maxHeight for editor area
    requestAnimationFrame(() => {
      if (editorAreaRef.current) {
        const rect = editorAreaRef.current.getBoundingClientRect();
        const maxHeight = window.innerHeight - rect.top - 100;
        setEditorMaxHeight(maxHeight > 40 ? `${maxHeight}px` : '40px');
      }
    });
    setLoading(false);
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
    if (selectedIdx === null || !editingFile || !settingsTemplate) return;
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
    try {
      const res = await fetch(`/api/server-ini/${selectedIdx}/${editingFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(iniObj),
      });
      if (!res.ok) {
        let msg = 'Failed to save INI file';
        try {
          const data = await res.json();
          if (data && data.error) msg = data.error;
        } catch {}
        setError(msg);
        setSaving(false);
        return;
      }
      setEditingFile(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to save INI file');
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setEditingFile(null);
  };

  return (
    <div style={{ padding: '2em', maxWidth: 900, margin: '0 auto' }}>
      <h2>Server Configuration</h2>
      {error && (
        <div style={{ background: '#ffdddd', color: '#a00', padding: '8px 16px', textAlign: 'center', fontWeight: 600, border: '1px solid #a00', borderRadius: 4, marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 16, background: 'none', border: 'none', color: '#a00', fontWeight: 700, cursor: 'pointer' }}>×</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 32 }}>
        {/* Server List */}
        <div style={{ minWidth: 260 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Servers</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {serverProfiles.map((profile, idx) => (
              <li
                key={idx}
                style={{
                  padding: '8px 12px',
                  marginBottom: 4,
                  background: selectedIdx === idx ? '#23272e' : '#191c20',
                  color: selectedIdx === idx ? '#fff' : '#ccc',
                  borderRadius: 4,
                  cursor: 'pointer',
                  border: selectedIdx === idx ? '1px solid #4af' : '1px solid #222',
                }}
                onClick={() => setSelectedIdx(idx)}
              >
                <div style={{ fontWeight: 'bold' }}>{profile.name || `${profile.host}:${profile.port}`}</div>
              </li>
            ))}
          </ul>
          <button style={{ marginTop: 16 }} onClick={onManageServers}>Manage Servers</button>
        </div>

        {/* INI Editor Area */}
        <div style={{ flex: 1, minWidth: 300 }}>
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
          <div
            style={{ background: '#191c20', padding: 16, borderRadius: 6, color: '#eee', border: '1px solid #444' }}
          >
            {editingFile && selectedProfile ? (
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Editing {editingFile} for {selectedProfile.name}</div>
                {loading ? (
                  <div style={{ color: '#aaa' }}>Loading...</div>
                ) : (
                  <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
                    <div style={{ margin: 16 }}>
                      <button type="submit" disabled={saving} style={{ marginRight: 8 }}>{saving ? 'Saving...' : 'Save'}</button>
                      <button type="button" onClick={handleCancel} disabled={saving}>Cancel</button>
                    </div>
                    <div
                        ref={editorAreaRef}
                        style={{
                        minHeight: 200,
                        background: '#23272e',
                        borderRadius: 6,
                        padding: 24,
                        color: '#eee',
                        border: '1px solid #444',
                        maxHeight: editorMaxHeight || undefined,
                        overflowY: 'auto',
                        }}
                    >
                    {settingsTemplate && editingFile ? (
                      Object.entries(settingsTemplate[editingFile].sections).map(([sectionName, section]: any) => {
                        // Group settings by base name if they match pattern BaseName[Number]
                        const grouped: { [base: string]: [string, any][] } = {};
                        const singles: [string, any][] = [];
                        Object.entries(section.settings).forEach(([key, setting]: any) => {
                          const match = key.match(/^(\w+)\[(\d+)\]$/);
                          if (match) {
                            const base = match[1];
                            if (!grouped[base]) grouped[base] = [];
                            grouped[base].push([key, setting]);
                          } else {
                            singles.push([key, setting]);
                          }
                        });
                        return (
                          <div key={sectionName} style={{ marginBottom: 24 }}>
                            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{sectionName}</div>
                            {/* Render grouped settings as sub-frames */}
                            {Object.entries(grouped).map(([base, items]) => (
                              <div key={base} style={{ border: '1px solid #333', borderRadius: 4, marginBottom: 12, padding: 12, background: '#222' }}>
                                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{base}</div>
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
                )}
              </div>
            ) : selectedProfile ? (
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Editing: {selectedProfile.name}</div>
                <div style={{ color: '#aaa', fontSize: '0.95em', marginBottom: 8 }}>
                  Directory: {selectedProfile.directory || <span style={{ color: '#f66' }}>Not set</span>}
                </div>
                <div style={{ color: '#aaa', fontSize: '0.95em' }}>
                  Host: {selectedProfile.host || <span style={{ color: '#888' }}>N/A</span>}<br />
                  Port: {selectedProfile.port || <span style={{ color: '#888' }}>N/A</span>}
                </div>
                <div style={{ marginTop: 24, color: '#888' }}>
                  (Select a file to edit its settings.)
                </div>
              </div>
            ) : (
              <div style={{ color: '#888' }}>Select a server to begin editing its configuration.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
