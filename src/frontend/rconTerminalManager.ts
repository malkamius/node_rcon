// Helper type for unwritten lines result
export type UnwrittenLinesResult = { lines: TerminalLine[]; fullRewrite: boolean };

// --- class RconTerminalManager below ---
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
  unwrittenLines: TerminalLine[];
  needsFullRewrite: boolean;
  consumeUnwrittenLines(key: string): UnwrittenLinesResult
}

export class RconTerminalManager {
  /**
   * Appends a full TerminalLine object to the session.
   * @param key Session key
   * @param line TerminalLine object
   */
  appendLineObject(key: string, line: TerminalLine) {
    const session = this.getSession(key);
    const entry = { ...line };
    session.lines.push(entry);
    session.unwrittenLines.push(entry);
    if (session.lines.length > this.maxLines) {
      session.lines = session.lines.slice(-this.maxLines);
    }
    if (session.unwrittenLines.length > this.maxLines) {
      session.unwrittenLines = session.unwrittenLines.slice(-this.maxLines);
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
          session.unwrittenLines = [];
          session.needsFullRewrite = true;
        }
        resolve();
      });
    });
  }
  
  getSession(key: string): TerminalSession {
    if (!this.sessions.has(key)) {
      this.sessions.set(key, { key, lines: [], unwrittenLines: [], needsFullRewrite: false, consumeUnwrittenLines: this.consumeUnwrittenLines.bind(this) });
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
    session.unwrittenLines.push(entry);
    if (session.lines.length > this.maxLines) {
      session.lines = session.lines.slice(-this.maxLines);
    }
    if (session.unwrittenLines.length > this.maxLines) {
      session.unwrittenLines = session.unwrittenLines.slice(-this.maxLines);
    }
  }

  /**
   * Returns and clears unwritten lines and rewrite flag for a session.
   * If needsFullRewrite is true, returns all lines and resets the flag.
   */
  consumeUnwrittenLines(key: string): UnwrittenLinesResult {
    const session = this.getSession(key);
    let lines: TerminalLine[];
    let fullRewrite = false;
    if (session.needsFullRewrite) {
      lines = [...session.lines];
      fullRewrite = true;
      session.needsFullRewrite = false;
      session.unwrittenLines = [];
    } else {
      lines = [...session.unwrittenLines];
      session.unwrittenLines = [];
    }
    return { lines, fullRewrite };
  }

  wsRequest(ws: WebSocket | null, payload: any, cb: (data: any) => void, timeout = 8000) {
    if (!ws || ws.readyState !== 1) {
      cb({ error: 'WebSocket not connected' });
      return;
    }
    const requestId = 'req' + Math.random().toString(36).slice(2);
    payload.requestId = requestId;

    let timer = setTimeout(() => {
      ws.removeEventListener('message', handleMessage);
      cb({ error: 'WebSocket request timeout' });
    }, timeout);

    const handleMessage = (event: MessageEvent) => {
      try {
        clearTimeout(timer);
        const msg = JSON.parse(event.data);
        if (msg.requestId === requestId) {
          ws.removeEventListener('message', handleMessage);
          cb(msg);
        }
      } catch {}
    };
    ws.addEventListener('message', handleMessage);
    ws.send(JSON.stringify(payload));
    
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

  formatBroadcastResult(
    command: string,
    results: BroadcastResultItem[],
    serverProfiles: BroadcastProfileInfo[] = []
  ) {
    return formatBroadcastResult(command, results, serverProfiles);
  }
}

export interface BroadcastResultItem {
  key: string;
  output: string;
  status?: string;
  serverName?: string;
}

export interface BroadcastProfileInfo {
  host: string;
  port: number;
  name?: string;
}

export interface ConnectionSummary {
  connected: number;
  disconnected: number;
  total: number;
  text: string;
}

/**
 * Calculates a multi-server connection summary from server keys and an RCON status map.
 */
export function getConnectionSummary(
  keys: string[],
  rconStatusMap: Record<string, { status?: string } | undefined> = {}
): ConnectionSummary {
  let connected = 0;
  let disconnected = 0;
  for (const key of keys) {
    const status = rconStatusMap[key]?.status;
    if (status === 'connected') {
      connected++;
    } else {
      disconnected++;
    }
  }
  return {
    connected,
    disconnected,
    total: keys.length,
    text: `${connected} Connected, ${disconnected} Disconnected`,
  };
}

export const calculateConnectionSummary = getConnectionSummary;

/**
 * Formats multi-server broadcast command results into ANSI lines for terminal display.
 */
export function formatBroadcastResult(
  command: string,
  results: BroadcastResultItem[],
  serverProfiles: BroadcastProfileInfo[] = []
): string[] {
  const lines: string[] = [`\x1b[1;36m[BROADCAST]\x1b[0m > ${command}`];
  for (const result of results) {
    const profile = serverProfiles.find((p) => `${p.host}:${p.port}` === result.key);
    const serverLabel = result.serverName || profile?.name || result.key;
    const output = result.output || '';
    const status = result.status;
    const isSuccess =
      status === 'connected' ||
      (status === 'success' ||
        (status !== 'error' &&
          status !== 'disconnected' &&
          status !== 'failed' &&
          !output.startsWith('[RCON ERROR]') &&
          output !== '[RCON] Not connected'));

    if (isSuccess) {
      lines.push(`\x1b[1;32m[${serverLabel} (${result.key})]\x1b[0m ${output}`);
    } else {
      lines.push(`\x1b[1;31m[${serverLabel} (${result.key})]\x1b[0m ${output}`);
    }
  }
  return lines;
}
