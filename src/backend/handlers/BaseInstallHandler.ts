export class BaseInstallHandler {
  async installInstance(ws: WebSocket, msg: any): Promise<void> {
    const { sendAdminSocketCommand } = this.context;
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
    // Build argument list for the PowerShell script
    const args = [
      '-BaseServerInstallDirectory', `${baseInstallPath}`,
      '-InstanceDirectory', `${instanceDirectory}`
    ];
    // Optionally add more params as needed (future: queryPort, gamePort, etc.)
    try {
      const output = await sendAdminSocketCommand('Install-Instance.ps1', args);
      ws.send(JSON.stringify({ type: 'installInstance', ok: true, output, requestId: msg.requestId }));
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'installInstance', error: String(err), requestId: msg.requestId }));
    }
  }
  constructor(private context: any) {}

  handlers = {
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
    updatebaseinstall: async (ws: WebSocket, msg: any) => {
      const { getProfiles, processManager, spawn } = this.context;
      const profiles = getProfiles();
      const affectedProfiles = profiles.filter((p: any) => p.baseInstallPath === msg.path);
      if (affectedProfiles.length > 0) {
        const runningChecks = await Promise.all(
          affectedProfiles.map((profile: any) => processManager.isRunning(`${profile.host}:${profile.port}`, profile))
        );
        if (!runningChecks.some(running => running)) {
          affectedProfiles.forEach((profile: any) => {
            spawn('steamcmd', [
              '+login', 'anonymous',
              '+force_install_dir', profile.baseInstallPath,
              '+app_update', 2430930,
              '+quit'
            ]);
          });
          ws.send(JSON.stringify({ type: 'updatebaseinstallHandled', path: msg.path }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Cannot update base install while servers are running' }));
        }
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Base install not found' }));
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
    },
    installSteamCmd: async (ws: WebSocket, msg: any) => {
      const { sendAdminSocketCommand } = this.context;
      const { baseInstallPath } = msg;
      if (!baseInstallPath) {
        ws.send(JSON.stringify({ type: 'installSteamCmd', error: 'Missing baseInstallPath', requestId: msg.requestId }));
        return;
      }
      try {
        const output = await sendAdminSocketCommand('Install-SteamCmd.ps1', ['-BaseServerInstallDirectory', baseInstallPath]);
        ws.send(JSON.stringify({ type: 'installSteamCmd', ok: true, output, requestId: msg.requestId }));
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'installSteamCmd', error: String(err), requestId: msg.requestId }));
      }
    }
  };
}
