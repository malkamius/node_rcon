import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface ServerLogFileInfo {
  name: string;
  size: number;
  mtime: number;
  isCurrent: boolean;
  isCrash: boolean;
}

export interface ServerLogsModalProps {
  open: boolean;
  onClose: () => void;
  serverKey: string | null;
  serverProfiles: { name: string; host: string; port: number; directory?: string }[];
  statusMap?: Record<string, any>;
}

export const ServerLogsModal: React.FC<ServerLogsModalProps> = ({
  open,
  onClose,
  serverKey,
  serverProfiles,
  statusMap = {}
}) => {
  const [logFiles, setLogFiles] = useState<ServerLogFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('ShooterGame.log');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [totalLines, setTotalLines] = useState<number>(0);
  const [lineCount, setLineCount] = useState<number>(200);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [autoTail, setAutoTail] = useState<boolean>(true);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [fileMtime, setFileMtime] = useState<number | null>(null);

  const logConsoleRef = useRef<HTMLDivElement>(null);
  const tailIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const activeProfile = serverKey
    ? serverProfiles.find(p => `${p.host}:${p.port}` === serverKey)
    : null;
  const procStatus = serverKey ? statusMap[serverKey] : null;

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Fetch available log files
  const fetchLogFiles = useCallback(async () => {
    if (!serverKey || !open) return;
    try {
      setError(null);
      const res = await fetch(`/api/server-logs/${encodeURIComponent(serverKey)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to list log files');
      }
      const files: ServerLogFileInfo[] = data.files || [];
      setLogFiles(files);

      // Default to ShooterGame.log if present, otherwise first available
      if (files.length > 0) {
        setSelectedFile(prev => {
          const exists = files.some(f => f.name === prev);
          if (exists) return prev;
          const current = files.find(f => f.isCurrent);
          return current ? current.name : files[0].name;
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching server log list');
    }
  }, [serverKey, open]);

  // Fetch log lines for selected file
  const fetchLogContent = useCallback(async (isBackground = false) => {
    if (!serverKey || !open || !selectedFile) return;
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    try {
      const params = new URLSearchParams({
        file: selectedFile,
        lines: String(lineCount),
      });
      if (searchFilter.trim()) {
        params.append('filter', searchFilter.trim());
      }

      const res = await fetch(`/api/server-logs/${encodeURIComponent(serverKey)}/tail?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch log lines');
      }

      setLogLines(data.lines || []);
      setTotalLines(data.totalLines || 0);
      setFileSize(data.size || 0);
      setFileMtime(data.mtime || null);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Error reading log file content');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverKey, open, selectedFile, lineCount, searchFilter]);

  // Auto-scroll to bottom when lines update
  useEffect(() => {
    if (autoScroll && logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [logLines, autoScroll]);

  // Initial load on modal open
  useEffect(() => {
    if (open) {
      fetchLogFiles();
    } else {
      setLogFiles([]);
      setLogLines([]);
      setError(null);
    }
  }, [open, fetchLogFiles]);

  // Refetch content when file, lineCount, or searchFilter changes
  useEffect(() => {
    if (open && selectedFile) {
      fetchLogContent(false);
    }
  }, [open, selectedFile, lineCount, searchFilter, fetchLogContent]);

  // Setup auto-tail timer
  useEffect(() => {
    if (tailIntervalRef.current) {
      clearInterval(tailIntervalRef.current);
      tailIntervalRef.current = null;
    }

    if (open && autoTail && selectedFile) {
      tailIntervalRef.current = setInterval(() => {
        fetchLogContent(true);
      }, 4000);
    }

    return () => {
      if (tailIntervalRef.current) {
        clearInterval(tailIntervalRef.current);
      }
    };
  }, [open, autoTail, selectedFile, fetchLogContent]);

  if (!open) return null;

  // Colorize log lines
  const getLineStyle = (line: string): React.CSSProperties => {
    const lower = line.toLowerCase();
    if (lower.includes('crash') || lower.includes('fatal') || lower.includes('assert') || lower.includes('[error]')) {
      return { color: '#ff6b6b', fontWeight: 600 };
    }
    if (lower.includes('warning') || lower.includes('[warn]')) {
      return { color: '#e5c07b' };
    }
    if (lower.includes('login') || lower.includes('joined') || lower.includes('connected')) {
      return { color: '#98c379' };
    }
    if (lower.includes('save') || lower.includes('world save')) {
      return { color: '#61afef' };
    }
    return { color: '#abb2bf' };
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1e2227',
          color: '#abb2bf',
          width: '95vw',
          maxWidth: 1100,
          height: '88vh',
          borderRadius: 8,
          boxShadow: '0 12px 36px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #3e4451',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 18px',
            background: '#21252b',
            borderBottom: '1px solid #333842',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#eee' }}>
              📜 Server Engine & Crash Logs
            </span>
            {activeProfile && (
              <span style={{ background: '#282c34', padding: '3px 8px', borderRadius: 4, fontSize: 12, color: '#61afef', border: '1px solid #3e4451' }}>
                {activeProfile.name} ({serverKey})
              </span>
            )}
            {procStatus?.crashed && (
              <span style={{ background: '#e06c7522', color: '#e06c75', border: '1px solid #e06c75', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                ⚠️ CRASH DETECTED {procStatus.exitCode !== null ? `(Code: ${procStatus.exitCode})` : ''}
              </span>
            )}
            {refreshing && (
              <span style={{ fontSize: 11, color: '#98c379', fontStyle: 'italic' }}>
                ● Updating live...
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href={serverKey ? `/api/server-logs/${encodeURIComponent(serverKey)}/download?file=${encodeURIComponent(selectedFile)}` : '#'}
              download={selectedFile}
              style={{
                background: '#3a3f4b',
                color: '#fff',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid #4b5263',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              title="Download entire log file to your local computer"
            >
              ⬇ Download Log
            </a>
            <button
              onClick={() => {
                fetchLogFiles();
                fetchLogContent(false);
              }}
              style={{
                background: '#2c313a',
                color: '#abb2bf',
                border: '1px solid #3e4451',
                padding: '6px 12px',
                borderRadius: 4,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              🔄 Refresh
            </button>
            <button
              onClick={onClose}
              style={{
                background: '#cf222e',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Controls Bar */}
        <div
          style={{
            padding: '10px 18px',
            background: '#1b1d23',
            borderBottom: '1px solid #2c313a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: 13,
          }}
        >
          {/* File selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: '#d19a66' }}>Log File:</span>
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              style={{
                background: '#282c34',
                color: '#eee',
                border: '1px solid #3e4451',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 12,
                maxWidth: 320,
              }}
            >
              {logFiles.map(f => (
                <option key={f.name} value={f.name}>
                  {f.isCurrent ? `★ ${f.name} (Active)` : f.isCrash ? `⚠️ ${f.name} (Crash)` : f.name} — {formatSize(f.size)}
                </option>
              ))}
              {logFiles.length === 0 && (
                <option value="ShooterGame.log">ShooterGame.log (No files detected)</option>
              )}
            </select>

            {fileMtime && (
              <span style={{ fontSize: 11, color: '#7f848e' }}>
                Modified: {new Date(fileMtime).toLocaleDateString()} {new Date(fileMtime).toLocaleTimeString()} · {formatSize(fileSize)}
              </span>
            )}
          </div>

          {/* Filters & Tailing */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Search Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Search:</span>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter lines..."
                style={{
                  background: '#282c34',
                  color: '#fff',
                  border: '1px solid #3e4451',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 12,
                  width: 160,
                }}
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  style={{ background: 'transparent', border: 'none', color: '#e06c75', cursor: 'pointer', padding: 0 }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Line Count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Lines:</span>
              <select
                value={lineCount}
                onChange={(e) => setLineCount(parseInt(e.target.value, 10))}
                style={{
                  background: '#282c34',
                  color: '#eee',
                  border: '1px solid #3e4451',
                  borderRadius: 4,
                  padding: '4px 6px',
                  fontSize: 12,
                }}
              >
                <option value={100}>Last 100</option>
                <option value={200}>Last 200</option>
                <option value={500}>Last 500</option>
                <option value={1000}>Last 1000</option>
                <option value={2000}>Last 2000</option>
              </select>
            </div>

            {/* Auto Tail Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={autoTail}
                onChange={(e) => setAutoTail(e.target.checked)}
                style={{ accentColor: '#98c379', cursor: 'pointer' }}
              />
              <span>Live Tail</span>
            </label>

            {/* Auto Scroll Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                style={{ accentColor: '#61afef', cursor: 'pointer' }}
              />
              <span>Auto-Scroll</span>
            </label>
          </div>
        </div>

        {/* Error notice if present */}
        {error && (
          <div style={{ background: '#e06c7522', color: '#e06c75', borderBottom: '1px solid #e06c7544', padding: '8px 16px', fontSize: 12 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Log Viewer Monospace Window */}
        <div
          ref={logConsoleRef}
          style={{
            flex: 1,
            background: '#14161a',
            color: '#abb2bf',
            fontFamily: 'Consolas, "Fira Code", Monaco, Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.45,
            padding: 12,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {loading ? (
            <div style={{ color: '#61afef', padding: 20, textAlign: 'center' }}>
              Loading log lines from disk...
            </div>
          ) : logLines.length === 0 ? (
            <div style={{ color: '#5c6370', padding: 20, textAlign: 'center', fontStyle: 'italic' }}>
              {searchFilter
                ? `No lines match the search filter "${searchFilter}" in ${selectedFile}.`
                : `Log file ${selectedFile} is empty or contains no lines.`}
            </div>
          ) : (
            logLines.map((line, idx) => (
              <div key={idx} style={{ ...getLineStyle(line), display: 'flex' }}>
                <span
                  style={{
                    color: '#4b5263',
                    minWidth: 44,
                    userSelect: 'none',
                    textAlign: 'right',
                    marginRight: 12,
                    fontSize: 11,
                  }}
                >
                  {totalLines > logLines.length ? totalLines - logLines.length + idx + 1 : idx + 1}
                </span>
                <span style={{ flex: 1 }}>{line}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 18px',
            background: '#21252b',
            borderTop: '1px solid #333842',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#5c6370',
          }}
        >
          <div>
            Showing {logLines.length} {searchFilter ? 'matching lines' : 'tail lines'} (Total in file: {totalLines})
          </div>
          <div>
            {activeProfile?.directory ? `Location: ${activeProfile.directory}\\ShooterGame\\Saved\\Logs` : ''}
          </div>
        </div>
      </div>
    </div>
  );
};
