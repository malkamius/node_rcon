import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getServerLogsDir,
  isSafeLogFileName,
  listServerLogFiles,
  tailServerLog,
  getLogFilePath,
} from '../serverLogsApi';

describe('Server Logs API Unit Tests', () => {
  let tempDir: string;
  let logsDir: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-logs-test-'));
    logsDir = path.join(tempDir, 'ShooterGame', 'Saved', 'Logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Create a mock active ShooterGame.log
    const activeLogLines = [
      '[2026.09.03-12.00.00:000][  0]Log file open, 09/03/26 12:00:00',
      '[2026.09.03-12.00.01:000][  1]LogMemory: Memory total: 64 GB',
      '[2026.09.03-12.00.02:000][  2]LogServer: Initializing world map: TheIsland_WP',
      '[2026.09.03-12.00.03:000][  3]LogServer: Server listening on port 28705',
      '[2026.09.03-12.00.04:000][  4]LogServer: [Warning] High ping detected on client',
      '[2026.09.03-12.00.05:000][  5]LogServer: World save completed successfully',
      '[2026.09.03-12.00.06:000][  6]LogServer: [Error] Failed to load custom item asset',
    ].join('\n');
    fs.writeFileSync(path.join(logsDir, 'ShooterGame.log'), activeLogLines, 'utf-8');

    // Create a historical backup log
    const backupLogLines = [
      '[2026.09.02-10.00.00:000][  0]Log file open from previous session',
      '[2026.09.02-10.05.00:000][  1]Server stopped gracefully',
    ].join('\n');
    fs.writeFileSync(
      path.join(logsDir, 'ShooterGame-backup-2026.09.02-10.05.00.log'),
      backupLogLines,
      'utf-8'
    );

    // Create a crash dump / crash report log
    const crashLogLines = [
      '[2026.09.01-08.00.00:000][  0]Fatal error: Assertion failed',
      '[2026.09.01-08.00.01:000][  1]ShooterGame.exe!CrashReport()',
    ].join('\n');
    fs.writeFileSync(path.join(logsDir, 'ShooterGame_crash.log'), crashLogLines, 'utf-8');

    // Create an irrelevant file that should be ignored
    fs.writeFileSync(path.join(logsDir, 'random_data.bin'), Buffer.from([0, 1, 2, 3]));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  describe('getServerLogsDir', () => {
    it('should correctly build the ShooterGame/Saved/Logs path', () => {
      const result = getServerLogsDir(tempDir);
      expect(result).toBe(path.join(path.resolve(tempDir), 'ShooterGame', 'Saved', 'Logs'));
    });

    it('should return null for empty or invalid directory', () => {
      expect(getServerLogsDir('')).toBeNull();
      expect(getServerLogsDir(null as any)).toBeNull();
    });
  });

  describe('isSafeLogFileName', () => {
    it('should accept valid log file names', () => {
      expect(isSafeLogFileName('ShooterGame.log')).toBe(true);
      expect(isSafeLogFileName('ShooterGame-backup-2025.07.01-02.02.14.log')).toBe(true);
      expect(isSafeLogFileName('ShooterGame_crash.log')).toBe(true);
      expect(isSafeLogFileName('CrashReportClient.xml')).toBe(true);
      expect(isSafeLogFileName('minidump.dmp')).toBe(true);
    });

    it('should reject directory traversal attempts', () => {
      expect(isSafeLogFileName('../ShooterGame.log')).toBe(false);
      expect(isSafeLogFileName('..\\ShooterGame.log')).toBe(false);
      expect(isSafeLogFileName('sub/ShooterGame.log')).toBe(false);
      expect(isSafeLogFileName('/etc/passwd')).toBe(false);
      expect(isSafeLogFileName('C:\\Windows\\win.ini')).toBe(false);
    });

    it('should reject non-log extensions', () => {
      expect(isSafeLogFileName('executable.exe')).toBe(false);
      expect(isSafeLogFileName('settings.ini')).toBe(false);
      expect(isSafeLogFileName('payload.bat')).toBe(false);
    });
  });

  describe('listServerLogFiles', () => {
    it('should list all valid log and crash files sorted with ShooterGame.log first', async () => {
      const files = await listServerLogFiles(tempDir);
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBe(3);

      const fileNames = files.map(f => f.name);
      expect(fileNames).toContain('ShooterGame.log');
      expect(fileNames).toContain('ShooterGame-backup-2026.09.02-10.05.00.log');
      expect(fileNames).toContain('ShooterGame_crash.log');
      expect(fileNames).not.toContain('random_data.bin');

      // ShooterGame.log should be pinned to top as current
      expect(files[0].name).toBe('ShooterGame.log');
      expect(files[0].isCurrent).toBe(true);

      // ShooterGame_crash.log should have isCrash = true
      const crashFile = files.find(f => f.name === 'ShooterGame_crash.log');
      expect(crashFile).toBeDefined();
      expect(crashFile?.isCrash).toBe(true);
    });

    it('should return an empty array if logs directory does not exist', async () => {
      const nonExistent = path.join(tempDir, 'non_existent_folder');
      const files = await listServerLogFiles(nonExistent);
      expect(files).toEqual([]);
    });
  });

  describe('tailServerLog', () => {
    it('should read the tail lines of ShooterGame.log', async () => {
      const result = await tailServerLog(tempDir, 'ShooterGame.log', { lines: 3 });
      expect(result.file).toBe('ShooterGame.log');
      expect(result.lines.length).toBe(3);
      expect(result.totalLines).toBe(7);
      expect(result.lines[result.lines.length - 1]).toContain('[Error] Failed to load custom item asset');
    });

    it('should filter log lines by search query', async () => {
      const result = await tailServerLog(tempDir, 'ShooterGame.log', { search: 'Warning' });
      expect(result.lines.length).toBe(1);
      expect(result.lines[0]).toContain('[Warning] High ping detected on client');
    });

    it('should filter log lines case-insensitively', async () => {
      const result = await tailServerLog(tempDir, 'ShooterGame.log', { search: 'world save' });
      expect(result.lines.length).toBe(1);
      expect(result.lines[0]).toContain('World save completed successfully');
    });

    it('should reject unsafe filenames', async () => {
      await expect(tailServerLog(tempDir, '../evil.log')).rejects.toThrow('Invalid or unsafe log filename');
    });

    it('should throw when file does not exist', async () => {
      await expect(tailServerLog(tempDir, 'NonExistent.log')).rejects.toThrow('Log file not found');
    });
  });

  describe('getLogFilePath', () => {
    it('should return the full valid path inside logs directory', () => {
      const result = getLogFilePath(tempDir, 'ShooterGame.log');
      expect(result).toBe(path.join(logsDir, 'ShooterGame.log'));
    });

    it('should throw an error on traversal attempt', () => {
      expect(() => getLogFilePath(tempDir, '../Windows/System32.log')).toThrow();
    });
  });
});
