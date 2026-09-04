import { describe, it, expect, beforeEach, jest } from '@jest/globals';
// Import modules to test (example: process manager, script engine, API handlers)
// import { startServerProcess, stopServerProcess } from '../rconManager';
// ...other imports

import { ArkSAProcessManager } from '../ProcessManager';

describe('Server Process Management', () => {
  it('should start a server process and update status', async () => {
    // TODO: Mock child_process.spawn, call startServerProcess, assert status
    expect(true).toBe(true);
  });

  it('should stop a server process and update status', async () => {
    // TODO: Mock process kill, call stopServerProcess, assert status
    expect(true).toBe(true);
  });

  it('should not auto-start if manually stopped', async () => {
    // TODO: Simulate manual stop, backend startup, assert no auto-start
    expect(true).toBe(true);
  });

  describe('Graceful Shutdown', () => {
    it('should return { running: false } if process is not running', async () => {
      const pm = new ArkSAProcessManager();
      const status = await pm.shutdownGracefully('127.0.0.1:7777');
      expect(status).toEqual({ running: false });
    });

    it('should send SaveWorld and DoExit via RCON and wait for termination', async () => {
      const pm = new ArkSAProcessManager();
      (pm as any).processes['127.0.0.1:7777'] = { pid: process.pid, startTime: Date.now() };

      const sentCommands: string[] = [];
      const mockRcon = {
        sendCommand: jest.fn(async (key: string, cmd: string) => {
          sentCommands.push(cmd);
          if (cmd === 'DoExit') {
            setTimeout(() => {
              delete (pm as any).processes['127.0.0.1:7777'];
            }, 50);
          }
          return 'OK';
        })
      };

      let statusEventReceived = false;
      pm.on('processStatus', (key: string, status: any) => {
        if (key === '127.0.0.1:7777' && !status.running && !status.crashed) {
          statusEventReceived = true;
        }
      });

      const status = await pm.shutdownGracefully('127.0.0.1:7777', mockRcon, 3000);

      expect(mockRcon.sendCommand).toHaveBeenCalledWith('127.0.0.1:7777', 'SaveWorld');
      expect(mockRcon.sendCommand).toHaveBeenCalledWith('127.0.0.1:7777', 'DoExit');
      expect(sentCommands).toEqual(['SaveWorld', 'DoExit']);
      expect(status).toEqual({ running: false });
      expect(statusEventReceived).toBe(true);
    }, 10000);

    it('should fall back to stop() if RCON is not provided', async () => {
      const pm = new ArkSAProcessManager();
      const stopSpy = jest.spyOn(pm, 'stop').mockResolvedValue({ running: false });
      (pm as any).processes['127.0.0.1:7777'] = { pid: process.pid, startTime: Date.now() };

      const status = await pm.shutdownGracefully('127.0.0.1:7777', undefined, 1000);
      expect(stopSpy).toHaveBeenCalledWith('127.0.0.1:7777');
      expect(status).toEqual({ running: false });
    });

    it('should fall back to stop() if RCON command fails', async () => {
      const pm = new ArkSAProcessManager();
      const stopSpy = jest.spyOn(pm, 'stop').mockResolvedValue({ running: false });
      (pm as any).processes['127.0.0.1:7777'] = { pid: process.pid, startTime: Date.now() };

      const mockRcon = {
        sendCommand: jest.fn(async () => {
          throw new Error('RCON connection closed');
        })
      };

      const status = await pm.shutdownGracefully('127.0.0.1:7777', mockRcon, 1000);
      expect(stopSpy).toHaveBeenCalledWith('127.0.0.1:7777');
      expect(status).toEqual({ running: false });
    });

    it('should fall back to stop() if process does not exit within timeout', async () => {
      const pm = new ArkSAProcessManager();
      const stopSpy = jest.spyOn(pm, 'stop').mockResolvedValue({ running: false });
      (pm as any).processes['127.0.0.1:7777'] = { pid: process.pid, startTime: Date.now() };

      const mockRcon = {
        sendCommand: jest.fn(async (key: string, cmd: string) => 'OK')
      };

      const status = await pm.shutdownGracefully('127.0.0.1:7777', mockRcon, 500);
      expect(mockRcon.sendCommand).toHaveBeenCalledWith('127.0.0.1:7777', 'SaveWorld');
      expect(mockRcon.sendCommand).toHaveBeenCalledWith('127.0.0.1:7777', 'DoExit');
      expect(stopSpy).toHaveBeenCalledWith('127.0.0.1:7777');
      expect(status).toEqual({ running: false });
    }, 10000);
  });
});

describe('Base Install Management', () => {
  it('should add, update, and remove base installs', async () => {
    // TODO: Test CRUD logic, uniqueness validation
    expect(true).toBe(true);
  });

  it('should block update if any server is running with that base', async () => {
    // TODO: Simulate running server, attempt update, expect block
    expect(true).toBe(true);
  });
});

describe('RCON Script Engine', () => {
  const { parseScript, executeScript, cancelScript, getScriptStatus, setRconManager } = require('../rconScriptEngine');

  beforeEach(() => {
    // Mock rconManager with a dummy sendCommand
    setRconManager({
      sendCommand: async (key: string, cmd: string) => `Executed: ${cmd}`
    });
  });

  it('should parse RCON scripts into rcon, wait, and update-base-install lines', () => {
    const script = [
      'serverchat SYSTEM: Restarting in 5 minutes',
      'wait 5000',
      'update-base-install ark_base_1',
      'SaveWorld'
    ].join('\n');

    const lines = parseScript(script);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toEqual({ raw: 'serverchat SYSTEM: Restarting in 5 minutes', type: 'rcon' });
    expect(lines[1]).toEqual({ raw: 'wait 5000', type: 'wait', value: '5000' });
    expect(lines[2]).toEqual({ raw: 'update-base-install ark_base_1', type: 'update-base-install', value: 'ark_base_1' });
    expect(lines[3]).toEqual({ raw: 'SaveWorld', type: 'rcon' });
  });

  it('should execute RCON scripts line by line and update status', async () => {
    const server = { name: 'Test Server', host: '127.0.0.1', port: 27999, password: 'test' };
    const script = 'serverchat Hello\nwait 50\nSaveWorld';

    const exec = await executeScript(server, script, []);
    expect(exec.serverKey).toBe('127.0.0.1:27999');
    expect(exec.status).toBe('running');

    // Wait a brief moment for async script loop to complete
    await new Promise(res => setTimeout(res, 120));

    const status = getScriptStatus('127.0.0.1:27999');
    expect(status).toBeDefined();
    expect(status?.status).toBe('completed');
    expect(status?.currentLine).toBe(3);
  });

  it('should support script cancellation', async () => {
    const server = { name: 'Cancel Server', host: '127.0.0.1', port: 27998, password: 'test' };
    const script = 'serverchat Step1\nwait 1000\nserverchat Step2';

    const exec = await executeScript(server, script, []);
    expect(exec.status).toBe('running');

    const cancelled = cancelScript('127.0.0.1:27998');
    expect(cancelled).toBe(true);

    const status = getScriptStatus('127.0.0.1:27998');
    expect(status?.status).toBe('cancelled');
    expect(status?.cancelled).toBe(true);
  });
});

