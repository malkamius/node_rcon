import { WebSocket } from 'ws';

export class ProfileHandler {
  constructor(private context: any) {}

  handlers = {
    getProfiles: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
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
        ws.send(JSON.stringify({ type: 'saveProfiles', ok: true, requestId: msg.requestId }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'saveProfiles', error: 'Failed to save profiles', requestId: msg.requestId }));
      }
    },
    getProcessStatus: async (ws: WebSocket, msg: any) => {
      const { getProfiles, processManager } = this.context;
      try {
        const profiles = getProfiles();
        const status = profiles.map((profile: any) => {
          const key = `${profile.host}:${profile.port}`;
          const status = processManager.getStatus(key);
          const proc = (processManager as any).processes?.[key];
          return {
            key,
            running: !!proc,
            startTime: proc ? proc.startTime : null,
            manuallyStopped: !!profile.manuallyStopped,
            autoStart: !!profile.autoStart,
            baseInstallId: profile.baseInstallId || null
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
      const { processManager } = this.context;
      try {
        await processManager.stop(msg.key);
        ws.send(JSON.stringify({ type: 'stopServer', ok: true, requestId: msg.requestId }));
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'stopServer', error: e?.message || 'Failed to stop server', requestId: msg.requestId }));
      }
    },
    shutdownserver: async (ws: WebSocket, msg: any) => {
      const { getProfiles, saveProfiles, setServerManuallyStopped, processManager } = this.context;
      const keys = msg.keys;
      const profiles = getProfiles();
      const affectedProfiles = profiles.filter((p: any) => keys.includes(`${p.host}:${p.port}`));
      if (affectedProfiles.length > 0) {
        affectedProfiles.forEach((profile : any) => {
          profile.manuallyStopped = true;
        });
        saveProfiles(profiles);
        affectedProfiles.forEach((profile : any) => {
          //setServerManuallyStopped(`${profile.host}:${profile.port}`, true);
          processManager.stopProcess(`${profile.host}:${profile.port}`);
        });
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
