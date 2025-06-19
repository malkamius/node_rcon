import express from 'express';
import path from 'path';
import fs from 'fs';
import ini from 'ini';

const router = express.Router();

// Helper to get INI file path for a server

/**
 * Get the path to an INI file for a specific server.
 * @param server The server object containing its directory.
 * @param file The name of the INI file.
 * @returns The full path to the INI file.
 */
function getIniPath(server: any, file: string): string {
  if (!server.directory) throw new Error('No directory set for server');
  // For ARK servers, ini files are under ShooterGame\Saved\Config\WindowsServer\
  return path.join(server.directory, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', file);
}

// GET INI file as JSON
router.get('/api/server-ini/:profileIdx/:file', (req, res) => {
  const { profileIdx, file } = req.params;
  const profiles = require('../../config.json').servers;
  const idx = parseInt(profileIdx, 10);
  if (isNaN(idx) || !profiles[idx]) return res.status(404).json({ error: 'Profile not found' });
  try {
    const iniPath = getIniPath(profiles[idx], file);
    if (!fs.existsSync(iniPath)) return res.json({});
    const iniRaw = fs.readFileSync(iniPath, 'utf-8');
    const iniObj = ini.decode(iniRaw);
    res.json(iniObj);
  } catch (e : any) {
    res.status(500).json({ error: e.message });
  }
});

// POST (save) INI file from JSON
router.post('/api/server-ini/:profileIdx/:file', express.json(), (req, res) => {
    const { profileIdx, file } = req.params;
    const profiles = require('../../config.json').servers;
    const idx = parseInt(profileIdx, 10);
    if (isNaN(idx) || !profiles[idx]) return res.status(404).json({ error: 'Profile not found' });
    try {
        const iniPath = getIniPath(profiles[idx], file);
        // Backup existing file if it exists
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
    } catch (e : any) {
        res.status(500).json({ error: e.message });
    }
    // Deep merge helper: merges b into a, returns new object
    function deepMerge(a: any, b: any): any {
        if (typeof a !== 'object' || a === null) return b;
        if (typeof b !== 'object' || b === null) return a;
        const result: any = Array.isArray(a) ? [...a] : { ...a };
        for (const key of Object.keys(b)) {
            if (b[key] && typeof b[key] === 'object' && !Array.isArray(b[key])) {
                result[key] = deepMerge(a[key], b[key]);
            } else {
            result[key] = b[key];
            }
        }
        return result;
    }
});

export default router;
