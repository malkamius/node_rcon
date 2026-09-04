import React, { useState, useEffect, useRef } from 'react';

export interface ScriptExecutionModalProps {
  open: boolean;
  onClose: () => void;
  serverKeys: string[];
  serverProfiles?: { name: string; host: string; port: number }[];
}

export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  isBuiltin?: boolean;
  isBuiltIn?: boolean;
}

const BUILT_IN_SCRIPTS: ScriptTemplate[] = [
  {
    id: 'builtin-restart-update-15m',
    name: 'Restart and Update (15 min warning)',
    description: 'Notifies players in intervals before restarting or updating base files.',
    content: [
      'serverchat SYSTEM: Restart and update in 15 minutes',
      'wait 300000',
      'serverchat SYSTEM: Restart and update in 10 minutes',
      'wait 300000',
      'serverchat SYSTEM: Restart and update in 5 minutes',
      'wait 240000',
      'serverchat SYSTEM: Restart and update in 1 minute',
      'wait 50000',
      'serverchat SYSTEM: Restart and update in 10 seconds',
      'wait 10000',
      'SaveWorld'
    ].join('\n'),
    isBuiltIn: true,
    isBuiltin: true,
  },
  {
    id: 'builtin-quick-broadcast-30s',
    name: 'Quick Broadcast (30s Warning & Save)',
    description: 'Broadcasting quick shutdown alert with 30s delay and world save.',
    content: [
      'serverchat SYSTEM: Server restart initiated. Saving world in 30 seconds...',
      'wait 20000',
      'serverchat SYSTEM: Restarting in 10 seconds! Please find safety.',
      'wait 10000',
      'SaveWorld'
    ].join('\n'),
    isBuiltIn: true,
    isBuiltin: true,
  },
  {
    id: 'builtin-save-world-now',
    name: 'Save World Now',
    description: 'Immediately triggers an in-game world save via RCON.',
    content: 'SaveWorld',
    isBuiltIn: true,
    isBuiltin: true,
  },
  {
    id: 'builtin-default-template',
    name: 'Custom Script',
    description: 'Compose arbitrary RCON commands line-by-line with "wait <ms>" delays.',
    content: [
      '// Enter RCON commands line by line',
      '// Use "wait <milliseconds>" to pause between commands',
      'serverchat SYSTEM: Maintenance starting soon',
      'wait 5000',
      'SaveWorld'
    ].join('\n'),
    isBuiltIn: true,
    isBuiltin: true,
  }
];

interface ServerExecStatus {
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'error';
  currentLine: number;
  totalLines: number;
  error?: string;
}

export const ScriptExecutionModal: React.FC<ScriptExecutionModalProps> = ({
  open,
  onClose,
  serverKeys,
  serverProfiles = []
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(BUILT_IN_SCRIPTS[0].id);
  const [customTemplates, setCustomTemplates] = useState<ScriptTemplate[]>([]);
  const [customDescription, setCustomDescription] = useState<string>(BUILT_IN_SCRIPTS[0].description);
  const [scriptContent, setScriptContent] = useState<string>(BUILT_IN_SCRIPTS[0].content);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState<boolean>(false);
  const [showSaveAsPanel, setShowSaveAsPanel] = useState<boolean>(false);
  const [newTemplateName, setNewTemplateName] = useState<string>('');
  const [newTemplateDesc, setNewTemplateDesc] = useState<string>('');
  const [templateActionError, setTemplateActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, ServerExecStatus>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'progress'>('editor');
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const allTemplates = [...BUILT_IN_SCRIPTS, ...customTemplates];
  const currentTemplate = allTemplates.find(t => t.id === selectedTemplateId) || BUILT_IN_SCRIPTS[0];
  const isCustom = !currentTemplate.isBuiltIn && !currentTemplate.isBuiltin && !currentTemplate.id.startsWith('builtin-');

  // Fetch available script templates from backend
  const fetchTemplates = async (preferredSelectId?: string) => {
    setIsLoadingTemplates(true);
    try {
      const res = await fetch('/api/scripts');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.templates || data.scripts || []);
        const parsedCustom: ScriptTemplate[] = list
          .filter((t: any) => !t.isBuiltIn && !t.isBuiltin && !t.builtin && !BUILT_IN_SCRIPTS.some(b => b.id === String(t.id)))
          .map((t: any) => ({
            id: String(t.id || t._id || t.name),
            name: String(t.name || 'Untitled Template'),
            description: t.description || '',
            content: typeof t.content === 'string' ? t.content : (Array.isArray(t.lines) ? t.lines.join('\n') : ''),
            isBuiltIn: false,
            isBuiltin: false
          }));
        setCustomTemplates(parsedCustom);

        if (preferredSelectId) {
          const found = parsedCustom.find(t => t.id === preferredSelectId || t.name === preferredSelectId);
          if (found) {
            setSelectedTemplateId(found.id);
            setScriptContent(found.content);
            setCustomDescription(found.description || '');
          }
        }
      } else {
        console.warn('GET /api/scripts returned non-OK status, using built-in presets');
      }
    } catch (err) {
      console.warn('Error fetching /api/scripts, using built-in presets:', err);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Fetch templates on initial mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  // When template selection changes
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const found = allTemplates.find(t => t.id === templateId);
    if (found) {
      setScriptContent(found.content);
      setCustomDescription(found.description || '');
    }
    setTemplateActionError(null);
    setShowSaveAsPanel(false);
  };

  // Save as new custom template
  const handleSaveAsNewTemplate = async () => {
    if (!newTemplateName.trim()) {
      setTemplateActionError('Template name is required.');
      return;
    }

    setIsSavingTemplate(true);
    setTemplateActionError(null);
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          description: newTemplateDesc.trim(),
          content: scriptContent
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save template');
      }

      const createdId = data.template?.id || data.id || data.script?.id || data._id;
      await fetchTemplates(createdId || newTemplateName.trim());
      setShowSaveAsPanel(false);
      setNewTemplateName('');
      setNewTemplateDesc('');
      setSuccessMessage('New template saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setTemplateActionError(err?.message || 'Failed to save template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Save changes to current custom template
  const handleSaveChanges = async () => {
    if (!isCustom || !currentTemplate) return;

    setIsSavingTemplate(true);
    setTemplateActionError(null);
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentTemplate.id,
          name: currentTemplate.name,
          description: customDescription,
          content: scriptContent
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update template');
      }

      await fetchTemplates(currentTemplate.id);
      setSuccessMessage(`Changes saved to "${currentTemplate.name}"!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setGeneralError(err?.message || 'Failed to update template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Delete current custom template
  const handleDeleteTemplate = async () => {
    if (!isCustom || !currentTemplate) return;

    const confirmed = window.confirm(`Are you sure you want to delete template "${currentTemplate.name}"?`);
    if (!confirmed) return;

    setIsSavingTemplate(true);
    try {
      const res = await fetch(`/api/scripts/${encodeURIComponent(currentTemplate.id)}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete template');
      }

      await fetchTemplates();
      setSelectedTemplateId(BUILT_IN_SCRIPTS[0].id);
      setScriptContent(BUILT_IN_SCRIPTS[0].content);
      setCustomDescription(BUILT_IN_SCRIPTS[0].description);
      setSuccessMessage(`Deleted template "${currentTemplate.name}".`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setGeneralError(err?.message || 'Failed to delete template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Upload script file directly into editor
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setScriptContent(text);
        setSuccessMessage(`Loaded "${file.name}" into editor.`);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    };
    reader.onerror = () => {
      setGeneralError(`Failed to read script file "${file.name}".`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Download script as a .rcon file
  const handleDownloadScript = () => {
    try {
      const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (currentTemplate?.name || 'script')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/gi, '_')
        .replace(/_+/g, '_');
      a.href = url;
      a.download = `${safeName}.rcon`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading script:', err);
    }
  };

  // Reset or initialize state when modal opens
  useEffect(() => {
    if (open) {
      fetchTemplates();
      setGeneralError(null);
      setSuccessMessage(null);
      setTemplateActionError(null);
      setShowSaveAsPanel(false);
      setIsExecuting(false);
      const initialStatuses: Record<string, ServerExecStatus> = {};
      serverKeys.forEach(key => {
        initialStatuses[key] = {
          status: 'pending',
          currentLine: 0,
          totalLines: scriptContent.split('\n').length
        };
      });
      setStatuses(initialStatuses);
      setActiveTab('editor');
    } else {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [open, serverKeys]);

  // Clean up poll on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  // Poll status for running scripts
  const pollStatus = async (keysToPoll: string[]) => {
    let allFinished = true;
    const newStatuses = { ...statuses };

    for (const key of keysToPoll) {
      try {
        const res = await fetch(`/api/script-status/${encodeURIComponent(key)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.status) {
            const exec = data.status;
            newStatuses[key] = {
              status: exec.status,
              currentLine: exec.currentLine,
              totalLines: exec.lines ? exec.lines.length : 1,
              error: exec.error
            };
            if (exec.status === 'running' || exec.status === 'pending') {
              allFinished = false;
            }
          }
        }
      } catch (err) {
        console.error(`Error polling script status for ${key}:`, err);
      }
    }

    setStatuses(newStatuses);

    if (!allFinished) {
      pollTimerRef.current = setTimeout(() => {
        pollStatus(keysToPoll);
      }, 1000);
    } else {
      setIsExecuting(false);
    }
  };

  // Execute script across all serverKeys
  const handleExecute = async () => {
    if (serverKeys.length === 0) {
      setGeneralError('No servers selected for script execution.');
      return;
    }

    const lines = scriptContent.split('\n');
    setIsExecuting(true);
    setGeneralError(null);
    setActiveTab('progress');

    const initialStatuses: Record<string, ServerExecStatus> = {};
    serverKeys.forEach(k => {
      initialStatuses[k] = { status: 'running', currentLine: 0, totalLines: lines.length };
    });
    setStatuses(initialStatuses);

    // Call /api/execute-script for each server in parallel
    const failedKeys: string[] = [];
    await Promise.all(serverKeys.map(async (key) => {
      try {
        const res = await fetch('/api/execute-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, script: scriptContent }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          failedKeys.push(key);
          setStatuses(prev => ({
            ...prev,
            [key]: {
              status: 'error',
              currentLine: 0,
              totalLines: lines.length,
              error: data.error || 'Failed to start execution'
            }
          }));
        }
      } catch (err: any) {
        failedKeys.push(key);
        setStatuses(prev => ({
          ...prev,
          [key]: {
            status: 'error',
            currentLine: 0,
            totalLines: lines.length,
            error: err?.message || String(err)
          }
        }));
      }
    }));

    const activeKeys = serverKeys.filter(k => !failedKeys.includes(k));
    if (activeKeys.length > 0) {
      pollTimerRef.current = setTimeout(() => {
        pollStatus(activeKeys);
      }, 500);
    } else {
      setIsExecuting(false);
    }
  };

  // Cancel script on all servers
  const handleCancel = async () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    await Promise.all(serverKeys.map(async (key) => {
      try {
        await fetch('/api/cancel-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
      } catch (err) {
        console.error(`Failed to cancel script on ${key}:`, err);
      }
    }));

    setStatuses(prev => {
      const updated = { ...prev };
      for (const k of serverKeys) {
        if (updated[k] && (updated[k].status === 'running' || updated[k].status === 'pending')) {
          updated[k] = { ...updated[k], status: 'cancelled' };
        }
      }
      return updated;
    });

    setIsExecuting(false);
  };

  const getProfileName = (key: string) => {
    const prof = serverProfiles.find(p => `${p.host}:${p.port}` === key);
    return prof ? `${prof.name} (${key})` : key;
  };

  const getStatusBadge = (status: ServerExecStatus['status']) => {
    switch (status) {
      case 'completed':
        return <span style={{ background: '#2e7d32', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>Completed</span>;
      case 'running':
        return <span style={{ background: '#0288d1', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>Running</span>;
      case 'cancelled':
        return <span style={{ background: '#ed6c02', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>Cancelled</span>;
      case 'error':
        return <span style={{ background: '#d32f2f', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>Error</span>;
      default:
        return <span style={{ background: '#757575', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>Pending</span>;
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.65)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExecuting) onClose();
      }}
    >
      <div
        style={{
          background: '#23272e',
          color: '#eee',
          padding: 24,
          borderRadius: 8,
          width: '90vw',
          maxWidth: 720,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          border: '1px solid #444',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: '#fff' }}>Execute RCON Script</h2>
            <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>
              Targeting {serverKeys.length} {serverKeys.length === 1 ? 'server' : 'servers'}:{' '}
              <span style={{ color: '#61afef' }}>
                {serverKeys.map(k => getProfileName(k)).join(', ')}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExecuting}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: 24,
              cursor: isExecuting ? 'not-allowed' : 'pointer',
              lineHeight: 1,
            }}
            title="Close"
          >
            &times;
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #333', paddingBottom: 8 }}>
          <button
            onClick={() => setActiveTab('editor')}
            style={{
              background: activeTab === 'editor' ? '#3a3f4b' : 'transparent',
              color: activeTab === 'editor' ? '#fff' : '#aaa',
              border: 'none',
              borderRadius: 4,
              padding: '6px 14px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Script Editor
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            style={{
              background: activeTab === 'progress' ? '#3a3f4b' : 'transparent',
              color: activeTab === 'progress' ? '#fff' : '#aaa',
              border: 'none',
              borderRadius: 4,
              padding: '6px 14px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            Execution Progress
            {isExecuting && (
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#61afef', animation: 'pulse 1.5s infinite' }} />
            )}
          </button>
        </div>

        {/* General Error Message */}
        {generalError && (
          <div style={{ background: '#4a1515', color: '#ffc8c8', padding: '8px 12px', borderRadius: 4, border: '1px solid #a00', fontSize: 13 }}>
            {generalError}
          </div>
        )}

        {/* Tab 1: Editor */}
        {activeTab === 'editor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Template Selection & Info */}
            <div style={{ background: '#1c2027', padding: 14, borderRadius: 6, border: '1px solid #333' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>
                    Select Script Template:
                  </label>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: isCustom ? '#7c3aed' : '#2563eb',
                      color: '#ffffff',
                    }}
                  >
                    {isCustom ? 'Custom' : 'Built-in'}
                  </span>
                </div>
                {isLoadingTemplates && (
                  <span style={{ fontSize: 12, color: '#888' }}>Refreshing templates...</span>
                )}
              </div>

              <select
                value={selectedTemplateId}
                onChange={e => handleSelectTemplate(e.target.value)}
                disabled={isExecuting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 4,
                  border: '1px solid #444',
                  background: '#181a20',
                  color: '#eee',
                  fontSize: 14,
                }}
              >
                <optgroup label="Built-in Presets">
                  {BUILT_IN_SCRIPTS.map(script => (
                    <option key={script.id} value={script.id}>
                      {script.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Custom Templates">
                  {customTemplates.length === 0 ? (
                    <option disabled value="">(No custom templates saved)</option>
                  ) : (
                    customTemplates.map(script => (
                      <option key={script.id} value={script.id}>
                        {script.name}
                      </option>
                    ))
                  )}
                </optgroup>
              </select>

              {/* Template Description */}
              {isCustom ? (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 2 }}>
                    Template Description:
                  </label>
                  <input
                    type="text"
                    value={customDescription}
                    onChange={e => setCustomDescription(e.target.value)}
                    placeholder="Enter or edit template description..."
                    disabled={isExecuting}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 4,
                      border: '1px solid #444',
                      background: '#181a20',
                      color: '#eee',
                      fontSize: 12,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
                  {currentTemplate.description}
                </div>
              )}

              {/* Template Management & File Toolbar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 12, borderTop: '1px solid #2a2e39', paddingTop: 10 }}>
                {/* Left: Template Actions */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSaveAsPanel(!showSaveAsPanel);
                      setTemplateActionError(null);
                    }}
                    disabled={isExecuting}
                    style={{
                      background: showSaveAsPanel ? '#1e3a8a' : '#2a2e39',
                      border: '1px solid #3b82f6',
                      color: '#93c5fd',
                      padding: '6px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: isExecuting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title="Save current editor content as a new template"
                  >
                    + Save as New Template
                  </button>

                  {isCustom && (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveChanges}
                        disabled={isExecuting || isSavingTemplate}
                        style={{
                          background: '#2da44e',
                          border: '1px solid #3fb950',
                          color: '#fff',
                          padding: '6px 10px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: (isExecuting || isSavingTemplate) ? 'not-allowed' : 'pointer',
                          opacity: (isExecuting || isSavingTemplate) ? 0.7 : 1,
                        }}
                        title="Update current custom template's content and description"
                      >
                        {isSavingTemplate ? 'Saving...' : 'Save Changes'}
                      </button>

                      <button
                        type="button"
                        onClick={handleDeleteTemplate}
                        disabled={isExecuting || isSavingTemplate}
                        style={{
                          background: '#3a1f24',
                          border: '1px solid #d32f2f',
                          color: '#f87171',
                          padding: '6px 10px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: (isExecuting || isSavingTemplate) ? 'not-allowed' : 'pointer',
                          opacity: (isExecuting || isSavingTemplate) ? 0.7 : 1,
                        }}
                        title="Delete this custom template"
                      >
                        Delete Template
                      </button>
                    </>
                  )}
                </div>

                {/* Right: File Upload/Download */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".rcon,.txt"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExecuting}
                    style={{
                      background: '#2a2e39',
                      border: '1px solid #4b5563',
                      color: '#e5e7eb',
                      padding: '6px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: isExecuting ? 'not-allowed' : 'pointer',
                    }}
                    title="Upload script from .rcon or .txt file into editor"
                  >
                    Upload Script
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadScript}
                    disabled={isExecuting || !scriptContent}
                    style={{
                      background: '#2a2e39',
                      border: '1px solid #4b5563',
                      color: '#e5e7eb',
                      padding: '6px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: (isExecuting || !scriptContent) ? 'not-allowed' : 'pointer',
                      opacity: (!scriptContent) ? 0.6 : 1,
                    }}
                    title="Download current script content as a .rcon file"
                  >
                    Download Script
                  </button>
                </div>
              </div>

              {/* Collapsible Save as New Template Form */}
              {showSaveAsPanel && (
                <div
                  style={{
                    background: '#181a20',
                    border: '1px solid #3b82f6',
                    borderRadius: 6,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd' }}>
                      Save as New Template
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSaveAsPanel(false);
                        setTemplateActionError(null);
                      }}
                      style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}
                    >
                      &times;
                    </button>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                      Template Name <span style={{ color: '#f87171' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={e => setNewTemplateName(e.target.value)}
                      placeholder="e.g., Weekly Server Wipe & Update"
                      disabled={isSavingTemplate}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 4,
                        border: '1px solid #444',
                        background: '#23272e',
                        color: '#eee',
                        fontSize: 13,
                        boxSizing: 'border-box'
                      }}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={newTemplateDesc}
                      onChange={e => setNewTemplateDesc(e.target.value)}
                      placeholder="Brief summary of commands executed..."
                      disabled={isSavingTemplate}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 4,
                        border: '1px solid #444',
                        background: '#23272e',
                        color: '#eee',
                        fontSize: 13,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {templateActionError && (
                    <div style={{ color: '#f87171', fontSize: 12 }}>{templateActionError}</div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSaveAsPanel(false);
                        setTemplateActionError(null);
                      }}
                      disabled={isSavingTemplate}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 4,
                        border: '1px solid #444',
                        background: '#2c313a',
                        color: '#ccc',
                        fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAsNewTemplate}
                      disabled={isSavingTemplate || !newTemplateName.trim()}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 4,
                        border: 'none',
                        background: '#3b82f6',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: (isSavingTemplate || !newTemplateName.trim()) ? 'not-allowed' : 'pointer',
                        opacity: (isSavingTemplate || !newTemplateName.trim()) ? 0.6 : 1
                      }}
                    >
                      {isSavingTemplate ? 'Saving...' : 'Save Template'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Success Banner */}
            {successMessage && (
              <div style={{ background: '#133e24', color: '#86efac', padding: '8px 12px', borderRadius: 4, border: '1px solid #22c55e', fontSize: 13 }}>
                {successMessage}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>
                  Script Commands:
                </label>
                <span style={{ fontSize: 11, color: '#777' }}>
                  Supported commands: standard RCON, <code>wait &lt;ms&gt;</code>, <code>update-base-install &lt;id&gt;</code>
                </span>
              </div>
              <textarea
                value={scriptContent}
                onChange={e => setScriptContent(e.target.value)}
                disabled={isExecuting}
                rows={10}
                style={{
                  width: '100%',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: 13,
                  lineHeight: 1.5,
                  padding: 10,
                  borderRadius: 4,
                  border: '1px solid #444',
                  background: '#181a20',
                  color: '#98c379',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Execution Progress */}
        {activeTab === 'progress' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: '#aaa' }}>
              Real-time progress for all targeted servers:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {serverKeys.map(key => {
                const s = statuses[key] || { status: 'pending', currentLine: 0, totalLines: 1 };
                const pct = s.totalLines > 0 ? Math.min(100, Math.round((s.currentLine / s.totalLines) * 100)) : 0;
                return (
                  <div
                    key={key}
                    style={{
                      background: '#1e2227',
                      border: '1px solid #333',
                      borderRadius: 6,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{getProfileName(key)}</span>
                      {getStatusBadge(s.status)}
                    </div>
                    {/* Progress Bar */}
                    <div style={{ background: '#111', borderRadius: 4, height: 8, overflow: 'hidden', width: '100%' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${s.status === 'completed' ? 100 : pct}%`,
                          background: s.status === 'error' ? '#d32f2f' : s.status === 'completed' ? '#2e7d32' : '#61afef',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888' }}>
                      <span>
                        Line {Math.min(s.currentLine + 1, s.totalLines)} of {s.totalLines}
                      </span>
                      <span>{s.status === 'completed' ? '100%' : `${pct}%`}</span>
                    </div>
                    {s.error && (
                      <div style={{ color: '#f66', fontSize: 12, background: '#300', padding: '4px 8px', borderRadius: 4 }}>
                        {s.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, borderTop: '1px solid #333', paddingTop: 14 }}>
          <button
            onClick={onClose}
            disabled={isExecuting}
            style={{
              padding: '8px 16px',
              borderRadius: 4,
              border: '1px solid #555',
              background: '#2c313a',
              color: '#eee',
              cursor: isExecuting ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Close
          </button>
          {isExecuting ? (
            <button
              onClick={handleCancel}
              style={{
                padding: '8px 18px',
                borderRadius: 4,
                border: 'none',
                background: '#d32f2f',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Cancel Script
            </button>
          ) : (
            <button
              onClick={handleExecute}
              style={{
                padding: '8px 18px',
                borderRadius: 4,
                border: 'none',
                background: '#2da44e',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Execute on {serverKeys.length} {serverKeys.length === 1 ? 'Server' : 'Servers'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScriptExecutionModal;
