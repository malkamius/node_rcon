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
        linkType,
        queryPort,
        gamePort,
        rconPort,
        mapName,
        sessionName,
        adminPassword,
        serverPassword
      } = msg;
      if (!baseInstallPath || !instanceDirectory || !queryPort || !gamePort || !mapName || !sessionName || !adminPassword) {
        ws.send(JSON.stringify({ type: 'installInstance', error: 'Missing required parameters', requestId: msg.requestId }));
        return;
      }
      // Use the elevated service endpoint
      try {
        const params = {
          baseInstallPath,
          instanceDirectory,
          linkType,
          queryPort,
          gamePort,
          rconPort,
          mapName,
          sessionName,
          adminPassword,
          serverPassword
        };
        const output = await sendElevatedCommand('InstallInstance', params);

        const effectiveRconPort = Number(rconPort || queryPort || 27020);
        const effectiveQueryPort = queryPort;
        const effectiveGamePort = gamePort;
        const mapArg = mapName.includes('_WP') ? mapName : `${mapName}_WP`;

        const parsedCommandline = [
          `${mapArg}?listen?SessionName="${sessionName}"?QueryPort=${effectiveQueryPort}?MaxPlayers=100?AllowCrateSpawnsOnTopOfStructures=True${serverPassword ? `?ServerPassword=${serverPassword}` : ''}`,
          `ServerAdminPassword=${adminPassword}`,
          `Port=${effectiveGamePort}`,
          '-ForceAllowCaveFlyers',
          '-NoBattlEye',
          '-servergamelog',
          '-severgamelogincludetribelogs',
          '-ServerRCONOutputTribeLogs',
          '-NotifyAdminCommandsInChat',
          '-nosteamclient',
          '-game',
          '-server',
          '-log',
          '-crossplay',
          '-noundermeshchecking',
          '-noantispeedhack',
          '-automanagedmods',
          '-ServerPlatform=ALL'
        ];

        const newProfile = {
          name: sessionName,
          host: '127.0.0.1',
          port: effectiveRconPort,
          password: adminPassword,
          game: 'ark_sa',
          features: {
            currentPlayers: {
              enabled: true,
              updateInterval: 10
            }
          },
          autoStart: false,
          directory: instanceDirectory,
          parsedCommandline,
          manuallyStopped: true
        };

        const profiles = this.context.getProfiles ? this.context.getProfiles() : (this.context.config?.profiles || []);
        const profileKey = `${newProfile.host}:${newProfile.port}`;
        const existingIdx = profiles.findIndex((p: any) => `${p.host}:${p.port}` === profileKey);
        if (existingIdx !== -1) {
          profiles[existingIdx] = newProfile;
        } else {
          profiles.push(newProfile);
        }

        if (this.context.saveProfiles) {
          this.context.saveProfiles(profiles);
        }
        if (this.context.config) {
          this.context.config.profiles = profiles;
        }
        if (this.context.auditLog) {
          this.context.auditLog('installInstance', { name: sessionName, directory: instanceDirectory, port: effectiveRconPort });
        }

        ws.send(JSON.stringify({ type: 'installInstance', ok: true, output, newProfile, requestId: msg.requestId }));
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'installInstance', error: String(err), requestId: msg.requestId }));
      }
    },
    getBaseInstalls: async (ws: WebSocket, msg: any) => {
      const { config, checkBaseInstallUpdates } = this.context;
      if (checkBaseInstallUpdates) {
        await checkBaseInstallUpdates(false);
      } else if (config?.checkBaseInstallUpdates) {
        await config.checkBaseInstallUpdates();
      }
      ws.send(JSON.stringify({ type: 'baseInstalls', baseInstalls: config.baseInstalls || [], requestId: msg.requestId }));
    },
    checkUpdates: async (ws: WebSocket, msg: any) => {
      const { config, checkBaseInstallUpdates } = this.context;
      let result = null;
      if (checkBaseInstallUpdates) {
        result = await checkBaseInstallUpdates(true);
      } else if (config?.checkBaseInstallUpdates) {
        result = await config.checkBaseInstallUpdates();
      }
      ws.send(JSON.stringify({ type: 'checkUpdatesResult', ok: true, baseInstalls: config.baseInstalls || [], result, requestId: msg.requestId }));
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

      const affectedProfiles = profiles.filter((p: any) => p.directory === baseInstallPath || realpathSync(p.directory) === realpathSync(baseInstallPath));
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
