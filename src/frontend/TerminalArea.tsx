
import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { TerminalSession } from './rconTerminalManager';

interface TerminalAreaProps {
  activeTab: string | null;
  status?: { status: string; since: number };
  session: TerminalSession | null;
  sessionVersion?: number;
}

export const TerminalArea: React.FC<TerminalAreaProps> = ({ activeTab, status, session, sessionVersion }) => {
  const xtermContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastWrittenContent = useRef<string>('');

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
    
    // Determine what content should be displayed
    let newContent = '';
    if (session && session.lines.length > 0) {
      newContent = session.lines.join('\r\n').replace(/\x1b\[2J/g, '');
    } else if (activeTab) {
      newContent = 'No output yet.';
    }
    
    // Only update if content has changed
    if (newContent !== lastWrittenContent.current) {
      term.clear();
      term.reset();
      if (newContent) {
        term.write(newContent);
      }
      lastWrittenContent.current = newContent;
    }
    
    fitAddonRef.current?.fit();
  }, [session, activeTab, sessionVersion]);

  return (
    <div style={{ flex: 1, background: '#181c20', position: 'relative', overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div ref={xtermContainerRef} style={{ width: '100%', height: '100%' }} />
      {!activeTab && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Select a server tab to start a session.
        </div>
      )}
      {activeTab && status && (
        <div style={{ position: 'absolute', top: 8, right: 16, color: status.status === 'connected' ? '#6f6' : status.status === 'connecting' ? '#ff6' : '#f66', fontWeight: 'bold' }}>
          {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
        </div>
      )}
    </div>
  );
};
