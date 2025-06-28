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

  constructor(maxLines: number = 100) {
    this.maxLines = maxLines;
  }

  getSession(key: string): TerminalSession {
    if (!this.sessions.has(key)) {
      this.sessions.set(key, { key, lines: [] });
      // Try to restore from backend
      this.restoreSessionLines(key);
    }
    return this.sessions.get(key)!;
  }

  async restoreSessionLines(key: string) {
    try {
      const res = await fetch(`/api/session-lines/${encodeURIComponent(key)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.lines)) {
          const session = this.getSession(key);
          session.lines = data.lines;
        }
      }
    } catch (e) {
      // ignore
    }
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

  clear(key: string) {
    if (this.sessions.has(key)) {
      this.sessions.get(key)!.lines = [];
    }
    // Optionally clear on backend too
    fetch(`/api/session-lines/${encodeURIComponent(key)}`, {
      method: 'DELETE'
    }).catch(() => {});
  }
}
