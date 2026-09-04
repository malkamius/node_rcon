import express from 'express';
import path from 'path';
import fs from 'fs';
import * as ini from './ark-ini';
import { getProfiles } from './profiles';
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
  deleteIniBackup,
  PruneIniBackupsOptions
} from './iniBackupManager';

const router = express.Router();

const AUDIT_LOG_PATH = path.join(__dirname, '../../logs/audit.log');
function auditLog(event: string, details: any) {
  try {
    const entry = {
      time: new Date().toISOString(),
      event,
      ...details
    };
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch {}
}

export function resolveProfile(keyOrIdx: string): any {
  let profiles: any[] = [];
  try {
    profiles = getProfiles();
  } catch {}
  if (!profiles || profiles.length === 0) {
    try {
      const configRaw = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf-8');
      profiles = JSON.parse(configRaw).profiles || [];
    } catch {}
  }
  if (/^\d+$/.test(keyOrIdx)) {
    const idx = parseInt(keyOrIdx, 10);
    if (profiles[idx]) {
      return profiles[idx];
    }
  }
  const match = profiles.find((p: any) => `${p.host}:${p.port}` === keyOrIdx || p.name === keyOrIdx);
  return match || null;
}


/**
 * Get the path to an INI file for a specific server.
 * @param server The server object containing its directory, or directory string.
 * @param file The name of the INI file.
 * @returns The full path to the INI file.
 */
export function getIniPath(server: any, file: string): string {
  const directory = typeof server === 'string' ? server : server?.directory;
  if (!directory) throw new Error('No directory set for server');
  // For ARK servers, ini files are under ShooterGame\Saved\Config\WindowsServer\
  return path.join(directory, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', file);
}

/**
 * Get INI file as object for a given profile and file name
 */
export async function getIni(profile: any, file: string): Promise<any> {
  const iniPath = getIniPath(profile, file);
  if (!fs.existsSync(iniPath)) return {};
  const iniRaw = fs.readFileSync(iniPath, 'utf-8');
  return ini.decode(iniRaw);
}

/**
 * Save INI object to file for a given profile and file name
 */
export async function saveIni(profile: any, file: string, iniObj: any): Promise<void> {
  const iniPath = getIniPath(profile, file);
  const iniStr = ini.encode(iniObj, { whitespace: false });
  fs.mkdirSync(path.dirname(iniPath), { recursive: true });
  fs.writeFileSync(iniPath, iniStr, 'utf-8');
}

/**
 * Deep merge helper: merges b into a, returns new object
 * Returns merged object with new values overwriting old, but old keys not in new are preserved
 * Handles DuplicateEntry and arrays
 */
export function deepMerge(a: any, b: any): any {
  // Handle null/undefined
  if (a === undefined || a === null) return b;
  if (b === undefined || b === null) return a;

  // Handle DuplicateEntry type
  const isDup = (v: any) => v && typeof v === 'object' && v.__duplicate === true && Array.isArray(v.values);

  // If both are DuplicateEntry, merge their values
  if (isDup(a) && isDup(b)) {
    return { __duplicate: true, values: [...a.values, ...b.values] };
  }
  // If one is DuplicateEntry, one is scalar
  if (isDup(a)) {
    return { __duplicate: true, values: [...a.values, b] };
  }
  if (isDup(b)) {
    return { __duplicate: true, values: [a, ...b.values] };
  }
  // If both are arrays (bracketed key arrays), merge arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...a, ...b];
  }
  // If one is array, one is scalar, merge as array
  if (Array.isArray(a)) {
    return [...a, b];
  }
  if (Array.isArray(b)) {
    return [a, ...b];
  }
  // If both are objects (sections), merge recursively
  if (typeof a === 'object' && typeof b === 'object') {
    const result: any = { ...a };
    for (const key of Object.keys(b)) {
      result[key] = deepMerge(a[key], b[key]);
    }
    return result;
  }
  // Otherwise, use b (new value overwrites old)
  return b;
}

/**
 * Synchronize RCON settings (RCONEnabled, RCONPort, ServerAdminPassword) into GameUserSettings.ini.
 * Preserves all other sections, keys, and comments in the file.
 * Creates a timestamped backup before writing if file already exists.
 */
export function syncRconSettingsToIni(
  serverOrDir: any,
  port: number | string,
  password?: string
): { success: boolean; path: string; error?: string } {
  let iniPath = '';
  try {
    const directory = typeof serverOrDir === 'string' ? serverOrDir : serverOrDir?.directory;
    if (!directory) {
      return { success: false, path: '', error: 'No directory provided' };
    }

    iniPath = path.join(directory, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', 'GameUserSettings.ini');
    const dir = path.dirname(iniPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fileExists = fs.existsSync(iniPath);
    let rawContent = '';

    if (fileExists) {
      const date = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `GameUserSettings.${date}.backup.ini`;
      const backupPath = path.join(dir, backupName);
      fs.copyFileSync(iniPath, backupPath);
      rawContent = fs.readFileSync(iniPath, 'utf-8');
    }

    const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
    let lines = rawContent.length > 0 ? rawContent.split(/\r?\n/) : [];

    // Find [ServerSettings] section
    let serverSettingsIdx = -1;
    let nextSectionIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^\[ServerSettings\]$/i.test(line)) {
        serverSettingsIdx = i;
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\[.*\]$/.test(lines[j].trim())) {
            nextSectionIdx = j;
            break;
          }
        }
        break;
      }
    }

    if (serverSettingsIdx === -1) {
      // Section does not exist - append it
      const toAdd = [
        '[ServerSettings]',
        'RCONEnabled=True',
        `RCONPort=${port}`
      ];
      if (password !== undefined && password !== null) {
        toAdd.push(`ServerAdminPassword=${password}`);
      }

      if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
        lines.push('');
      }
      lines.push(...toAdd);
    } else {
      // Section exists - search for keys within [ServerSettings]
      const endIdx = nextSectionIdx !== -1 ? nextSectionIdx : lines.length;
      let rconEnabledIdx = -1;
      let rconPortIdx = -1;
      let adminPasswordIdx = -1;

      for (let i = serverSettingsIdx + 1; i < endIdx; i++) {
        const trimmed = lines[i].trim();
        // Ignore comments
        if (/^[;#]/.test(trimmed)) continue;

        if (/^RCONEnabled\s*=/i.test(trimmed)) {
          rconEnabledIdx = i;
        } else if (/^RCONPort\s*=/i.test(trimmed)) {
          rconPortIdx = i;
        } else if (/^ServerAdminPassword\s*=/i.test(trimmed)) {
          adminPasswordIdx = i;
        }
      }

      // Update existing keys
      if (rconEnabledIdx !== -1) {
        lines[rconEnabledIdx] = 'RCONEnabled=True';
      }
      if (rconPortIdx !== -1) {
        lines[rconPortIdx] = `RCONPort=${port}`;
      }
      if (password !== undefined && password !== null && adminPasswordIdx !== -1) {
        lines[adminPasswordIdx] = `ServerAdminPassword=${password}`;
      }

      // Insert missing keys
      const toInsert: string[] = [];
      if (rconEnabledIdx === -1) {
        toInsert.push('RCONEnabled=True');
      }
      if (rconPortIdx === -1) {
        toInsert.push(`RCONPort=${port}`);
      }
      if (password !== undefined && password !== null && adminPasswordIdx === -1) {
        toInsert.push(`ServerAdminPassword=${password}`);
      }

      if (toInsert.length > 0) {
        lines.splice(serverSettingsIdx + 1, 0, ...toInsert);
      }
    }

    let updatedContent = lines.join(eol);
    if (!updatedContent.endsWith(eol)) {
      updatedContent += eol;
    }

    fs.writeFileSync(iniPath, updatedContent, 'utf-8');

    return { success: true, path: iniPath };
  } catch (e: any) {
    return { success: false, path: iniPath, error: e?.message || String(e) };
  }
}

// GET /api/server-ini/:keyOrIdx/backups - List all backups for server
router.get('/api/server-ini/:keyOrIdx/backups', (req, res) => {
  const { keyOrIdx } = req.params;
  const file = req.query.file as string | undefined;

  const profile = resolveProfile(keyOrIdx);
  if (!profile) {
    return res.status(404).json({ error: 'Server profile not found' });
  }
  if (!profile.directory) {
    return res.status(400).json({ error: 'Server directory not configured' });
  }

  try {
    const backups = listIniBackups(profile.directory, file);
    res.json({ backups, directory: profile.directory });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to list INI backups' });
  }
});

// GET /api/server-ini/:keyOrIdx/backups/:filename - Get backup content & compare with active INI
router.get('/api/server-ini/:keyOrIdx/backups/:filename', (req, res) => {
  const { keyOrIdx, filename } = req.params;

  const profile = resolveProfile(keyOrIdx);
  if (!profile) {
    return res.status(404).json({ error: 'Server profile not found' });
  }
  if (!profile.directory) {
    return res.status(400).json({ error: 'Server directory not configured' });
  }

  if (!isSafeIniBackupFileName(filename)) {
    return res.status(400).json({ error: 'Invalid or unsafe backup filename' });
  }

  try {
    const backupData = getIniBackupContent(profile.directory, filename);
    const baseFile = getBaseFileNameFromBackup(filename);
    const activeData = getActiveIniContent(profile.directory, baseFile);
    const diff = computeLineDiff(backupData.content, activeData.content);
    const sideBySide = computeSideBySideDiff(backupData.content, activeData.content);

    res.json({
      ...backupData,
      baseFile,
      activeContent: activeData.content,
      activeExists: activeData.exists,
      diff,
      sideBySide
    });
  } catch (e: any) {
    const status = e?.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: e?.message || 'Failed to read backup content' });
  }
});

// POST /api/server-ini/:keyOrIdx/restore - Restore backup to active INI
router.post('/api/server-ini/:keyOrIdx/restore', express.json(), (req, res) => {
  const { keyOrIdx } = req.params;
  const { backupFilename } = req.body || {};

  if (!backupFilename || typeof backupFilename !== 'string') {
    return res.status(400).json({ error: 'backupFilename is required' });
  }

  if (!isSafeIniBackupFileName(backupFilename)) {
    return res.status(400).json({ error: 'Invalid or unsafe backup filename' });
  }

  const profile = resolveProfile(keyOrIdx);
  if (!profile) {
    return res.status(404).json({ error: 'Server profile not found' });
  }
  if (!profile.directory) {
    return res.status(400).json({ error: 'Server directory not configured' });
  }

  try {
    const result = restoreIniBackup(profile.directory, backupFilename);
    auditLog('ini_restore', {
      key: `${profile.host}:${profile.port}`,
      profileName: profile.name,
      directory: profile.directory,
      backupFilename,
      restoredFile: result.restoredFile,
      safetyBackupFile: result.safetyBackupFile
    });
    res.json({ ok: true, result });
  } catch (e: any) {
    auditLog('ini_restore_error', {
      key: `${profile.host}:${profile.port}`,
      backupFilename,
      error: e?.message || String(e)
    });
    const status = e?.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: e?.message || 'Failed to restore INI backup' });
  }
});

// POST /api/server-ini/:keyOrIdx/backups/prune - Prune backups based on retention policy
router.post('/api/server-ini/:keyOrIdx/backups/prune', express.json(), (req, res) => {
  const { keyOrIdx } = req.params;

  const profile = resolveProfile(keyOrIdx);
  if (!profile) {
    return res.status(404).json({ error: 'Server profile not found' });
  }
  if (!profile.directory) {
    return res.status(400).json({ error: 'Server directory not configured' });
  }

  try {
    const result = pruneIniBackups(profile.directory, req.body);
    auditLog('ini_backups_pruned', { key: `${profile.host}:${profile.port}`, ...result });
    res.json({ ...result, ok: result.ok ?? true });
  } catch (e: any) {
    auditLog('ini_backups_prune_error', {
      key: `${profile.host}:${profile.port}`,
      error: e?.message || String(e)
    });
    res.status(500).json({ error: e?.message || 'Failed to prune INI backups' });
  }
});

// DELETE /api/server-ini/:keyOrIdx/backups/:filename - Delete a specific backup snapshot
router.delete('/api/server-ini/:keyOrIdx/backups/:filename', (req, res) => {
  const { keyOrIdx, filename } = req.params;

  const profile = resolveProfile(keyOrIdx);
  if (!profile) {
    return res.status(404).json({ error: 'Server profile not found' });
  }
  if (!profile.directory) {
    return res.status(400).json({ error: 'Server directory not configured' });
  }

  if (!isSafeIniBackupFileName(filename)) {
    return res.status(400).json({ error: 'Invalid or unsafe backup filename' });
  }

  try {
    const result = deleteIniBackup(profile.directory, filename);
    auditLog('ini_backup_deleted', { key: `${profile.host}:${profile.port}`, filename });
    res.json({ ok: true, deletedFile: filename });
  } catch (e: any) {
    auditLog('ini_backup_delete_error', {
      key: `${profile.host}:${profile.port}`,
      filename,
      error: e?.message || String(e)
    });
    const status = e?.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: e?.message || 'Failed to delete INI backup' });
  }
});

// GET INI file as JSON
router.get('/api/server-ini/:profileIdx/:file', (req, res) => {
  const { profileIdx, file } = req.params;
  let profiles;
  try {
    const configRaw = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf-8');
    profiles = JSON.parse(configRaw).profiles;
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read config.json' });
  }
  const idx = parseInt(profileIdx, 10);
  if (isNaN(idx) || !profiles[idx]) return res.status(404).json({ error: 'Profile not found' });
  try {
    const iniPath = getIniPath(profiles[idx], file);
    if (!fs.existsSync(iniPath)) return res.json({});
    const iniRaw = fs.readFileSync(iniPath, 'utf-8');
    const iniObj = ini.decode(iniRaw);
    res.json(iniObj);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST (save) INI file from JSON
router.post('/api/server-ini/:profileIdx/:file', express.json(), (req, res) => {
  const { profileIdx, file } = req.params;
  let profiles;
  try {
    const configRaw = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf-8');
    profiles = JSON.parse(configRaw).profiles;
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read config.json' });
  }
  const idx = parseInt(profileIdx, 10);
  if (isNaN(idx) || !profiles[idx]) return res.status(404).json({ error: 'Profile not found' });
  try {
    const iniPath = getIniPath(profiles[idx], file);
    let mergedIni = {};
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.dirname(iniPath);
    const base = path.basename(iniPath, '.ini');

    if (fs.existsSync(iniPath)) {
      const backupName = `${base}.${date}.backup.ini`;
      const backupPath = path.join(dir, backupName);
      fs.copyFileSync(iniPath, backupPath);
      // Read and merge existing INI
      const iniRaw = fs.readFileSync(iniPath, 'utf-8');
      const iniObj = ini.decode(iniRaw);
      // Deep merge: new values overwrite old, but old keys not in new are preserved
      mergedIni = deepMerge(iniObj, req.body);
    } else {
      mergedIni = req.body;
    }
    // Convert merged object back to INI format
    // Use whitespace: false to avoid extra spaces in the output
    const iniStr = ini.encode(mergedIni, { whitespace: false });
    // Make directory if it doesn't exist
    fs.mkdirSync(path.dirname(iniPath), { recursive: true });
    fs.writeFileSync(iniPath, iniStr, 'utf-8');

    const updated_settings_name = `${base}.${date}.updated.ini`;

    // write updated INI to a new file with timestamp in case the server is running and overwrites the updated file
    fs.writeFileSync(path.join(dir, updated_settings_name), iniStr, 'utf-8');
    console.log(`INI file saved: ${iniPath}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;


