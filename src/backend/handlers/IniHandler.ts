import { WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import * as ini from '../ark-ini';
import { getIniPath, deepMerge, syncRconSettingsToIni } from '../iniApi';
import {
  listIniBackups,
  getIniBackupContent,
  getActiveIniContent,
  restoreIniBackup,
  isSafeIniBackupFileName,
  getBaseFileNameFromBackup,
  computeLineDiff,
  computeSideBySideDiff,
  pruneIniBackups,
  deleteIniBackup
} from '../iniBackupManager';


export class IniHandler {
  constructor(private context: any) {}

  handlers = {
    getServerIni: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = profiles[msg.idx];
        if (!profile) throw new Error('Profile not found');
        const iniPath = getIniPath(profile, msg.file);
        if (!fs.existsSync(iniPath)) {
          ws.send(JSON.stringify({
            type: 'getServerIni',
            idx: msg.idx,
            file: msg.file,
            iniObj: {},
            rawText: '',
            requestId: msg.requestId
          }));
        } else {
          const iniRaw = fs.readFileSync(iniPath, 'utf-8');
          const iniObj = ini.decode(iniRaw);
          ws.send(JSON.stringify({
            type: 'getServerIni',
            idx: msg.idx,
            file: msg.file,
            iniObj,
            rawText: iniRaw,
            requestId: msg.requestId
          }));
        }
      } catch (e: any) {
        ws.send(JSON.stringify({
          type: 'getServerIni',
          idx: msg.idx,
          file: msg.file,
          error: e?.message || 'Failed to load INI',
          requestId: msg.requestId
        }));
      }
    },
    saveServerIni: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = profiles[msg.idx];
        if (!profile) throw new Error('Profile not found');
        const iniPath = getIniPath(profile, msg.file);
        const dir = path.dirname(iniPath);
        const base = path.basename(iniPath, '.ini');
        const date = new Date().toISOString().replace(/[:.]/g, '-');

        fs.mkdirSync(dir, { recursive: true });

        if (msg.rawText !== undefined) {
          if (fs.existsSync(iniPath)) {
            const backupName = `${base}.${date}.backup.ini`;
            fs.copyFileSync(iniPath, path.join(dir, backupName));
          }
          fs.writeFileSync(iniPath, msg.rawText, 'utf-8');
          ws.send(JSON.stringify({ type: 'saveServerIni', ok: true, requestId: msg.requestId }));
        } else if (msg.iniObj !== undefined) {
          let mergedIni = {};
          if (fs.existsSync(iniPath)) {
            const backupName = `${base}.${date}.backup.ini`;
            fs.copyFileSync(iniPath, path.join(dir, backupName));

            if (msg.overwrite === true) {
              mergedIni = msg.iniObj;
            } else {
              const iniRaw = fs.readFileSync(iniPath, 'utf-8');
              const iniObj = ini.decode(iniRaw);
              mergedIni = deepMerge(iniObj, msg.iniObj);
            }
          } else {
            mergedIni = msg.iniObj;
          }
          const iniStr = ini.encode(mergedIni, { whitespace: false });
          fs.writeFileSync(iniPath, iniStr, 'utf-8');
          ws.send(JSON.stringify({ type: 'saveServerIni', ok: true, requestId: msg.requestId }));
        } else {
          throw new Error('Neither rawText nor iniObj provided');
        }
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'saveServerIni', error: e?.message || 'Failed to save INI', requestId: msg.requestId }));
      }
    },
    syncRconToIni: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = profiles[msg.idx];
        if (!profile) throw new Error('Profile not found');
        const port = msg.port ?? profile.port;
        const password = msg.password ?? profile.password;
        const result = syncRconSettingsToIni(profile, port, password);
        if (!result.success) {
          throw new Error(result.error || 'Failed to sync RCON settings to INI');
        }
        ws.send(JSON.stringify({ type: 'syncRconToIni', ok: true, path: result.path, requestId: msg.requestId }));
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'syncRconToIni', ok: false, error: e?.message || 'Failed to sync RCON settings to INI', requestId: msg.requestId }));
      }
    },
    getIniBackups: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = typeof msg.idx === 'number' ? profiles[msg.idx] : profiles.find((p: any) => `${p.host}:${p.port}` === msg.key);
        if (!profile) throw new Error('Profile not found');
        if (!profile.directory) throw new Error('Server directory not configured');
        const backups = listIniBackups(profile.directory, msg.file);
        ws.send(JSON.stringify({
          type: 'getIniBackups',
          ok: true,
          idx: msg.idx,
          key: msg.key,
          file: msg.file,
          backups,
          directory: profile.directory,
          requestId: msg.requestId
        }));
      } catch (e: any) {
        ws.send(JSON.stringify({
          type: 'getIniBackups',
          ok: false,
          error: e?.message || 'Failed to list INI backups',
          requestId: msg.requestId
        }));
      }
    },
    getIniBackupContent: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = typeof msg.idx === 'number' ? profiles[msg.idx] : profiles.find((p: any) => `${p.host}:${p.port}` === msg.key);
        if (!profile) throw new Error('Profile not found');
        if (!profile.directory) throw new Error('Server directory not configured');
        if (!isSafeIniBackupFileName(msg.filename)) throw new Error('Invalid or unsafe backup filename');

        const backupData = getIniBackupContent(profile.directory, msg.filename);
        const baseFile = getBaseFileNameFromBackup(msg.filename);
        const activeData = getActiveIniContent(profile.directory, baseFile);
        const diff = computeLineDiff(backupData.content, activeData.content);
        const sideBySide = computeSideBySideDiff(backupData.content, activeData.content);

        ws.send(JSON.stringify({
          type: 'getIniBackupContent',
          ok: true,
          ...backupData,
          baseFile,
          activeContent: activeData.content,
          activeExists: activeData.exists,
          diff,
          sideBySide,
          requestId: msg.requestId
        }));
      } catch (e: any) {
        ws.send(JSON.stringify({
          type: 'getIniBackupContent',
          ok: false,
          error: e?.message || 'Failed to read backup content',
          requestId: msg.requestId
        }));
      }
    },
    restoreIniBackup: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = typeof msg.idx === 'number' ? profiles[msg.idx] : profiles.find((p: any) => `${p.host}:${p.port}` === msg.key);
        if (!profile) throw new Error('Profile not found');
        if (!profile.directory) throw new Error('Server directory not configured');
        if (!isSafeIniBackupFileName(msg.filename)) throw new Error('Invalid or unsafe backup filename');

        const result = restoreIniBackup(profile.directory, msg.filename);
        ws.send(JSON.stringify({
          type: 'restoreIniBackup',
          ok: true,
          result,
          requestId: msg.requestId
        }));
      } catch (e: any) {
        ws.send(JSON.stringify({
          type: 'restoreIniBackup',
          ok: false,
          error: e?.message || 'Failed to restore INI backup',
          requestId: msg.requestId
        }));
      }
    },
    pruneIniBackups: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = typeof msg.idx === 'number' ? profiles[msg.idx] : profiles.find((p: any) => `${p.host}:${p.port}` === msg.key);
        if (!profile) throw new Error('Profile not found');
        if (!profile.directory) throw new Error('Server directory not configured');

        const options = msg.options || {
          file: msg.file,
          keepCount: msg.keepCount,
          olderThanDays: msg.olderThanDays,
          preserveSafetyBackups: msg.preserveSafetyBackups
        };

        const result = pruneIniBackups(profile.directory, options);
        ws.send(JSON.stringify({
          type: 'pruneIniBackups',
          ok: true,
          result,
          requestId: msg.requestId
        }));
      } catch (e: any) {
        ws.send(JSON.stringify({
          type: 'pruneIniBackups',
          ok: false,
          error: e?.message || 'Failed to prune INI backups',
          requestId: msg.requestId
        }));
      }
    },
    deleteIniBackup: async (ws: WebSocket, msg: any) => {
      const { getProfiles } = this.context;
      try {
        const profiles = getProfiles();
        const profile = typeof msg.idx === 'number' ? profiles[msg.idx] : profiles.find((p: any) => `${p.host}:${p.port}` === msg.key);
        if (!profile) throw new Error('Profile not found');
        if (!profile.directory) throw new Error('Server directory not configured');
        if (!isSafeIniBackupFileName(msg.filename)) throw new Error('Invalid or unsafe backup filename');

        const result = deleteIniBackup(profile.directory, msg.filename);
        ws.send(JSON.stringify({
          type: 'deleteIniBackup',
          ok: true,
          result,
          deletedFile: result.deletedFile,
          requestId: msg.requestId
        }));
      } catch (e: any) {
        ws.send(JSON.stringify({
          type: 'deleteIniBackup',
          ok: false,
          error: e?.message || 'Failed to delete INI backup',
          requestId: msg.requestId
        }));
      }
    },
  };
}

