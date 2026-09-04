import { WebSocket } from 'ws';
import { syncRconSettingsToIni } from '../iniApi';
import { findLinkedBaseInstall } from '../steamUpdateNotifier';

export class ProfileHandler {
  constructor(private context: any) {}

  handlers = {
    getProfiles: async (ws: WebSocket, msg: any) => {
      const { getProfiles, config } = this.context;
      try {
        const rawProfiles = getProfiles().filter((p: any) => {
          const user = (ws as any).authUser;
          return user?.role === 'admin' || user?.role === 'server-admin' || (user?.assignedInstanceKeys || []).includes(`${p.host}:${p.port}`);
        });
        const baseInstalls = config?.baseInstalls || [];
        const profiles = rawProfiles.map((p: any) => {
          const linkedBase = findLinkedBaseInstall(p.directory, baseInstalls);
          const effectiveBaseInstallId = p.baseInstallId || linkedBase?.id || null;
          const effectiveBaseInstallPath = p.baseInstallPath || linkedBase?.path || null;
          const updateAvailable = !!linkedBase?.updateAvailable;

          return {
            ...p,
            baseInstallId: effectiveBaseInstallId,
            baseInstallPath: effectiveBaseInstallPath,
            baseInstallVersion: linkedBase?.version || null,
            latestBuildId: linkedBase?.latestBuildId || null,
            updateAvailable
          };
        });
        ws.send(JSON.stringify({ type: 'getProfiles', profiles, requestId: msg.requestId }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'getProfiles', error: 'Failed to load profiles', requestId: msg.requestId }));
      }
    },
    saveProfiles: async (ws: WebSocket, msg: any) => {
      const { saveProfiles } = this.context;
      try {
        this.context.config.profiles = msg.profiles;
        saveProfiles(msg.profiles);

        const profiles = msg.profiles || [];
        const shouldSync = msg.syncIni === true || profiles.some((p: any) => p && p.syncIni === true);
        if (shouldSync) {
          const affected = profiles.filter((p: any) => p && p.directory && (msg.syncIni === true || p.syncIni === true));
          for (const p of affected) {
            try {
              syncRconSettingsToIni(p, p.port, p.password);
            } catch (syncErr) {
              console.error(`Failed to sync INI for profile ${p.name || p.directory}:`, syncErr);
            }
          }
        }

        ws.send(JSON.stringify({ type: 'saveProfiles', ok: true, requestId: msg.requestId }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'saveProfiles', error: 'Failed to save profiles', requestId: msg.requestId }));
      }
    },
    getProcessStatus: async (ws: WebSocket, msg: any) => {
      const { getProfiles, processManager, config } = this.context;
      try {
        const profiles = getProfiles().filter((p: any) => {
          const user = (ws as any).authUser;
          return user?.role === 'admin' || user?.role === 'server-admin' || (user?.assignedInstanceKeys || []).includes(`${p.host}:${p.port}`);
        });
        const baseInstalls = config?.baseInstalls || [];
        const status = profiles.map((profile: any) => {
          const key = `${profile.host}:${profile.port}`;
          const status = processManager.getStatus(key);
          const proc = (processManager as any).processes?.[key];
          const linkedBase = findLinkedBaseInstall(profile.directory, baseInstalls);
          const effectiveBaseInstallId = profile.baseInstallId || linkedBase?.id || null;
          const updateAvailable = !!linkedBase?.updateAvailable;

          return {
            key,
            running: !!proc && !proc.crashed,
            startTime: proc ? proc.startTime : null,
            crashed: !!proc?.crashed,
            exitCode: proc ? proc.exitCode : null,
            manuallyStopped: !!profile.manuallyStopped,
            autoStart: !!profile.autoStart,
            baseInstallId: effectiveBaseInstallId,
            updateAvailable
          };
        });
        ws.send(JSON.stringify({ type: 'getProcessStatus', status, requestId: msg.requestId }));
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'getProcessStatus', error: e?.message || 'Failed to get process status', requestId: msg.requestId }));
      }
    },
    startServer: async (ws: WebSocket, msg: any) => {
      const { processManager } = this.context;
      try {
        await processManager.start(msg.key);
        ws.send(JSON.stringify({ type: 'startServer', ok: true, requestId: msg.requestId }));
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'startServer', error: e?.message || 'Failed to start server', requestId: msg.requestId }));
      }
    },
    stopServer: async (ws: WebSocket, msg: any) => {
      const { processManager, rconManager, getProfiles, saveProfiles } = this.context;
      try {
        const key = msg.key;
        if (getProfiles) {
          const profiles = getProfiles();
          const profile = profiles.find((p: any) => `${p.host}:${p.port}` === key);
          if (profile) {
            profile.manuallyStopped = true;
            if (saveProfiles) saveProfiles(profiles);
          }
        }
        if (typeof processManager?.shutdownGracefully === 'function') {
          await processManager.shutdownGracefully(key, rconManager);
        } else if (typeof processManager?.stopProcess === 'function') {
          await processManager.stopProcess(key);
        } else {
          await processManager?.stop(key);
        }
        ws.send(JSON.stringify({ type: 'stopServer', ok: true, requestId: msg.requestId }));
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'stopServer', error: e?.message || 'Failed to stop server', requestId: msg.requestId }));
      }
    },
    shutdownserver: async (ws: WebSocket, msg: any) => {
      const { getProfiles, saveProfiles, processManager, rconManager } = this.context;
      const keys = Array.isArray(msg.keys) ? msg.keys : (msg.key ? [msg.key] : []);
      const profiles = getProfiles ? getProfiles() : [];
      const affectedProfiles = profiles.filter((p: any) => keys.includes(`${p.host}:${p.port}`));
      if (affectedProfiles.length > 0) {
        affectedProfiles.forEach((profile: any) => {
          profile.manuallyStopped = true;
        });
        if (saveProfiles) saveProfiles(profiles);

        await Promise.all(affectedProfiles.map(async (profile: any) => {
          const key = `${profile.host}:${profile.port}`;
          if (typeof processManager?.shutdownGracefully === 'function') {
            await processManager.shutdownGracefully(key, rconManager);
          } else if (typeof processManager?.stopProcess === 'function') {
            await processManager.stopProcess(key);
          } else {
            await processManager?.stop(key);
          }
        }));

        ws.send(JSON.stringify({ type: 'shutdownserverHandled', keys }));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
      }
    },
    startserver: async (ws: WebSocket, msg: any) => {
      const { getProfiles, saveProfiles, setServerManuallyStopped, processManager } = this.context;
      const keys = msg.keys;
      const profiles = getProfiles();
      const affectedProfiles = profiles.filter((p: any) => keys.includes(`${p.host}:${p.port}`));
      if (affectedProfiles.length > 0) {
        affectedProfiles.forEach((profile : any) => {
          profile.manuallyStopped = false;
        });
        saveProfiles(profiles);
        affectedProfiles.forEach((profile : any) => {
          //setServerManuallyStopped(`${profile.host}:${profile.port}`, false);
          processManager.start(profile);
        });
        ws.send(JSON.stringify({ type: 'startserverHandled', keys }));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
      }
    },
  };
}
