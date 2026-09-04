import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getIniDir,
  isSafeIniBackupFileName,
  getBaseFileNameFromBackup,
  parseTimestampFromBackupName,
  formatBackupDate,
  listIniBackups,
  getIniBackupContent,
  getActiveIniContent,
  restoreIniBackup,
  computeLineDiff,
  computeSideBySideDiff,
  pruneIniBackups,
  deleteIniBackup
} from '../iniBackupManager';

describe('Priority 8: INI Backup History & Version Restore (iniBackupManager)', () => {
  let tempDir: string;
  let iniDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ini-backup-test-'));
    iniDir = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    fs.mkdirSync(iniDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getIniDir', () => {
    it('resolves correct WindowsServer path from string directory', () => {
      const resolved = getIniDir(tempDir);
      expect(resolved).toBe(path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer'));
    });

    it('resolves correct path from profile object with directory property', () => {
      const resolved = getIniDir({ directory: tempDir });
      expect(resolved).toBe(path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer'));
    });

    it('throws when directory is missing or invalid', () => {
      expect(() => getIniDir(null)).toThrow('No directory set for server');
      expect(() => getIniDir({})).toThrow('No directory set for server');
    });
  });

  describe('isSafeIniBackupFileName', () => {
    it('accepts valid backup filenames', () => {
      expect(isSafeIniBackupFileName('GameUserSettings.2026-09-04T12-30-00-000Z.backup.ini')).toBe(true);
      expect(isSafeIniBackupFileName('Game.2026-09-04T12-30-00-000Z.backup.ini')).toBe(true);
      expect(isSafeIniBackupFileName('GameUserSettings.2026-09-04T12-30-00-000Z.pre-restore.backup.ini')).toBe(true);
      expect(isSafeIniBackupFileName('Engine.2026-09-04T12-30-00-000Z.safety.backup.ini')).toBe(true);
    });

    it('rejects traversal attempts and unsafe characters', () => {
      expect(isSafeIniBackupFileName('../GameUserSettings.2026.backup.ini')).toBe(false);
      expect(isSafeIniBackupFileName('..\\GameUserSettings.2026.backup.ini')).toBe(false);
      expect(isSafeIniBackupFileName('/etc/GameUserSettings.backup.ini')).toBe(false);
      expect(isSafeIniBackupFileName('C:\\secret\\file.backup.ini')).toBe(false);
      expect(isSafeIniBackupFileName('GameUserSettings.ini')).toBe(false); // not .backup.ini
      expect(isSafeIniBackupFileName('GameUserSettings.txt')).toBe(false);
      expect(isSafeIniBackupFileName('')).toBe(false);
      expect(isSafeIniBackupFileName(null as any)).toBe(false);
    });
  });

  describe('getBaseFileNameFromBackup', () => {
    it('maps backup filenames to their corresponding base INI filenames', () => {
      expect(getBaseFileNameFromBackup('GameUserSettings.2026-09-04T12-00-00-000Z.backup.ini')).toBe('GameUserSettings.ini');
      expect(getBaseFileNameFromBackup('GameUserSettings.2026-09-04T12-00-00-000Z.pre-restore.backup.ini')).toBe('GameUserSettings.ini');
      expect(getBaseFileNameFromBackup('Game.2026-09-04T12-00-00-000Z.backup.ini')).toBe('Game.ini');
      expect(getBaseFileNameFromBackup('Engine.2026-09-04T12-00-00-000Z.backup.ini')).toBe('Engine.ini');
    });
  });

  describe('parseTimestampFromBackupName and formatBackupDate', () => {
    it('extracts ISO timestamp from valid backup name', () => {
      const ts = parseTimestampFromBackupName('GameUserSettings.2026-09-04T12-30-15-123Z.backup.ini');
      expect(ts).toBe('2026-09-04T12:30:15.123Z');
    });

    it('formats timestamp to human-readable string without throwing', () => {
      const formatted = formatBackupDate('2026-09-04T12:30:15.123Z');
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(5);
    });
  });

  describe('listIniBackups', () => {
    it('returns empty array when directory does not exist or has no backups', () => {
      const nonExistent = path.join(tempDir, 'does-not-exist');
      expect(listIniBackups(nonExistent)).toEqual([]);
      expect(listIniBackups(tempDir)).toEqual([]);
    });

    it('enumerates and sorts backup files newest first with safety classification', () => {
      const now = Date.now();
      const file1 = 'GameUserSettings.2026-09-01T10-00-00-000Z.backup.ini';
      const file2 = 'GameUserSettings.2026-09-04T12-00-00-000Z.backup.ini';
      const file3 = 'GameUserSettings.2026-09-04T13-00-00-000Z.pre-restore.backup.ini';
      const file4 = 'Game.2026-09-02T11-00-00-000Z.backup.ini';
      const normalFile = 'GameUserSettings.ini';

      fs.writeFileSync(path.join(iniDir, file1), '[ServerSettings]\nDifficultyOffset=1.0');
      fs.utimesSync(path.join(iniDir, file1), new Date(now - 300000), new Date(now - 300000));

      fs.writeFileSync(path.join(iniDir, file2), '[ServerSettings]\nDifficultyOffset=1.5');
      fs.utimesSync(path.join(iniDir, file2), new Date(now - 100000), new Date(now - 100000));

      fs.writeFileSync(path.join(iniDir, file3), '[ServerSettings]\nDifficultyOffset=2.0');
      fs.utimesSync(path.join(iniDir, file3), new Date(now), new Date(now));

      fs.writeFileSync(path.join(iniDir, file4), '[/Script/ShooterGame.ShooterGameMode]\nGlobalSpoilingTimeMultiplier=1');
      fs.utimesSync(path.join(iniDir, file4), new Date(now - 200000), new Date(now - 200000));

      fs.writeFileSync(path.join(iniDir, normalFile), '[ServerSettings]\nActive=True');

      // List all backups
      const allBackups = listIniBackups(tempDir);
      expect(allBackups.length).toBe(4);
      // Newest first: file3, then file2, then file4, then file1
      expect(allBackups[0].filename).toBe(file3);
      expect(allBackups[0].isSafetyBackup).toBe(true);
      expect(allBackups[1].filename).toBe(file2);
      expect(allBackups[1].isSafetyBackup).toBe(false);
      expect(allBackups[2].filename).toBe(file4);
      expect(allBackups[3].filename).toBe(file1);

      // Filter by GameUserSettings.ini
      const gusBackups = listIniBackups(tempDir, 'GameUserSettings.ini');
      expect(gusBackups.length).toBe(3);
      expect(gusBackups.every(b => b.baseFile === 'GameUserSettings.ini')).toBe(true);

      // Filter by Game.ini
      const gameBackups = listIniBackups(tempDir, 'Game.ini');
      expect(gameBackups.length).toBe(1);
      expect(gameBackups[0].filename).toBe(file4);
      expect(gameBackups[0].baseFile === 'Game.ini').toBe(true);
    });
  });

  describe('getIniBackupContent and getActiveIniContent', () => {
    it('reads backup file content and metadata accurately', () => {
      const filename = 'GameUserSettings.2026-09-04T12-00-00-000Z.backup.ini';
      const sampleText = '[ServerSettings]\nRCONPort=27020\nServerPassword=secret';
      fs.writeFileSync(path.join(iniDir, filename), sampleText);

      const res = getIniBackupContent(tempDir, filename);
      expect(res.filename).toBe(filename);
      expect(res.content).toBe(sampleText);
      expect(res.size).toBe(Buffer.byteLength(sampleText));
      expect(res.isSafetyBackup).toBe(false);
    });

    it('reads active INI content if it exists', () => {
      const activeText = '[ServerSettings]\nRCONPort=28000\n';
      fs.writeFileSync(path.join(iniDir, 'GameUserSettings.ini'), activeText);

      const res = getActiveIniContent(tempDir, 'GameUserSettings.ini');
      expect(res.exists).toBe(true);
      expect(res.content).toBe(activeText);
      expect(res.baseFile).toBe('GameUserSettings.ini');
    });

    it('returns empty content when active INI does not exist', () => {
      const res = getActiveIniContent(tempDir, 'Game.ini');
      expect(res.exists).toBe(false);
      expect(res.content).toBe('');
    });

    it('throws error for unsafe or non-existent backup filename', () => {
      expect(() => getIniBackupContent(tempDir, '../secret.backup.ini')).toThrow();
      expect(() => getIniBackupContent(tempDir, 'GameUserSettings.missing.backup.ini')).toThrow('Backup file not found');
    });
  });

  describe('restoreIniBackup', () => {
    it('creates pre-restore safety snapshot and restores backup content to active file', () => {
      const activeFilePath = path.join(iniDir, 'GameUserSettings.ini');
      const currentActiveContent = '[ServerSettings]\nCurrentActive=1\nActiveTimestamp=now';
      fs.writeFileSync(activeFilePath, currentActiveContent);

      const backupFilename = 'GameUserSettings.2026-09-01T10-00-00-000Z.backup.ini';
      const historicalBackupContent = '[ServerSettings]\nHistoricalBackup=1\nDifficultyOffset=1.0';
      fs.writeFileSync(path.join(iniDir, backupFilename), historicalBackupContent);

      const result = restoreIniBackup(tempDir, backupFilename);

      expect(result.success).toBe(true);
      expect(result.restoredFile).toBe('GameUserSettings.ini');
      expect(result.backupFilename).toBe(backupFilename);
      expect(result.safetyBackupFile).toBeDefined();
      expect(result.safetyBackupFile).toContain('.pre-restore.backup.ini');

      // Check that safety backup contains the previous active content
      const safetyBackupPath = path.join(iniDir, result.safetyBackupFile!);
      expect(fs.existsSync(safetyBackupPath)).toBe(true);
      expect(fs.readFileSync(safetyBackupPath, 'utf-8')).toBe(currentActiveContent);

      // Check that active file now has the restored content
      const newActive = fs.readFileSync(activeFilePath, 'utf-8');
      expect(newActive).toBe(historicalBackupContent);
      expect(result.activeContent).toBe(historicalBackupContent);
    });

    it('restores even if active file did not previously exist', () => {
      const backupFilename = 'Game.2026-09-01T10-00-00-000Z.backup.ini';
      const historicalContent = '[/Script/ShooterGame.ShooterGameMode]\nEggHatchSpeedMultiplier=5';
      fs.writeFileSync(path.join(iniDir, backupFilename), historicalContent);

      const result = restoreIniBackup(tempDir, backupFilename);
      expect(result.success).toBe(true);
      expect(result.safetyBackupFile).toBeUndefined(); // No safety backup needed if file didn't exist

      const activeGameIni = path.join(iniDir, 'Game.ini');
      expect(fs.existsSync(activeGameIni)).toBe(true);
      expect(fs.readFileSync(activeGameIni, 'utf-8')).toBe(historicalContent);
    });

    it('throws error for non-existent or unsafe backup file', () => {
      expect(() => restoreIniBackup(tempDir, 'GameUserSettings.missing.backup.ini')).toThrow();
      expect(() => restoreIniBackup(tempDir, '../GameUserSettings.backup.ini')).toThrow();
    });
  });

  describe('computeLineDiff and computeSideBySideDiff', () => {
    it('computes unchanged diff when files are identical', () => {
      const text = '[ServerSettings]\nDifficultyOffset=1.0\nMaxPlayers=50';
      const diff = computeLineDiff(text, text);

      expect(diff.length).toBe(3);
      expect(diff.every(d => d.type === 'unchanged')).toBe(true);
      expect(diff[0].content).toBe('[ServerSettings]');
    });

    it('computes additions and deletions accurately', () => {
      const oldText = '[ServerSettings]\nDifficultyOffset=1.0\nMaxPlayers=50';
      const newText = '[ServerSettings]\nDifficultyOffset=1.5\nMaxPlayers=50\nNewKey=Value';

      const diff = computeLineDiff(oldText, newText);

      const added = diff.filter(d => d.type === 'added');
      const removed = diff.filter(d => d.type === 'removed');
      const unchanged = diff.filter(d => d.type === 'unchanged');

      expect(removed.some(d => d.content === 'DifficultyOffset=1.0')).toBe(true);
      expect(added.some(d => d.content === 'DifficultyOffset=1.5')).toBe(true);
      expect(added.some(d => d.content === 'NewKey=Value')).toBe(true);
      expect(unchanged.some(d => d.content === 'MaxPlayers=50')).toBe(true);
    });

    it('computes side-by-side rows aligning unchanged, added, and removed lines', () => {
      const oldText = 'LineA\nLineB\nLineC';
      const newText = 'LineA\nLineB_modified\nLineC\nLineD';

      const rows = computeSideBySideDiff(oldText, newText);
      expect(rows.length).toBeGreaterThanOrEqual(4);

      // First row should be unchanged LineA
      expect(rows[0].left?.type).toBe('unchanged');
      expect(rows[0].right?.type).toBe('unchanged');
      expect(rows[0].left?.content).toBe('LineA');
      expect(rows[0].right?.content).toBe('LineA');

      // Addition LineD at the end
      const lastRow = rows[rows.length - 1];
      expect(lastRow.right?.content).toBe('LineD');
      expect(lastRow.right?.type).toBe('added');
    });

    it('handles empty inputs gracefully', () => {
      const diff = computeLineDiff('', '');
      expect(diff).toEqual([]);
      const sbs = computeSideBySideDiff('', '');
      expect(sbs).toEqual([]);
    });
  });

  describe('deleteIniBackup', () => {
    it('deletes an existing safe backup file and returns success', () => {
      const backupFile = 'GameUserSettings.2026-09-04T12-00-00-000Z.backup.ini';
      const fullPath = path.join(iniDir, backupFile);
      fs.writeFileSync(fullPath, '[ServerSettings]\nKey=Value');
      expect(fs.existsSync(fullPath)).toBe(true);

      const result = deleteIniBackup(tempDir, backupFile);
      expect(result).toEqual({ success: true, deletedFile: backupFile });
      expect(fs.existsSync(fullPath)).toBe(false);
    });

    it('throws error for unsafe or invalid backup filenames', () => {
      expect(() => deleteIniBackup(tempDir, '../GameUserSettings.backup.ini')).toThrow(
        'Invalid or unsafe backup filename'
      );
      expect(() => deleteIniBackup(tempDir, 'GameUserSettings.ini')).toThrow(
        'Invalid or unsafe backup filename'
      );
      expect(() => deleteIniBackup(tempDir, 'traversal\\..\\bad.backup.ini')).toThrow(
        'Invalid or unsafe backup filename'
      );
    });

    it('throws error when backup file does not exist', () => {
      expect(() =>
        deleteIniBackup(tempDir, 'GameUserSettings.2026-09-04T12-00-00-000Z.backup.ini')
      ).toThrow('Backup file not found');
    });
  });

  describe('pruneIniBackups', () => {
    it('prunes backups based on keepCount (keeps newest, deletes oldest)', () => {
      const now = Date.now();
      const files = [
        'GameUserSettings.2026-09-01T01-00-00-000Z.backup.ini',
        'GameUserSettings.2026-09-01T02-00-00-000Z.backup.ini',
        'GameUserSettings.2026-09-01T03-00-00-000Z.backup.ini',
        'GameUserSettings.2026-09-01T04-00-00-000Z.backup.ini',
        'GameUserSettings.2026-09-01T05-00-00-000Z.backup.ini'
      ];

      files.forEach((file, index) => {
        const p = path.join(iniDir, file);
        fs.writeFileSync(p, `content ${index}`);
        const mtime = new Date(now - (5 - index) * 100000);
        fs.utimesSync(p, mtime, mtime);
      });

      // Keep only 2 newest backups
      const result = pruneIniBackups(tempDir, { keepCount: 2 });
      expect(result.ok).toBe(true);
      expect(result.prunedCount).toBe(3);
      expect(result.keptCount).toBe(2);
      expect(result.keptFiles).toEqual([files[4], files[3]]);
      expect(result.deletedFiles).toEqual([files[2], files[1], files[0]]);

      // Verify files on disk
      expect(fs.existsSync(path.join(iniDir, files[4]))).toBe(true);
      expect(fs.existsSync(path.join(iniDir, files[3]))).toBe(true);
      expect(fs.existsSync(path.join(iniDir, files[2]))).toBe(false);
      expect(fs.existsSync(path.join(iniDir, files[1]))).toBe(false);
      expect(fs.existsSync(path.join(iniDir, files[0]))).toBe(false);
    });

    it('defaults keepCount to 10 when neither keepCount nor olderThanDays is provided', () => {
      const now = Date.now();
      const files: string[] = [];
      for (let i = 0; i < 12; i++) {
        const hour = i.toString().padStart(2, '0');
        const filename = `GameUserSettings.2026-09-01T${hour}-00-00-000Z.backup.ini`;
        files.push(filename);
        const p = path.join(iniDir, filename);
        fs.writeFileSync(p, `content ${i}`);
        const mtime = new Date(now - (12 - i) * 60000);
        fs.utimesSync(p, mtime, mtime);
      }

      const result = pruneIniBackups(tempDir);
      expect(result.ok).toBe(true);
      expect(result.prunedCount).toBe(2);
      expect(result.keptCount).toBe(10);
      expect(result.deletedFiles.length).toBe(2);
      expect(result.keptFiles.length).toBe(10);
      // The 2 oldest should be deleted
      expect(fs.existsSync(path.join(iniDir, files[0]))).toBe(false);
      expect(fs.existsSync(path.join(iniDir, files[1]))).toBe(false);
      // The rest should be kept
      expect(fs.existsSync(path.join(iniDir, files[11]))).toBe(true);
    });

    it('preserves safety backups by default and when preserveSafetyBackups is true', () => {
      const now = Date.now();
      const regularOld = 'GameUserSettings.2026-08-01T10-00-00-000Z.backup.ini';
      const regularNew = 'GameUserSettings.2026-09-01T10-00-00-000Z.backup.ini';
      const safetyOld = 'GameUserSettings.2026-08-01T11-00-00-000Z.pre-restore.backup.ini';
      const safetyOther = 'GameUserSettings.2026-08-02T11-00-00-000Z.safety.backup.ini';

      [regularOld, regularNew, safetyOld, safetyOther].forEach((f, idx) => {
        const p = path.join(iniDir, f);
        fs.writeFileSync(p, `backup ${idx}`);
        const mtime = new Date(now - (10 - idx) * 100000);
        fs.utimesSync(p, mtime, mtime);
      });

      // Keep only 1 regular backup, safety backups should always be preserved
      const result = pruneIniBackups(tempDir, { keepCount: 1, preserveSafetyBackups: true });
      expect(result.ok).toBe(true);
      expect(result.deletedFiles).toEqual([regularOld]);
      expect(result.prunedCount).toBe(1);
      expect(result.keptFiles).toContain(safetyOld);
      expect(result.keptFiles).toContain(safetyOther);
      expect(result.keptFiles).toContain(regularNew);
      expect(fs.existsSync(path.join(iniDir, safetyOld))).toBe(true);
      expect(fs.existsSync(path.join(iniDir, safetyOther))).toBe(true);
      expect(fs.existsSync(path.join(iniDir, regularNew))).toBe(true);
      expect(fs.existsSync(path.join(iniDir, regularOld))).toBe(false);
    });

    it('prunes safety backups when preserveSafetyBackups is false', () => {
      const now = Date.now();
      const regularNew = 'GameUserSettings.2026-09-04T12-00-00-000Z.backup.ini';
      const safetyOld = 'GameUserSettings.2026-09-01T10-00-00-000Z.pre-restore.backup.ini';

      fs.writeFileSync(path.join(iniDir, regularNew), 'new');
      fs.utimesSync(path.join(iniDir, regularNew), new Date(now - 10000), new Date(now - 10000));

      fs.writeFileSync(path.join(iniDir, safetyOld), 'old safety');
      fs.utimesSync(path.join(iniDir, safetyOld), new Date(now - 500000), new Date(now - 500000));

      const result = pruneIniBackups(tempDir, { keepCount: 1, preserveSafetyBackups: false });
      expect(result.ok).toBe(true);
      expect(result.deletedFiles).toContain(safetyOld);
      expect(result.keptFiles).toContain(regularNew);
      expect(fs.existsSync(path.join(iniDir, safetyOld))).toBe(false);
      expect(fs.existsSync(path.join(iniDir, regularNew))).toBe(true);
    });

    it('prunes backups older than olderThanDays', () => {
      const now = Date.now();
      const oldFile = 'GameUserSettings.2026-08-01T10-00-00-000Z.backup.ini';
      const freshFile = 'GameUserSettings.2026-09-04T10-00-00-000Z.backup.ini';

      fs.writeFileSync(path.join(iniDir, oldFile), 'old');
      // 10 days ago
      const oldTime = new Date(now - 10 * 86400000);
      fs.utimesSync(path.join(iniDir, oldFile), oldTime, oldTime);

      fs.writeFileSync(path.join(iniDir, freshFile), 'fresh');
      // 1 hour ago
      const freshTime = new Date(now - 3600000);
      fs.utimesSync(path.join(iniDir, freshFile), freshTime, freshTime);

      const result = pruneIniBackups(tempDir, { olderThanDays: 5 });
      expect(result.ok).toBe(true);
      expect(result.deletedFiles).toEqual([oldFile]);
      expect(result.keptFiles).toEqual([freshFile]);
      expect(fs.existsSync(path.join(iniDir, oldFile))).toBe(false);
      expect(fs.existsSync(path.join(iniDir, freshFile))).toBe(true);
    });

    it('prunes if exceeding keepCount OR olderThanDays when both specified', () => {
      const now = Date.now();
      // 3 files:
      // file1: 1 hour ago (index 0)
      // file2: 2 hours ago (index 1)
      // file3: 10 days ago (index 2)
      const file1 = 'GameUserSettings.2026-09-04T12-00-00-000Z.backup.ini';
      const file2 = 'GameUserSettings.2026-09-04T11-00-00-000Z.backup.ini';
      const file3 = 'GameUserSettings.2026-08-20T10-00-00-000Z.backup.ini';

      fs.writeFileSync(path.join(iniDir, file1), '1');
      fs.utimesSync(path.join(iniDir, file1), new Date(now - 3600000), new Date(now - 3600000));

      fs.writeFileSync(path.join(iniDir, file2), '2');
      fs.utimesSync(path.join(iniDir, file2), new Date(now - 7200000), new Date(now - 7200000));

      fs.writeFileSync(path.join(iniDir, file3), '3');
      fs.utimesSync(path.join(iniDir, file3), new Date(now - 10 * 86400000), new Date(now - 10 * 86400000));

      // keepCount: 1 (will prune file2 and file3 by keepCount; file3 is also older than 5 days)
      const result = pruneIniBackups(tempDir, { keepCount: 1, olderThanDays: 5 });
      expect(result.ok).toBe(true);
      expect(result.keptFiles).toEqual([file1]);
      expect(result.deletedFiles).toContain(file2);
      expect(result.deletedFiles).toContain(file3);
    });

    it('filters pruning to specific file when options.file is provided', () => {
      const now = Date.now();
      const gus1 = 'GameUserSettings.2026-09-01T10-00-00-000Z.backup.ini';
      const gus2 = 'GameUserSettings.2026-09-02T10-00-00-000Z.backup.ini';
      const game1 = 'Game.2026-09-01T10-00-00-000Z.backup.ini';

      [gus1, gus2, game1].forEach(f => {
        const p = path.join(iniDir, f);
        fs.writeFileSync(p, 'content');
        fs.utimesSync(p, new Date(now - 100000), new Date(now - 100000));
      });

      const result = pruneIniBackups(tempDir, { file: 'GameUserSettings.ini', keepCount: 1 });
      expect(result.ok).toBe(true);
      expect(result.prunedCount).toBe(1);
      expect(result.keptCount).toBe(1);
      // Game.ini backup should remain untouched on disk
      expect(fs.existsSync(path.join(iniDir, game1))).toBe(true);
    });
  });
});
