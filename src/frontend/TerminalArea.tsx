
import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { TerminalSession, TerminalLine } from './rconTerminalManager';

interface TerminalAreaProps {
  activeTab: string | null;
  status?: { status: string; since: number };
  session: TerminalSession | null;
  sessionVersion?: number;
  showTimestamps?: boolean;
  loading?: boolean;
}

export const TerminalArea: React.FC<TerminalAreaProps> = ({ activeTab, status, session, sessionVersion, showTimestamps = true, loading }) => {
  const xtermContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Track how many lines have been written to the terminal for the current session
  const writtenLineCount = useRef<number>(0);
  const lastSessionKey = useRef<string | null>(null);

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!xtermContainerRef.current) return;
    if (!termRef.current) {
      const term = new Terminal({
        fontFamily: 'monospace',
        fontSize: 15,
        theme: {
          background: '#181c20',
          foreground: '#eee',
        },
        cursorBlink: true,
        disableStdin: true, // input handled by input box
        scrollback: 2000,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(xtermContainerRef.current);
      fitAddon.fit();
      termRef.current = term;
      fitAddonRef.current = fitAddon;
    }
    // Fit on resize
    const handleResize = () => {
      fitAddonRef.current?.fit();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);  // Write session lines to terminal when session, activeTab, or sessionVersion changes
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    // If loading, show loading message and reset writtenLineCount
    if (loading) {
      term.clear();
      term.reset();
      term.write('Loading history...');
      writtenLineCount.current = 0;
      lastSessionKey.current = session?.key || null;
      fitAddonRef.current?.fit();
      return;
    }

    // If session or tab changed, or sessionVersion changed, do a full clear and write all lines
    const sessionKey = session?.key || null;
    const lines = session && session.lines ? session.lines : [];
    const isNewSession = lastSessionKey.current !== sessionKey;
    const isCleared = writtenLineCount.current > lines.length;

    // If "Loading history..." is present, clear it before writing new lines
    // (xterm.js does not provide a way to read terminal contents, so we use writtenLineCount as a proxy)
    if ((isNewSession || isCleared || writtenLineCount.current === 0) && !loading) {
      term.clear();
      term.reset();
      writtenLineCount.current = 0;
    }

    // Write only new lines
    if (lines.length > writtenLineCount.current) {
      const newLines = lines.slice(writtenLineCount.current);
      const formatted = newLines.map((line: TerminalLine) => {
        if (showTimestamps && line.timestamp) {
          const date = new Date(line.timestamp);
          // Format: DD/MM HH:MM:SS
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const time = date.toLocaleTimeString([], { hour12: false });
          return `[${day}/${month} ${time}] ${line.text}`;
        } else {
          return line.text;
        }
      }).join('\r\n').replace(/\x1b\[2J/g, '');
      if (formatted) {
        term.write(formatted + '\r\n');
      }
      writtenLineCount.current = lines.length;
    }

    lastSessionKey.current = sessionKey;
    fitAddonRef.current?.fit();
  }, [session, activeTab, sessionVersion, showTimestamps, loading]);

  return (
    <div style={{ flex: 1, background: '#181c20', position: 'relative', overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div ref={xtermContainerRef} style={{ width: '100%', height: '100%' }} />
      {!activeTab && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Select a server tab to start a session.
        </div>
      )}
      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', background: 'rgba(24,28,32,0.85)', zIndex: 10 }}>
          Loading history...
        </div>
      )}
      {activeTab && status && typeof status.status === 'string' ? (
        <div style={{ position: 'absolute', top: 8, right: 16, color: status.status === 'connected' ? '#6f6' : status.status === 'connecting' ? '#ff6' : '#f66', fontWeight: 'bold' }}>
          {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
        </div>
      ) : activeTab && status && (
        <div style={{ position: 'absolute', top: 8, right: 16, color: '#f66', fontWeight: 'bold' }}>
          Status unavailable
        </div>
      )}
    </div>
  );
};
