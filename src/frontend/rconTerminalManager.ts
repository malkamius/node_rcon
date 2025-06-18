// Manages terminal state and history for each RCON tab
export interface TerminalSession {
  key: string;
  lines: string[];
}

export class RconTerminalManager {
  private sessions: Map<string, TerminalSession> = new Map();

  getSession(key: string): TerminalSession {
    if (!this.sessions.has(key)) {
      this.sessions.set(key, { key, lines: [] });
    }
    return this.sessions.get(key)!;
  }

  appendLine(key: string, line: string) {
    const session = this.getSession(key);
    session.lines.push(line);
  }

  clear(key: string) {
    if (this.sessions.has(key)) {
      this.sessions.get(key)!.lines = [];
    }
  }
}
