import { WebSocket } from 'ws';

export class IniHandler {
  constructor(private context: any) {}

  handlers = {
    getServerIni: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = profiles[msg.idx];
        if (!profile) throw new Error('Profile not found');
        const iniApiModule = require('../iniApi');
        if (typeof iniApiModule.getIni === 'function') {
          iniApiModule.getIni(profile, msg.file).then((iniObj: any) => {
            ws.send(JSON.stringify({ type: 'getServerIni', idx: msg.idx, file: msg.file, iniObj, requestId: msg.requestId }));
          }).catch((e: any) => {
            ws.send(JSON.stringify({ type: 'getServerIni', idx: msg.idx, file: msg.file, error: e?.message || 'Failed to load INI', requestId: msg.requestId }));
          });
        } else {
          const path = require('path');
          const fs = require('fs');
          const ini = require('../ark-ini');
          const iniPath = path.join(profile.directory, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', msg.file);
          if (!fs.existsSync(iniPath)) {
            ws.send(JSON.stringify({ type: 'getServerIni', idx: msg.idx, file: msg.file, iniObj: {}, requestId: msg.requestId }));
          } else {
            const iniRaw = fs.readFileSync(iniPath, 'utf-8');
            const iniObj = ini.decode(iniRaw);
            ws.send(JSON.stringify({ type: 'getServerIni', idx: msg.idx, file: msg.file, iniObj, requestId: msg.requestId }));
          }
        }
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'getServerIni', idx: msg.idx, file: msg.file, error: e?.message || 'Failed to load INI', requestId: msg.requestId }));
      }
    },
    saveServerIni: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = profiles[msg.idx];
        if (!profile) throw new Error('Profile not found');
        const iniApiModule = require('../iniApi');
        if (typeof iniApiModule.saveIni === 'function') {
          iniApiModule.saveIni(profile, msg.file, msg.iniObj).then(() => {
            ws.send(JSON.stringify({ type: 'saveServerIni', ok: true, requestId: msg.requestId }));
          }).catch((e: any) => {
            ws.send(JSON.stringify({ type: 'saveServerIni', error: e?.message || 'Failed to save INI', requestId: msg.requestId }));
          });
        } else {
          const path = require('path');
          const fs = require('fs');
          const ini = require('../ark-ini');
          const iniPath = path.join(profile.directory, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', msg.file);
          const iniStr = ini.encode(msg.iniObj, { whitespace: false });
          fs.mkdirSync(path.dirname(iniPath), { recursive: true });
          fs.writeFileSync(iniPath, iniStr, 'utf-8');
          ws.send(JSON.stringify({ type: 'saveServerIni', ok: true, requestId: msg.requestId }));
        }
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'saveServerIni', error: e?.message || 'Failed to save INI', requestId: msg.requestId }));
      }
    },
  };
}
