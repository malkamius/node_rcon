import fs from 'fs';
import path from 'path';
import os from 'os';
import { syncRconSettingsToIni, getIniPath } from '../iniApi';
import { IniHandler } from '../handlers/IniHandler';
import { ProfileHandler } from '../handlers/ProfileHandler';

describe('Priority 3: Server Configuration & INI Improvements', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ini-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('syncRconSettingsToIni', () => {
    it('creates fresh file and directories with RCONEnabled=True, RCONPort, and ServerAdminPassword', () => {
      const result = syncRconSettingsToIni(tempDir, 27020, 'secretAdminPass123');

      expect(result.success).toBe(true);
      expect(result.path).toBe(
        path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', 'GameUserSettings.ini')
      );
      expect(fs.existsSync(result.path)).toBe(true);

      const content = fs.readFileSync(result.path, 'utf-8');
      expect(content).toContain('[ServerSettings]');
      expect(content).toContain('RCONEnabled=True');
      expect(content).toContain('RCONPort=27020');
      expect(content).toContain('ServerAdminPassword=secretAdminPass123');
    });

    it('works when passed an object with a directory property', () => {
      const profile = { directory: tempDir, port: 27021, password: 'profilePass' };
      const result = syncRconSettingsToIni(profile, profile.port, profile.password);

      expect(result.success).toBe(true);
      const content = fs.readFileSync(result.path, 'utf-8');
      expect(content).toContain('RCONPort=27021');
      expect(content).toContain('ServerAdminPassword=profilePass');
    });

    it('updates an existing file, creates backup, and preserves other sections, keys, and comments', () => {
      const iniDir = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      fs.mkdirSync(iniDir, { recursive: true });
      const iniPath = path.join(iniDir, 'GameUserSettings.ini');

      const existingContent = [
        '; Top-level config comment',
        '[SessionSettings]',
        'SessionName=Original Server Name',
        '# Another session comment',
        '',
        '[ServerSettings]',
        '; Difficulty settings',
        'DifficultyOffset=1.000000',
        'RCONEnabled=False',
        'RCONPort=7777',
        'ServerAdminPassword=oldSecretPassword',
        '; Admin contact info',
        '',
        '[MessageOfTheDay]',
        'Message=Welcome to the server!'
      ].join('\r\n');

      fs.writeFileSync(iniPath, existingContent, 'utf-8');

      const result = syncRconSettingsToIni(tempDir, 28015, 'newAdminPassword456');
      expect(result.success).toBe(true);

      // Check backup file creation
      const files = fs.readdirSync(iniDir);
      const backupFile = files.find((f) => f.startsWith('GameUserSettings.') && f.endsWith('.backup.ini'));
      expect(backupFile).toBeDefined();

      if (backupFile) {
        const backupContent = fs.readFileSync(path.join(iniDir, backupFile), 'utf-8');
        expect(backupContent).toBe(existingContent);
      }

      // Read updated file
      const updatedContent = fs.readFileSync(iniPath, 'utf-8');

      // Updated keys
      expect(updatedContent).toContain('RCONEnabled=True');
      expect(updatedContent).toContain('RCONPort=28015');
      expect(updatedContent).toContain('ServerAdminPassword=newAdminPassword456');
      expect(updatedContent).not.toContain('RCONEnabled=False');
      expect(updatedContent).not.toContain('RCONPort=7777');
      expect(updatedContent).not.toContain('oldSecretPassword');

      // Preserved comments, sections, and other keys
      expect(updatedContent).toContain('; Top-level config comment');
      expect(updatedContent).toContain('[SessionSettings]');
      expect(updatedContent).toContain('SessionName=Original Server Name');
      expect(updatedContent).toContain('# Another session comment');
      expect(updatedContent).toContain('; Difficulty settings');
      expect(updatedContent).toContain('DifficultyOffset=1.000000');
      expect(updatedContent).toContain('; Admin contact info');
      expect(updatedContent).toContain('[MessageOfTheDay]');
      expect(updatedContent).toContain('Message=Welcome to the server!');
    });

    it('does not overwrite ServerAdminPassword when password is undefined', () => {
      const iniDir = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      fs.mkdirSync(iniDir, { recursive: true });
      const iniPath = path.join(iniDir, 'GameUserSettings.ini');

      const existingContent = [
        '[ServerSettings]',
        'RCONPort=7777',
        'ServerAdminPassword=keepMeUnchanged'
      ].join('\n');

      fs.writeFileSync(iniPath, existingContent, 'utf-8');

      const result = syncRconSettingsToIni(tempDir, 29000);
      expect(result.success).toBe(true);

      const updated = fs.readFileSync(iniPath, 'utf-8');
      expect(updated).toContain('RCONPort=29000');
      expect(updated).toContain('ServerAdminPassword=keepMeUnchanged');
    });

    it('returns error when no directory is provided', () => {
      const result = syncRconSettingsToIni(null, 27020);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No directory provided');
    });
  });

  describe('IniHandler', () => {
    let mockProfile: any;
    let context: any;
    let iniHandler: IniHandler;
    let mockWs: { send: jest.Mock };

    beforeEach(() => {
      mockProfile = {
        name: 'Test Server',
        directory: tempDir,
        port: 27020,
        password: 'initialPassword'
      };
      context = {
        getProfiles: () => [mockProfile]
      };
      iniHandler = new IniHandler(context);
      mockWs = { send: jest.fn() };
    });

    it('getServerIni returns rawText alongside iniObj', async () => {
      const iniDir = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      fs.mkdirSync(iniDir, { recursive: true });
      const iniPath = path.join(iniDir, 'GameUserSettings.ini');
      const raw = '; Sample comment\r\n[ServerSettings]\r\nRCONPort=27020\r\n';
      fs.writeFileSync(iniPath, raw, 'utf-8');

      await iniHandler.handlers.getServerIni(mockWs as any, {
        idx: 0,
        file: 'GameUserSettings.ini',
        requestId: 'req-get-1'
      });

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const response = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(response.type).toBe('getServerIni');
      expect(response.idx).toBe(0);
      expect(response.file).toBe('GameUserSettings.ini');
      expect(response.rawText).toBe(raw);
      expect(response.iniObj.ServerSettings.RCONPort).toBe('27020');
      expect(response.requestId).toBe('req-get-1');
    });

    it('getServerIni returns empty rawText and empty iniObj when file does not exist', async () => {
      await iniHandler.handlers.getServerIni(mockWs as any, {
        idx: 0,
        file: 'GameUserSettings.ini',
        requestId: 'req-get-nonexistent'
      });

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const response = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(response.type).toBe('getServerIni');
      expect(response.rawText).toBe('');
      expect(response.iniObj).toEqual({});
      expect(response.requestId).toBe('req-get-nonexistent');
    });

    it('saveServerIni saves rawText directly and creates a backup of existing file', async () => {
      const iniDir = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      fs.mkdirSync(iniDir, { recursive: true });
      const iniPath = path.join(iniDir, 'GameUserSettings.ini');
      fs.writeFileSync(iniPath, '[ServerSettings]\r\nOriginal=True\r\n', 'utf-8');

      const customRawText = '; Custom raw INI content with comments\r\n[ServerSettings]\r\nRCONPort=29999\r\n';

      await iniHandler.handlers.saveServerIni(mockWs as any, {
        idx: 0,
        file: 'GameUserSettings.ini',
        rawText: customRawText,
        requestId: 'req-save-raw'
      });

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const response = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(response.type).toBe('saveServerIni');
      expect(response.ok).toBe(true);
      expect(response.requestId).toBe('req-save-raw');

      // Verify file written exactly
      const written = fs.readFileSync(iniPath, 'utf-8');
      expect(written).toBe(customRawText);

      // Verify backup was created
      const files = fs.readdirSync(iniDir);
      const backupFile = files.find((f) => f.startsWith('GameUserSettings.') && f.endsWith('.backup.ini'));
      expect(backupFile).toBeDefined();
    });

    it('saveServerIni supports overwrite=true with iniObj', async () => {
      const iniDir = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      fs.mkdirSync(iniDir, { recursive: true });
      const iniPath = path.join(iniDir, 'GameUserSettings.ini');
      fs.writeFileSync(iniPath, '[ServerSettings]\r\nOldKey=OldValue\r\n', 'utf-8');

      const newIniObj = {
        ServerSettings: {
          NewKey: 'NewValue'
        }
      };

      await iniHandler.handlers.saveServerIni(mockWs as any, {
        idx: 0,
        file: 'GameUserSettings.ini',
        iniObj: newIniObj,
        overwrite: true,
        requestId: 'req-save-overwrite'
      });

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const response = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(response.ok).toBe(true);

      const written = fs.readFileSync(iniPath, 'utf-8');
      expect(written).toContain('NewKey=NewValue');
      expect(written).not.toContain('OldKey=OldValue');
    });

    it('syncRconToIni handler resolves profile and updates GameUserSettings.ini', async () => {
      await iniHandler.handlers.syncRconToIni(mockWs as any, {
        idx: 0,
        port: 33000,
        password: 'syncedPass',
        requestId: 'req-sync-handler'
      });

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const response = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(response.type).toBe('syncRconToIni');
      expect(response.ok).toBe(true);
      expect(response.path).toContain('GameUserSettings.ini');
      expect(response.requestId).toBe('req-sync-handler');

      const iniPath = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', 'GameUserSettings.ini');
      const written = fs.readFileSync(iniPath, 'utf-8');
      expect(written).toContain('RCONEnabled=True');
      expect(written).toContain('RCONPort=33000');
      expect(written).toContain('ServerAdminPassword=syncedPass');
    });
  });

  describe('ProfileHandler saveProfiles with syncIni', () => {
    it('syncs RCON settings to INI when msg.syncIni is true', async () => {
      const savedProfiles: any[] = [];
      const context = {
        config: { profiles: [] },
        saveProfiles: (profiles: any[]) => savedProfiles.push(...profiles)
      };
      const profileHandler = new ProfileHandler(context);
      const mockWs = { send: jest.fn() };

      const profile = {
        name: 'AutoSync Server',
        directory: tempDir,
        port: 27022,
        password: 'autoSyncPass'
      };

      await profileHandler.handlers.saveProfiles(mockWs as any, {
        profiles: [profile],
        syncIni: true,
        requestId: 'req-profile-sync'
      });

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const response = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(response.ok).toBe(true);

      const iniPath = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', 'GameUserSettings.ini');
      expect(fs.existsSync(iniPath)).toBe(true);
      const content = fs.readFileSync(iniPath, 'utf-8');
      expect(content).toContain('RCONEnabled=True');
      expect(content).toContain('RCONPort=27022');
      expect(content).toContain('ServerAdminPassword=autoSyncPass');
    });

    it('syncs RCON settings when a profile has syncIni === true', async () => {
      const context = {
        config: { profiles: [] },
        saveProfiles: jest.fn()
      };
      const profileHandler = new ProfileHandler(context);
      const mockWs = { send: jest.fn() };

      const profile = {
        name: 'Individual Sync Server',
        directory: tempDir,
        port: 27023,
        password: 'profileSyncPass',
        syncIni: true
      };

      await profileHandler.handlers.saveProfiles(mockWs as any, {
        profiles: [profile],
        requestId: 'req-profile-sync-individual'
      });

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const iniPath = path.join(tempDir, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', 'GameUserSettings.ini');
      expect(fs.existsSync(iniPath)).toBe(true);
      const content = fs.readFileSync(iniPath, 'utf-8');
      expect(content).toContain('RCONPort=27023');
      expect(content).toContain('ServerAdminPassword=profileSyncPass');
    });
  });
});
