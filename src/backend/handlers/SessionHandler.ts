import { WebSocket } from 'ws';

export class SessionHandler {
  constructor(private context: any) {}

  handlers = {
    getSessionLines: async (ws: WebSocket, msg: any) => {
      const { sessionLines, loadSessionLinesFromDisk } = this.context;
      try {
        if (!sessionLines[msg.key]) {
          sessionLines[msg.key] = loadSessionLinesFromDisk(msg.key);
        }
        ws.send(JSON.stringify({ type: 'getSessionLines', key: msg.key, lines: sessionLines[msg.key] || [], requestId: msg.requestId }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'getSessionLines', key: msg.key, lines: [], requestId: msg.requestId }));
      }
    },
    clearSessionLines: async (ws: WebSocket, msg: any) => {
      const { sessionLines, saveSessionLinesToDisk, broadcast } = this.context;
      sessionLines[msg.key] = [];
      saveSessionLinesToDisk(msg.key, []);
      broadcast('sessionLine', { key: msg.key, line: null });
      broadcast('getSessionLines', { key: msg.key, lines: [] });
    },
    command: async (ws: WebSocket, msg: any) => {
      if (Array.isArray(msg?.keys)) {
        return this.handlers.broadcastCommand(ws, msg);
      }
      const { sessionLines, saveSessionLinesToDisk, broadcast, rconManager, SESSION_LINES_MAX } = this.context;
      if (!msg?.key || typeof msg?.command !== 'string') return;
      const maxLines = SESSION_LINES_MAX || 1000;
      const commandLine: any = {
        text: '> ' + msg.command,
        timestamp: Date.now(),
        type: 'command',
      };
      if (msg.guid) commandLine.guid = msg.guid;
      if (!sessionLines[msg.key]) sessionLines[msg.key] = [];
      sessionLines[msg.key].push(commandLine);
      if (sessionLines[msg.key].length > maxLines) {
        sessionLines[msg.key] = sessionLines[msg.key].slice(-maxLines);
      }
      if (typeof saveSessionLinesToDisk === 'function') {
        saveSessionLinesToDisk(msg.key, sessionLines[msg.key]);
      }
      if (typeof broadcast === 'function') {
        broadcast('sessionLine', { key: msg.key, line: commandLine });
      }
      const output = await rconManager.sendCommand(msg.key, msg.command);
      if (typeof output === 'string' && output.trim()) {
        const outputLine: any = {
          text: output,
          timestamp: Date.now(),
          type: 'output',
        };
        if (msg.guid) outputLine.guid = msg.guid;
        sessionLines[msg.key].push(outputLine);
        if (sessionLines[msg.key].length > maxLines) {
          sessionLines[msg.key] = sessionLines[msg.key].slice(-maxLines);
        }
        if (typeof saveSessionLinesToDisk === 'function') {
          saveSessionLinesToDisk(msg.key, sessionLines[msg.key]);
        }
        if (typeof broadcast === 'function') {
          broadcast('sessionLine', { key: msg.key, line: outputLine });
        }
      }
    },
    broadcastCommand: async (ws: WebSocket, msg: any) => {
      const {
        sessionLines,
        saveSessionLinesToDisk,
        loadSessionLinesFromDisk,
        broadcast,
        rconManager,
        SESSION_LINES_MAX,
        auditLog
      } = this.context;

      const keys = msg?.keys;
      const command = msg?.command;
      const guid = msg?.guid;

      // Validates that keys is an array of non-empty strings and command is a non-empty string.
      if (
        !Array.isArray(keys) ||
        keys.length === 0 ||
        !keys.every((k: any) => typeof k === 'string' && k.trim().length > 0) ||
        typeof command !== 'string' ||
        !command.trim()
      ) {
        return;
      }

      const maxLines = SESSION_LINES_MAX || 1000;

      // For each key in keys:
      // Construct command line { text: '> ' + msg.command, timestamp: Date.now(), type: 'command', guid: msg.guid }
      // Push to sessionLines[key] (bounded by SESSION_LINES_MAX)
      // Save to disk and broadcast sessionLine
      for (const key of keys) {
        const commandLine: any = {
          text: '> ' + command,
          timestamp: Date.now(),
          type: 'command',
        };
        if (guid) commandLine.guid = guid;

        if (!sessionLines[key]) {
          sessionLines[key] = (typeof loadSessionLinesFromDisk === 'function')
            ? (loadSessionLinesFromDisk(key) || [])
            : [];
        }
        sessionLines[key].push(commandLine);
        if (sessionLines[key].length > maxLines) {
          sessionLines[key] = sessionLines[key].slice(-maxLines);
        }
        if (typeof saveSessionLinesToDisk === 'function') {
          saveSessionLinesToDisk(key, sessionLines[key]);
        }
        if (typeof broadcast === 'function') {
          broadcast('sessionLine', { key, line: commandLine });
        }
      }

      // Execute rconManager.sendCommand(key, msg.command) concurrently for all keys using Promise.allSettled
      const promiseResults = await Promise.allSettled(
        keys.map((key: string) => rconManager.sendCommand(key, command))
      );

      const results: Array<{ key: string; output: string; status: string }> = [];

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const resItem = promiseResults[i];
        let output = '';
        if (resItem.status === 'fulfilled') {
          output = typeof resItem.value === 'string' ? resItem.value : String(resItem.value ?? '');
        } else {
          output = '[RCON ERROR] ' + (resItem.reason?.message || String(resItem.reason));
        }

        // Determine success: status is 'success' if output does NOT start with '[RCON ERROR]' and is not '[RCON] Not connected', otherwise 'disconnected' or 'error'.
        let status = 'success';
        if (output === '[RCON] Not connected' || output.startsWith('[RCON] Not connected')) {
          status = 'disconnected';
        } else if (output.startsWith('[RCON ERROR]')) {
          status = 'error';
        } else {
          status = 'success';
        }

        // If output received, construct { text: output, timestamp: Date.now(), type: 'output', guid: msg.guid }
        // Push to sessionLines[key], save to disk, and broadcast sessionLine
        if (typeof output === 'string' && output.trim()) {
          const outputLine: any = {
            text: output,
            timestamp: Date.now(),
            type: 'output',
          };
          if (guid) outputLine.guid = guid;

          if (!sessionLines[key]) {
            sessionLines[key] = (typeof loadSessionLinesFromDisk === 'function')
              ? (loadSessionLinesFromDisk(key) || [])
              : [];
          }
          sessionLines[key].push(outputLine);
          if (sessionLines[key].length > maxLines) {
            sessionLines[key] = sessionLines[key].slice(-maxLines);
          }
          if (typeof saveSessionLinesToDisk === 'function') {
            saveSessionLinesToDisk(key, sessionLines[key]);
          }
          if (typeof broadcast === 'function') {
            broadcast('sessionLine', { key, line: outputLine });
          }
        }

        results.push({ key, output, status });
      }

      // Broadcast or send back to ws:
      // { type: 'broadcastCommandResult', guid: msg.guid, command: msg.command, results: Array<{ key: string, output: string, status: string }>, timestamp: Date.now() }
      const resultMessage: any = {
        type: 'broadcastCommandResult',
        command,
        results,
        timestamp: Date.now(),
      };
      if (guid !== undefined) {
        resultMessage.guid = guid;
      }

      if (typeof broadcast === 'function') {
        broadcast('broadcastCommandResult', resultMessage);
      }
      if (ws && typeof ws.send === 'function') {
        try {
          ws.send(JSON.stringify(resultMessage));
        } catch {}
      }

      // If this.context.auditLog exists, audit log: this.context.auditLog('broadcastCommand', { count: keys.length, keys, command: msg.command })
      const auditFn = auditLog || this.context.auditLog;
      if (typeof auditFn === 'function') {
        auditFn('broadcastCommand', { count: keys.length, keys, command });
      }
    }
  };
}
