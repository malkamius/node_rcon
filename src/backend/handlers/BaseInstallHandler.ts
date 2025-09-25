import { existsSync, realpathSync } from "fs";
import { sendElevatedCommand } from '../adminSocketClient';
import { installSteamCmd } from '../steamcmdInstaller';


export class BaseInstallHandler {
  
  private broadcast: ((type: string, payload: any) => void) | null = null;
  constructor(private context: any) {}

  setBroadcastHandler(broadcastFn: (type: string, payload: any) => void) {
    this.broadcast = broadcastFn;
  }

  handlers = {
    installInstance: async (ws: WebSocket, msg: any): Promise<void> => {
      const {
        baseInstallPath,
        instanceDirectory,
        queryPort,
        gamePort,
        mapName,
        sessionName,
        adminPassword,
        serverPassword
      } = msg;
      if (!baseInstallPath || !instanceDirectory || !queryPort || !gamePort || !mapName || !sessionName || !adminPassword) {
        ws.send(JSON.stringify({ type: 'installInstance', error: 'Missing required parameters', requestId: msg.requestId }));
        return;
      }
      // Use the new elevated service endpoint
      try {
        const params = {
          baseInstallPath,
          instanceDirectory
        };
        const output = await sendElevatedCommand('InstallInstance', params);
        ws.send(JSON.stringify({ type: 'installInstance', ok: true, output, requestId: msg.requestId }));
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'installInstance', error: String(err), requestId: msg.requestId }));
      }
    },
    getBaseInstalls: async (ws: WebSocket, msg: any) => {
      const { config } = this.context;
      if(config.checkBaseInstallUpdates)
      {
        await config.checkBaseInstallUpdates();
      }
      ws.send(JSON.stringify({ type: 'baseInstalls', baseInstalls: config.baseInstalls || [], requestId: msg.requestId }));
    },
    addBaseInstall: async (ws: WebSocket, msg: any) => {
      const { config, fs, configPath, auditLog, broadcast } = this.context;
      const { id, path: installPath, version, lastUpdated } = msg.data || {};
      if (!id || !installPath) {
        ws.send(JSON.stringify({ ok: false, error: 'id and path are required', requestId: msg.requestId }));
        return;
      }
      config.baseInstalls = config.baseInstalls || [];
      if (config.baseInstalls.some((b: any) => b.id === id || b.path === installPath)) {
        ws.send(JSON.stringify({ ok: false, error: 'Base install with this id or path already exists', requestId: msg.requestId }));
        return;
      }
      config.baseInstalls.push({ id, path: installPath, version: version || '', lastUpdated: lastUpdated || new Date().toISOString() });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      auditLog('addBaseInstall', { id, path: installPath, version });
      ws.send(JSON.stringify({ ok: true, requestId: msg.requestId }));
      broadcast('baseInstallsUpdated', { baseInstalls: config.baseInstalls });
    },
    updateBaseInstall: async (ws: WebSocket, msg: any) => {
      const { config, fs, configPath, auditLog, broadcast } = this.context;
      const { id, data } = msg;
      if (!id || !data) {
        ws.send(JSON.stringify({ ok: false, error: 'id and data required', requestId: msg.requestId }));
        return;
      }
      config.baseInstalls = config.baseInstalls || [];
      const idx = config.baseInstalls.findIndex((b: any) => b.id === id);
      if (idx === -1) {
        ws.send(JSON.stringify({ ok: false, error: 'Base install not found', requestId: msg.requestId }));
        return;
      }
      if (data.path && config.baseInstalls.some((b: any, i: number) => b.path === data.path && i !== idx)) {
        ws.send(JSON.stringify({ ok: false, error: 'Another base install with this path already exists', requestId: msg.requestId }));
        return;
      }
      if (data.path) config.baseInstalls[idx].path = data.path;
      if (data.version) config.baseInstalls[idx].version = data.version;
      if (data.lastUpdated) config.baseInstalls[idx].lastUpdated = data.lastUpdated;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      auditLog('updateBaseInstall', { id, path: data.path, version: data.version });
      ws.send(JSON.stringify({ ok: true, requestId: msg.requestId }));
      broadcast('baseInstallsUpdated', { baseInstalls: config.baseInstalls });
    },
    removeBaseInstall: async (ws: WebSocket, msg: any) => {
      const { config, fs, configPath, auditLog, broadcast } = this.context;
      const { id } = msg;
      config.baseInstalls = config.baseInstalls || [];
      const idx = config.baseInstalls.findIndex((b: any) => b.id === id);
      if (idx === -1) {
        ws.send(JSON.stringify({ ok: false, error: 'Base install not found', requestId: msg.requestId }));
        return;
      }
      config.baseInstalls.splice(idx, 1);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      auditLog('removeBaseInstall', { id });
      ws.send(JSON.stringify({ ok: true, requestId: msg.requestId }));
      broadcast('baseInstallsUpdated', { baseInstalls: config.baseInstalls });
    },
    updateSteamGame: async (ws: WebSocket, msg: any) => {
      // Update existing base install using steamcmd +app_update with PTY for real-time output
      const { getProfiles, processManager } = this.context;
      const profiles = getProfiles();
      const baseInstallPath = msg.path;
      
      const fs = require('fs');
      const path = require('path');

      const affectedProfiles = profiles.filter((p: any) => p.directory === baseInstallPath || realpathSync(p.baseInstallPath) === realpathSync(baseInstallPath));
      const pty = require('@homebridge/node-pty-prebuilt-multiarch');
      
      if (affectedProfiles.length > 0) {
        const runningChecks = await Promise.all(
          affectedProfiles.map((profile: any) => processManager.isRunning(`${profile.host}:${profile.port}`, profile))
        );
        if (runningChecks.some(running => running)) {
          if (this.broadcast) this.broadcast('error', { message: 'Cannot update base install while servers are running' });
          return;
        }
      } 
      if (this.broadcast) this.broadcast('steamUpdateProgress', { status: 'starting', baseInstallPath });
      const logFile = path.join(baseInstallPath, `steamcmd_update_${Date.now()}.log`);
      try {
        const steamCmdExe = path.join(this.context.config.steamCmdPath || "", 'steamcmd.exe');
        const args = ['+force_install_dir', baseInstallPath, '+login', 'anonymous', '+app_update', '2430930', 'validate', '+quit'];
        const ptyProcess = pty.spawn(steamCmdExe, args, {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd: baseInstallPath,
          env: process.env,
          useConpty: false
        });
        ptyProcess.on('data', (data: string) => {
          if (this.broadcast) this.broadcast('steamUpdateProgress', { status: 'progress', baseInstallPath, output: data });
          process.stdout.write(data);
          //fs.appendFileSync(logFile, data);
        });
        ptyProcess.on('exit', (code: number, signal: number) => {
          if (this.broadcast) this.broadcast('steamUpdateProgress', { status: 'done', baseInstallPath, code, signal });
          //fs.appendFileSync(logFile, `\nProcess exited with code ${code} and signal ${signal}\n`);
        });
      } catch (err) {
        if (this.broadcast) this.broadcast('steamUpdateProgress', { status: 'error', baseInstallPath, output: String(err) });
        return;
      }
      
    },

    installSteamGame: async (ws: WebSocket, msg: any) => {
      // Install base install using steamcmd +app_install with PTY for real-time output
      const { baseInstallPath } = msg;
      if (!baseInstallPath) {
        if (this.broadcast) this.broadcast('installSteam', { error: 'Missing baseInstallPath' });
        return;
      }
      if (this.broadcast) this.broadcast('steamInstallProgress', { status: 'starting', baseInstallPath });
      const fs = require('fs');
      const path = require('path');
      const pty = require('@homebridge/node-pty-prebuilt-multiarch');

      try {
        const steamCmdExe = path.join(this.context.config.steamCmdPath || "", 'steamcmd.exe');
        const args = ['+force_install_dir', baseInstallPath, '+login', 'anonymous', '+app_update', '2430930', 'validate', '+quit'];
        //const logFile = path.join(baseInstallPath, `steamcmd_install_${Date.now()}.log`);
        const ptyProcess = pty.spawn(steamCmdExe, args, {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd: baseInstallPath,
          env: process.env,
          useConpty: false
        });
        ptyProcess.on('data', (data: string) => {
          if (this.broadcast) this.broadcast('steamInstallProgress', { status: 'progress', baseInstallPath, output: data });
          process.stdout.write(data);
          //fs.appendFileSync(logFile, data);
        });
        ptyProcess.on('exit', (code: number, signal: number) => {
          if (this.broadcast) this.broadcast('steamInstallProgress', { status: 'done', baseInstallPath, code, signal });
          //fs.appendFileSync(logFile, `\nProcess exited with code ${code} and signal ${signal}\n`);
        });
      } catch (err) {
        if (this.broadcast) this.broadcast('steamInstallProgress', { status: 'error', baseInstallPath, output: String(err) });
        return;
      }
    },
    getSteamCmdInstall: async (ws: WebSocket, msg: any) => {
      const { config } = this.context;
      let found = false;
      let steamCmdPath = config.steamCmdPath || "";
      const fs = require('fs');
      const exePath = require('path').join(steamCmdPath, 'steamcmd.exe');
      if (steamCmdPath) {
        found = fs.existsSync(exePath);
      }
      const result = { steamCmdPath, found };
      ws.send(JSON.stringify({ type: 'getSteamCmdInstall', result, requestId: msg.requestId }));
    },
    getSteamCmdExistsAt: async (ws: WebSocket, msg: any) => {
      const { steamCmdPath } = msg;
      const fs = require('fs');
      const exePath = require('path').join(steamCmdPath, 'steamcmd.exe');
      const exists = fs.existsSync(exePath);
      ws.send(JSON.stringify({ type: 'getSteamCmdExistsAt', exists, requestId: msg.requestId }));
    },
    setSteamCmdPath: async (ws: WebSocket, msg: any) => {
      const { config, configPath, auditLog } = this.context;
      const { steamCmdPath } = msg;
      // Save the new path to config
      config.steamCmdPath = steamCmdPath;
      // TODO: Save the updated config, maybe an API to save config
      const fs = require('fs');
      const exePath = require('path').join(steamCmdPath, 'steamcmd.exe');
      const exists = fs.existsSync(exePath);
      ws.send(JSON.stringify({ type: 'setSteamCmdPath', exists, steamCmdPath, requestId: msg.requestId }));
    },
    installSteamCmd: async (ws: WebSocket, msg: any) => {
      const { baseInstallPath } = msg;
      if (!baseInstallPath) {
        ws.send(JSON.stringify({ type: 'installSteamCmd', error: 'Missing baseInstallPath', requestId: msg.requestId }));
        return;
      }
      try {
        await installSteamCmd(baseInstallPath);
        ws.send(JSON.stringify({ type: 'installSteamCmd', ok: true, requestId: msg.requestId }));
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'installSteamCmd', error: String(err), requestId: msg.requestId }));
      }
    }
  };
}
