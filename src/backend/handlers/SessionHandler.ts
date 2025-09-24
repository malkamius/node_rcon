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
      const { sessionLines, saveSessionLinesToDisk, broadcast, rconManager, SESSION_LINES_MAX } = this.context;
      const commandLine: any = {
        text: '> ' + msg.command,
        timestamp: Date.now(),
        type: 'command',
      };
      if (msg.guid) commandLine.guid = msg.guid;
      if (!sessionLines[msg.key]) sessionLines[msg.key] = [];
      sessionLines[msg.key].push(commandLine);
      if (sessionLines[msg.key].length > SESSION_LINES_MAX) {
        sessionLines[msg.key] = sessionLines[msg.key].slice(-SESSION_LINES_MAX);
      }
      saveSessionLinesToDisk(msg.key, sessionLines[msg.key]);
      broadcast('sessionLine', { key: msg.key, line: commandLine });
      const output = await rconManager.sendCommand(msg.key, msg.command);
      if (typeof output === 'string' && output.trim()) {
        const outputLine: any = {
          text: output,
          timestamp: Date.now(),
          type: 'output',
        };
        if (msg.guid) outputLine.guid = msg.guid;
        sessionLines[msg.key].push(outputLine);
        if (sessionLines[msg.key].length > SESSION_LINES_MAX) {
          sessionLines[msg.key] = sessionLines[msg.key].slice(-SESSION_LINES_MAX);
        }
        saveSessionLinesToDisk(msg.key, sessionLines[msg.key]);
        broadcast('sessionLine', { key: msg.key, line: outputLine });
      }
    }
  };
}
