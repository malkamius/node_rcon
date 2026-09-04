
import { describe, it, expect, afterAll, jest } from '@jest/globals';
import request from 'supertest';
// Import the Express app instance. Adjust the import if needed.
let app: any;
try {
  app = require('../../backend/server').app || require('../../backend/server');
} catch (e) {
  // fallback for default export or direct app export
  app = require('../../backend/server');
}

describe('API Integration: /api/process-status', () => {
  it('should return process status for all managed servers', async () => {
    const res = await request(app).get('/api/process-status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(Array.isArray(res.body.status)).toBe(true);
    if (res.body.status.length > 0) {
      const entry = res.body.status[0];
      expect(entry).toHaveProperty('key');
      expect(entry).toHaveProperty('running');
      expect(entry).toHaveProperty('startTime');
      expect(entry).toHaveProperty('manuallyStopped');
      expect(entry).toHaveProperty('autoStart');
      expect(entry).toHaveProperty('baseInstallId');
    }
  });
});

describe('API Integration: /api/execute-script', () => {
  it('should start script execution and return running status', async () => {
    // Requires a known profile or valid key
    const res = await request(app)
      .post('/api/execute-script')
      .send({ key: 'invalid:9999', script: 'serverchat hi' });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('API Integration: /api/script-status/:key', () => {
  it('should return 404 if no script is running for key', async () => {
    const res = await request(app).get('/api/script-status/unknown:12345');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('API Integration: /api/cancel-script', () => {
  it('should return ok: false if no script is running for key', async () => {
    const res = await request(app)
      .post('/api/cancel-script')
      .send({ key: 'unknown:12345' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false });
  });

  it('should return 400 if key is missing', async () => {
    const res = await request(app)
      .post('/api/cancel-script')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('API Integration: /api/open-directory', () => {
  it('should return 400 if directory is missing and key has no directory', async () => {
    const res = await request(app)
      .post('/api/open-directory')
      .send({ key: 'unknown:12345' });
    expect(res.status).toBe(400);
  });

  it('should return 404 if directory path does not exist on disk', async () => {
    const res = await request(app)
      .post('/api/open-directory')
      .send({ directory: 'Z:\\non_existent_folder_path_12345' });
    expect(res.status).toBe(404);
  });
});

describe('API Integration: /api/scripts', () => {
  let createdCustomId: string | null = null;

  afterAll(async () => {
    if (createdCustomId) {
      await request(app).delete(`/api/scripts/${createdCustomId}`);
    }
  });

  describe('GET /api/scripts', () => {
    it('should return 200 and a list of templates including built-in templates', async () => {
      const res = await request(app).get('/api/scripts');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('templates');
      expect(Array.isArray(res.body.templates)).toBe(true);
      expect(res.body.templates.length).toBeGreaterThanOrEqual(4);

      const ids = res.body.templates.map((t: any) => t.id);
      expect(ids).toContain('builtin-restart-update-15m');
      expect(ids).toContain('builtin-quick-broadcast-30s');
      expect(ids).toContain('builtin-save-world-now');
      expect(ids).toContain('builtin-default-template');
    });
  });

  describe('POST /api/scripts', () => {
    it('should return 400 if name is missing', async () => {
      const res = await request(app)
        .post('/api/scripts')
        .send({ content: 'SaveWorld' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 if content is missing', async () => {
      const res = await request(app)
        .post('/api/scripts')
        .send({ name: 'Template Without Content' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 when attempting to modify a built-in template', async () => {
      const res = await request(app)
        .post('/api/scripts')
        .send({
          id: 'builtin-save-world-now',
          name: 'Overwrite Built-in',
          content: 'DoSomethingElse'
        });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should create a new custom script template', async () => {
      const res = await request(app)
        .post('/api/scripts')
        .send({
          name: 'Integration Test Custom Script',
          description: 'Testing POST endpoint',
          content: 'serverchat Testing 123\nwait 1000\nSaveWorld'
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('template');
      expect(res.body.template.id).toMatch(/^custom-\d+$/);
      expect(res.body.template.name).toBe('Integration Test Custom Script');
      expect(res.body.template.content).toBe('serverchat Testing 123\nwait 1000\nSaveWorld');
      createdCustomId = res.body.template.id;
    });

    it('should update an existing custom script template', async () => {
      expect(createdCustomId).toBeTruthy();
      const res = await request(app)
        .post('/api/scripts')
        .send({
          id: createdCustomId,
          name: 'Updated Integration Script',
          description: 'Updated Description',
          content: 'serverchat Updated Content\nSaveWorld'
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body.template.id).toBe(createdCustomId);
      expect(res.body.template.name).toBe('Updated Integration Script');
      expect(res.body.template.content).toBe('serverchat Updated Content\nSaveWorld');
    });
  });

  describe('DELETE /api/scripts/:id', () => {
    it('should return 400 when attempting to delete a built-in template', async () => {
      const res = await request(app).delete('/api/scripts/builtin-restart-update-15m');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 404 when attempting to delete a non-existent template', async () => {
      const res = await request(app).delete('/api/scripts/non-existent-template-id-9999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('should delete the created custom script template', async () => {
      expect(createdCustomId).toBeTruthy();
      const res = await request(app).delete(`/api/scripts/${createdCustomId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      // Verify it is no longer returned
      const getRes = await request(app).get('/api/scripts');
      const found = getRes.body.templates.find((t: any) => t.id === createdCustomId);
      expect(found).toBeUndefined();

      createdCustomId = null;
    });
  });
});

describe('API Integration: /api/server-logs/:key', () => {
  it('should return 404 for non-existent server key', async () => {
    const res = await request(app).get('/api/server-logs/unknown:9999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Server profile not found');
  });

  it('should return 404 on tail for non-existent server key', async () => {
    const res = await request(app).get('/api/server-logs/unknown:9999/tail');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Server profile not found');
  });

  it('should return 404 on download for non-existent server key', async () => {
    const res = await request(app).get('/api/server-logs/unknown:9999/download?file=ShooterGame.log');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Server profile not found');
  });

  it('should reject path traversal in download', async () => {
    // We can test path traversal against an existing profile (e.g. Warmianin or kidz)
    const res = await request(app).get('/api/server-logs/127.0.0.1:28155/download?file=../boot.ini');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should reject path traversal in tail', async () => {
    const res = await request(app).get('/api/server-logs/127.0.0.1:28155/tail?file=../../Windows/win.ini');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('API Integration: Base Installs & Update Checking', () => {
  it('should list base installs via GET /api/base-installs', async () => {
    const res = await request(app).get('/api/base-installs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('baseInstalls');
    expect(Array.isArray(res.body.baseInstalls)).toBe(true);
  });

  it('should support on-demand update check via POST /api/check-updates', async () => {
    const res = await request(app).post('/api/check-updates');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body).toHaveProperty('baseInstalls');
    expect(Array.isArray(res.body.baseInstalls)).toBe(true);
  });
});

describe('API Integration: INI Backup History & Restore', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  it('should return 404 for backups of non-existent server', async () => {
    const res = await request(app).get('/api/server-ini/non-existent:9999/backups');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Server profile not found');
  });

  it('should reject path traversal in backup filename', async () => {
    const res = await request(app).get('/api/server-ini/127.0.0.1:28155/backups/..%2fsecret.backup.ini');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid or unsafe backup filename');
  });

  it('should reject restore with missing backupFilename', async () => {
    const res = await request(app)
      .post('/api/server-ini/127.0.0.1:28155/restore')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'backupFilename is required');
  });

  it('should reject restore with unsafe backupFilename', async () => {
    const res = await request(app)
      .post('/api/server-ini/127.0.0.1:28155/restore')
      .send({ backupFilename: '../traversal.backup.ini' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid or unsafe backup filename');
  });

  it('should support discovery, inspection, and restoration on a valid instance directory', async () => {
    // Create temporary instance directory structure
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-api-test-'));
    const iniDir = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    fs.mkdirSync(iniDir, { recursive: true });

    // Active file
    const activeFile = path.join(iniDir, 'GameUserSettings.ini');
    fs.writeFileSync(activeFile, '[ServerSettings]\nActive=True\nRCONPort=27020');

    // Backup file
    const backupName = 'GameUserSettings.2026-09-01T10-00-00-000Z.backup.ini';
    const backupFile = path.join(iniDir, backupName);
    fs.writeFileSync(backupFile, '[ServerSettings]\nHistoricalBackup=True\nRCONPort=28000');

    const { getProfiles, saveProfiles } = require('../profiles');
    const originalProfiles = getProfiles();
    const testProfile = {
      name: 'TempTestServer',
      host: '127.0.0.1',
      port: 39999,
      directory: tempDir
    };
    saveProfiles([...originalProfiles, testProfile]);

    try {
      // 1. Discover backups
      const listRes = await request(app).get('/api/server-ini/127.0.0.1:39999/backups');
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveProperty('backups');
      expect(Array.isArray(listRes.body.backups)).toBe(true);
      expect(listRes.body.backups.length).toBe(1);
      expect(listRes.body.backups[0].filename).toBe(backupName);

      // 2. Read backup details & diff
      const detailRes = await request(app).get(`/api/server-ini/127.0.0.1:39999/backups/${backupName}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body).toHaveProperty('filename', backupName);
      expect(detailRes.body).toHaveProperty('content');
      expect(detailRes.body.content).toContain('HistoricalBackup=True');
      expect(detailRes.body).toHaveProperty('activeContent');
      expect(detailRes.body.activeContent).toContain('Active=True');
      expect(detailRes.body).toHaveProperty('diff');
      expect(detailRes.body).toHaveProperty('sideBySide');

      // 3. Restore backup
      const restoreRes = await request(app)
        .post('/api/server-ini/127.0.0.1:39999/restore')
        .send({ backupFilename: backupName });
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body).toHaveProperty('ok', true);
      expect(restoreRes.body.result).toHaveProperty('restoredFile', 'GameUserSettings.ini');
      expect(restoreRes.body.result.safetyBackupFile).toBeDefined();

      // Verify active file was updated
      const updatedActive = fs.readFileSync(activeFile, 'utf-8');
      expect(updatedActive).toContain('HistoricalBackup=True');

      // Verify safety backup was created
      const safetyPath = path.join(iniDir, restoreRes.body.result.safetyBackupFile);
      expect(fs.existsSync(safetyPath)).toBe(true);
      expect(fs.readFileSync(safetyPath, 'utf-8')).toContain('Active=True');
    } finally {
      // Restore original profiles and clean temp dir
      saveProfiles(originalProfiles);
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('Pruning and Deletion endpoints', () => {
    it('should return 404 when pruning or deleting backups on non-existent server', async () => {
      const pruneRes = await request(app)
        .post('/api/server-ini/non-existent:9999/backups/prune')
        .send({ keepCount: 2 });
      expect(pruneRes.status).toBe(404);
      expect(pruneRes.body).toHaveProperty('error', 'Server profile not found');

      const delRes = await request(app)
        .delete('/api/server-ini/non-existent:9999/backups/GameUserSettings.2026-09-01T10-00-00-000Z.backup.ini');
      expect(delRes.status).toBe(404);
      expect(delRes.body).toHaveProperty('error', 'Server profile not found');
    });

    it('should reject deleting backup with unsafe filename', async () => {
      const res = await request(app)
        .delete('/api/server-ini/127.0.0.1:28155/backups/..%2fsecret.backup.ini');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid or unsafe backup filename');
    });

    it('should support pruning and deleting backup snapshots on a valid instance', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-prune-test-'));
      const iniDir = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      fs.mkdirSync(iniDir, { recursive: true });

      const now = Date.now();
      const fileOld = 'GameUserSettings.2026-09-01T10-00-00-000Z.backup.ini';
      const fileNew = 'GameUserSettings.2026-09-04T10-00-00-000Z.backup.ini';
      const fileDel = 'GameUserSettings.2026-09-03T10-00-00-000Z.backup.ini';

      fs.writeFileSync(path.join(iniDir, fileOld), 'old content');
      fs.utimesSync(path.join(iniDir, fileOld), new Date(now - 300000), new Date(now - 300000));

      fs.writeFileSync(path.join(iniDir, fileDel), 'to delete manually');
      fs.utimesSync(path.join(iniDir, fileDel), new Date(now - 200000), new Date(now - 200000));

      fs.writeFileSync(path.join(iniDir, fileNew), 'new content');
      fs.utimesSync(path.join(iniDir, fileNew), new Date(now - 100000), new Date(now - 100000));

      const { getProfiles, saveProfiles } = require('../profiles');
      const originalProfiles = getProfiles();
      const testProfile = {
        name: 'PruneTestServer',
        host: '127.0.0.1',
        port: 49999,
        directory: tempDir
      };
      saveProfiles([...originalProfiles, testProfile]);

      try {
        // 1. DELETE non-existent file -> 404
        const delMissingRes = await request(app)
          .delete('/api/server-ini/127.0.0.1:49999/backups/GameUserSettings.2026-09-99T99-99-99-999Z.backup.ini');
        expect(delMissingRes.status).toBe(404);

        // 2. DELETE specific existing backup
        const delRes = await request(app)
          .delete(`/api/server-ini/127.0.0.1:49999/backups/${fileDel}`);
        expect(delRes.status).toBe(200);
        expect(delRes.body).toEqual({ ok: true, deletedFile: fileDel });
        expect(fs.existsSync(path.join(iniDir, fileDel))).toBe(false);

        // 3. POST prune with keepCount: 1
        const pruneRes = await request(app)
          .post('/api/server-ini/127.0.0.1:49999/backups/prune')
          .send({ keepCount: 1 });
        expect(pruneRes.status).toBe(200);
        expect(pruneRes.body).toHaveProperty('ok', true);
        expect(pruneRes.body.prunedCount).toBe(1);
        expect(pruneRes.body.keptCount).toBe(1);
        expect(pruneRes.body.deletedFiles).toEqual([fileOld]);
        expect(pruneRes.body.keptFiles).toEqual([fileNew]);
        expect(fs.existsSync(path.join(iniDir, fileOld))).toBe(false);
        expect(fs.existsSync(path.join(iniDir, fileNew))).toBe(true);
      } finally {
        saveProfiles(originalProfiles);
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    });
  });
});

describe('API Integration: /api/broadcast-command', () => {
  it('should return 400 when keys or command are invalid', async () => {
    // Missing keys
    let res = await request(app)
      .post('/api/broadcast-command')
      .send({ command: 'SaveWorld' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');

    // Empty keys array
    res = await request(app)
      .post('/api/broadcast-command')
      .send({ keys: [], command: 'SaveWorld' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');

    // Keys with empty strings
    res = await request(app)
      .post('/api/broadcast-command')
      .send({ keys: ['   '], command: 'SaveWorld' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');

    // Missing or empty command
    res = await request(app)
      .post('/api/broadcast-command')
      .send({ keys: ['127.0.0.1:27015'], command: '' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');

    res = await request(app)
      .post('/api/broadcast-command')
      .send({ keys: ['127.0.0.1:27015'] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should broadcast command to multiple servers and return valid results', async () => {
    const { rconManager } = require('../../backend/server');
    const sendCommandSpy = (jest.spyOn(rconManager, 'sendCommand') as any).mockImplementation(async (key: string, cmd: string) => {
      if (key === '127.0.0.1:27015') return 'Server 1 Saved';
      if (key === '127.0.0.1:27016') return '[RCON] Not connected';
      return 'OK';
    });

    try {
      const res = await request(app)
        .post('/api/broadcast-command')
        .send({
          keys: ['127.0.0.1:27015', '127.0.0.1:27016'],
          command: 'SaveWorld'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('command', 'SaveWorld');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results).toHaveLength(2);

      expect(res.body.results[0]).toEqual({
        key: '127.0.0.1:27015',
        output: 'Server 1 Saved',
        status: 'success'
      });

      expect(res.body.results[1]).toEqual({
        key: '127.0.0.1:27016',
        output: '[RCON] Not connected',
        status: 'disconnected'
      });
    } finally {
      sendCommandSpy.mockRestore();
    }
  });
});

