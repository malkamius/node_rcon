// Manages terminal state and history for each RCON tab
export interface TerminalLine {
  text: string;
  timestamp: number;
  guid?: string;
  type?: 'command' | 'output';
}

export interface TerminalSession {
  key: string;
  lines: TerminalLine[];
}

export class RconTerminalManager {
  /**
   * Appends a full TerminalLine object to the session.
   * @param key Session key
   * @param line TerminalLine object
   */
  appendLineObject(key: string, line: TerminalLine) {
    const session = this.getSession(key);
    session.lines.push({ ...line });
    if (session.lines.length > this.maxLines) {
      session.lines = session.lines.slice(-this.maxLines);
    }
  }
  private sessions: Map<string, TerminalSession> = new Map();
  private maxLines: number;
  private wsRef: React.MutableRefObject<WebSocket | null>;

  constructor(maxLines: number = 100, wsRef: React.MutableRefObject<WebSocket | null>) {
    this.maxLines = maxLines;
    this.wsRef = wsRef;
  }

  async restoreSessionLines(key: string) {
    // Use persistent WebSocket connection to get session lines
    return new Promise<void>((resolve) => {
      const ws = this.wsRef.current;
      if (!ws || ws.readyState !== 1) return resolve();
      this.wsRequest(ws, { type: 'getSessionLines', key }, (data : any) => {
        if (Array.isArray(data.lines)) {
          const session = this.getSession(key);
          session.lines = data.lines;
        }
        resolve();
      });
    });
  }
  
  getSession(key: string): TerminalSession {
    if (!this.sessions.has(key)) {
      this.sessions.set(key, { key, lines: [] });
      // Try to restore from backend
      this.restoreSessionLines(key);
    }
    return this.sessions.get(key)!;
  }

  

  /**
   * Appends a line to the session. If a guid and type are provided, output lines are inserted after the matching command.
   * @param key Session key
   * @param line Text
   * @param timestamp Timestamp
   * @param store Whether to send to backend
   * @param guid Optional GUID for command/output association
   * @param type 'command' | 'output'
   */
  appendLine(
    key: string,
    line: string,
    timestamp?: number,
    store: boolean = true,
    guid?: string,
    type?: 'command' | 'output' | 'sessionLine'
  ) {
    const session = this.getSession(key);
    const entry: TerminalLine = { text: line, timestamp: timestamp ?? Date.now() };
    if (guid) entry.guid = guid;
    if (type === 'command' || type === 'output') entry.type = type;
    session.lines.push(entry);
    if (session.lines.length > this.maxLines) {
      session.lines = session.lines.slice(-this.maxLines);
    }
    // // Send to backend
    // if (store) {
    //   fetch(`/api/session-lines/${encodeURIComponent(key)}`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ line: entry })
    //   }).catch(() => {});
    // }
  }

  wsRequest(ws: WebSocket | null, payload: any, cb: (data: any) => void, timeout = 8000) {
  if (!ws || ws.readyState !== 1) {
    cb({ error: 'WebSocket not connected' });
    return;
  }
  const requestId = 'req' + Math.random().toString(36).slice(2);
  payload.requestId = requestId;
  const handleMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.requestId === requestId) {
        ws.removeEventListener('message', handleMessage);
        cb(msg);
      }
    } catch {}
  };
  ws.addEventListener('message', handleMessage);
  ws.send(JSON.stringify(payload));
  // setTimeout(() => {
  //   ws.removeEventListener('message', handleMessage);
  //   cb({ error: 'WebSocket request timeout' });
  // }, timeout);
}
  clear(key: string, ws: WebSocket | null) {
    if (this.sessions.has(key)) {
      this.sessions.get(key)!.lines = [];
    }
    // Clear on backend via WebSocket
    if (ws && ws.readyState === 1) {
      this.wsRequest(ws, { type: 'clearSessionLines', key }, () => {});
    }
  }
// --- WebSocket request/response utility (copy from ServerManagerPage) ---
   
}
