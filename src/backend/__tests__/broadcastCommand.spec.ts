import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SessionHandler } from '../handlers/SessionHandler';

describe('SessionHandler: broadcastCommand & command', () => {
  let context: any;
  let handler: SessionHandler;
  let mockWs: any;

  beforeEach(() => {
    mockWs = {
      send: jest.fn(),
      readyState: 1,
    };

    context = {
      sessionLines: {},
      saveSessionLinesToDisk: jest.fn(),
      loadSessionLinesFromDisk: jest.fn((key: string) => []),
      broadcast: jest.fn(),
      rconManager: {
        sendCommand: jest.fn(),
      },
      SESSION_LINES_MAX: 10,
      auditLog: jest.fn(),
    };

    handler = new SessionHandler(context);
  });

  describe('Validation', () => {
    it('should ignore broadcastCommand if keys is not an array or is empty', async () => {
      await handler.handlers.broadcastCommand(mockWs, { keys: [], command: 'SaveWorld' });
      await handler.handlers.broadcastCommand(mockWs, { keys: null, command: 'SaveWorld' });
      await handler.handlers.broadcastCommand(mockWs, { keys: 'not-array', command: 'SaveWorld' });

      expect(context.rconManager.sendCommand).not.toHaveBeenCalled();
      expect(context.auditLog).not.toHaveBeenCalled();
    });

    it('should ignore broadcastCommand if keys contains non-string or empty elements', async () => {
      await handler.handlers.broadcastCommand(mockWs, { keys: [''], command: 'SaveWorld' });
      await handler.handlers.broadcastCommand(mockWs, { keys: ['   '], command: 'SaveWorld' });
      await handler.handlers.broadcastCommand(mockWs, { keys: [123 as any], command: 'SaveWorld' });

      expect(context.rconManager.sendCommand).not.toHaveBeenCalled();
      expect(context.auditLog).not.toHaveBeenCalled();
    });

    it('should ignore broadcastCommand if command is empty or not a string', async () => {
      await handler.handlers.broadcastCommand(mockWs, { keys: ['127.0.0.1:27015'], command: '' });
      await handler.handlers.broadcastCommand(mockWs, { keys: ['127.0.0.1:27015'], command: '   ' });
      await handler.handlers.broadcastCommand(mockWs, { keys: ['127.0.0.1:27015'], command: null as any });

      expect(context.rconManager.sendCommand).not.toHaveBeenCalled();
      expect(context.auditLog).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent multi-server dispatch', () => {
    it('should dispatch command to all servers concurrently and record session lines & audit log', async () => {
      const keys = ['127.0.0.1:27015', '127.0.0.1:27016', '127.0.0.1:27017'];
      (context.rconManager.sendCommand as any).mockImplementation(async (key: string, cmd: string) => {
        return `Output from ${key} for ${cmd}`;
      });

      await handler.handlers.broadcastCommand(mockWs, {
        keys,
        command: 'ServerChat Hello All',
        guid: 'test-guid-1',
      });

      // Verify sendCommand was invoked for each server
      expect(context.rconManager.sendCommand).toHaveBeenCalledTimes(3);
      for (const key of keys) {
        expect(context.rconManager.sendCommand).toHaveBeenCalledWith(key, 'ServerChat Hello All');
      }

      // Verify sessionLines for each server
      for (const key of keys) {
        const lines = context.sessionLines[key];
        expect(lines).toHaveLength(2);
        expect(lines[0]).toEqual({
          text: '> ServerChat Hello All',
          timestamp: expect.any(Number),
          type: 'command',
          guid: 'test-guid-1',
        });
        expect(lines[1]).toEqual({
          text: `Output from ${key} for ServerChat Hello All`,
          timestamp: expect.any(Number),
          type: 'output',
          guid: 'test-guid-1',
        });
      }

      // Verify saveSessionLinesToDisk called for each line
      expect(context.saveSessionLinesToDisk).toHaveBeenCalledTimes(6);

      // Verify broadcast('sessionLine', ...) called for command and output for each key
      expect(context.broadcast).toHaveBeenCalledWith('sessionLine', expect.objectContaining({
        key: '127.0.0.1:27015',
        line: expect.objectContaining({ type: 'command', text: '> ServerChat Hello All' }),
      }));
      expect(context.broadcast).toHaveBeenCalledWith('sessionLine', expect.objectContaining({
        key: '127.0.0.1:27015',
        line: expect.objectContaining({ type: 'output' }),
      }));

      // Verify auditLog called
      expect(context.auditLog).toHaveBeenCalledWith('broadcastCommand', {
        count: 3,
        keys,
        command: 'ServerChat Hello All',
      });

      // Verify broadcastCommandResult broadcast and/or sent to ws
      expect(context.broadcast).toHaveBeenCalledWith('broadcastCommandResult', expect.objectContaining({
        type: 'broadcastCommandResult',
        guid: 'test-guid-1',
        command: 'ServerChat Hello All',
        results: [
          { key: '127.0.0.1:27015', output: 'Output from 127.0.0.1:27015 for ServerChat Hello All', status: 'success' },
          { key: '127.0.0.1:27016', output: 'Output from 127.0.0.1:27016 for ServerChat Hello All', status: 'success' },
          { key: '127.0.0.1:27017', output: 'Output from 127.0.0.1:27017 for ServerChat Hello All', status: 'success' },
        ],
        timestamp: expect.any(Number),
      }));

      expect(mockWs.send).toHaveBeenCalled();
      const sentPayload = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentPayload.type).toBe('broadcastCommandResult');
      expect(sentPayload.guid).toBe('test-guid-1');
      expect(sentPayload.results).toHaveLength(3);
    });

    it('should respect SESSION_LINES_MAX bounding', async () => {
      context.SESSION_LINES_MAX = 2;
      const key = '127.0.0.1:27015';
      context.sessionLines[key] = [
        { text: 'existing line 1', timestamp: 1, type: 'output' },
      ];

      (context.rconManager.sendCommand as any).mockResolvedValue('Command output');

      await handler.handlers.broadcastCommand(mockWs, {
        keys: [key],
        command: 'SaveWorld',
      });

      // Initial 1 line + 1 command line + 1 output line = 3 lines, sliced to max 2
      expect(context.sessionLines[key].length).toBe(2);
      expect(context.sessionLines[key][0].type).toBe('command');
      expect(context.sessionLines[key][1].type).toBe('output');
    });
  });

  describe('Error and disconnected server handling', () => {
    it('should correctly classify error, disconnected, and rejection statuses', async () => {
      const keys = ['server-ok:1234', 'server-disc:1234', 'server-err:1234', 'server-throw:1234'];

      (context.rconManager.sendCommand as any).mockImplementation(async (key: string) => {
        if (key === 'server-ok:1234') return 'Server saved successfully';
        if (key === 'server-disc:1234') return '[RCON] Not connected';
        if (key === 'server-err:1234') return '[RCON ERROR] Connection reset by peer';
        if (key === 'server-throw:1234') throw new Error('Socket timeout');
        return '';
      });

      await handler.handlers.broadcastCommand(mockWs, {
        keys,
        command: 'SaveWorld',
        guid: 'status-test-guid',
      });

      expect(context.broadcast).toHaveBeenCalledWith('broadcastCommandResult', expect.objectContaining({
        type: 'broadcastCommandResult',
        guid: 'status-test-guid',
        command: 'SaveWorld',
        results: [
          { key: 'server-ok:1234', output: 'Server saved successfully', status: 'success' },
          { key: 'server-disc:1234', output: '[RCON] Not connected', status: 'disconnected' },
          { key: 'server-err:1234', output: '[RCON ERROR] Connection reset by peer', status: 'error' },
          { key: 'server-throw:1234', output: '[RCON ERROR] Socket timeout', status: 'error' },
        ],
      }));
    });
  });

  describe('handlers.command extension', () => {
    it('should handle single msg.key as before', async () => {
      (context.rconManager.sendCommand as any).mockResolvedValue('Single output');

      await handler.handlers.command(mockWs, {
        key: 'single-srv:1234',
        command: 'DoExit',
        guid: 'single-guid',
      });

      expect(context.rconManager.sendCommand).toHaveBeenCalledWith('single-srv:1234', 'DoExit');
      expect(context.sessionLines['single-srv:1234']).toHaveLength(2);
      expect(context.broadcast).toHaveBeenCalledWith('sessionLine', expect.objectContaining({
        key: 'single-srv:1234',
        line: expect.objectContaining({ text: '> DoExit' }),
      }));
      expect(context.broadcast).toHaveBeenCalledWith('sessionLine', expect.objectContaining({
        key: 'single-srv:1234',
        line: expect.objectContaining({ text: 'Single output' }),
      }));
    });

    it('should support msg.keys array by delegating to broadcastCommand', async () => {
      (context.rconManager.sendCommand as any).mockResolvedValue('Multi output');

      await handler.handlers.command(mockWs, {
        keys: ['srv-a:1234', 'srv-b:1234'],
        command: 'BroadcastHello',
        guid: 'multi-guid',
      });

      expect(context.rconManager.sendCommand).toHaveBeenCalledWith('srv-a:1234', 'BroadcastHello');
      expect(context.rconManager.sendCommand).toHaveBeenCalledWith('srv-b:1234', 'BroadcastHello');
      expect(context.auditLog).toHaveBeenCalledWith('broadcastCommand', {
        count: 2,
        keys: ['srv-a:1234', 'srv-b:1234'],
        command: 'BroadcastHello',
      });
      expect(context.broadcast).toHaveBeenCalledWith('broadcastCommandResult', expect.objectContaining({
        type: 'broadcastCommandResult',
        guid: 'multi-guid',
        command: 'BroadcastHello',
        results: [
          { key: 'srv-a:1234', output: 'Multi output', status: 'success' },
          { key: 'srv-b:1234', output: 'Multi output', status: 'success' },
        ],
      }));
    });
  });
});
