
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
  // Track the last session key for full rewrite detection
  const lastSessionKey = useRef<string | null>(null);
  const newTerminal = useRef<boolean>(true);
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
      newTerminal.current = true;
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
  }, []);  
  
  // Write session lines to terminal when session, activeTab, or sessionVersion changes
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    // If loading, show loading message and reset session tracking
    if (loading) {
      term.clear();
      term.reset();
      term.write('Loading history...');
      lastSessionKey.current = session?.key || null;
      fitAddonRef.current?.fit();
      return;
    }
    
    const sessionKey = session?.key || null;
    const isNewSession = lastSessionKey.current !== sessionKey;
    // Use the new consumeUnwrittenLines API for efficient updates
    let linesToWrite: TerminalLine[] = [];
    let fullRewrite = false;
    if (session && newTerminal.current) {
      session.needsFullRewrite = true;
      newTerminal.current = false;
    }
    if (session && typeof (session as any).consumeUnwrittenLines === 'function') {
      // If session is a RconTerminalManager session object, use the method
      const result = (session as any).consumeUnwrittenLines(sessionKey);
      linesToWrite = result.lines;
      fullRewrite = result.fullRewrite;
    } else if (session && Array.isArray(session.lines)) {
      // Fallback: just write all lines
      linesToWrite = session.lines;
      fullRewrite = true;
    }
    
    // Format lines for display
    const formattedLines = linesToWrite.map((line: TerminalLine) => {
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
    });

    if (fullRewrite) {
      term.clear();
      term.reset();
      if (formattedLines.length > 0) {
        term.write(formattedLines.join('\r\n') + '\r\n');
      }
      lastSessionKey.current = sessionKey;
      fitAddonRef.current?.fit();
      return;
    }

    // Write only new lines
    if (formattedLines.length > 0) {
      const toWrite = formattedLines.join('\r\n').replace(/\x1b\[2J/g, '');
      if (toWrite.length > 0) {
        term.write(toWrite + '\r\n');
      }
    }
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
