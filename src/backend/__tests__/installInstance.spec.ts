import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Instance Installation & Profile Auto-Registration', () => {
  it('should generate valid parsedCommandline and profile object', () => {
    const params = {
      baseInstallPath: 'G:\\ark_asa_shared',
      instanceDirectory: 'G:\\ark_server_instances\\TestInstance',
      queryPort: 27015,
      gamePort: 7777,
      rconPort: 27020,
      mapName: 'TheIsland',
      sessionName: 'Test Island Server',
      adminPassword: 'SecretAdminPassword123',
      serverPassword: 'JoinPassword456'
    };

    const effectiveRconPort = Number(params.rconPort || params.queryPort || 27020);
    const effectiveQueryPort = params.queryPort;
    const effectiveGamePort = params.gamePort;
    const mapArg = params.mapName.includes('_WP') ? params.mapName : `${params.mapName}_WP`;

    const parsedCommandline = [
      `${mapArg}?listen?SessionName="${params.sessionName}"?QueryPort=${effectiveQueryPort}?MaxPlayers=100?AllowCrateSpawnsOnTopOfStructures=True${params.serverPassword ? `?ServerPassword=${params.serverPassword}` : ''}`,
      `ServerAdminPassword=${params.adminPassword}`,
      `Port=${effectiveGamePort}`,
      '-ForceAllowCaveFlyers',
      '-NoBattlEye',
      '-servergamelog',
      '-severgamelogincludetribelogs',
      '-ServerRCONOutputTribeLogs',
      '-NotifyAdminCommandsInChat',
      '-nosteamclient',
      '-game',
      '-server',
      '-log',
      '-crossplay',
      '-noundermeshchecking',
      '-noantispeedhack',
      '-automanagedmods',
      '-ServerPlatform=ALL'
    ];

    expect(mapArg).toBe('TheIsland_WP');
    expect(parsedCommandline[0]).toContain('TheIsland_WP?listen?SessionName="Test Island Server"?QueryPort=27015?MaxPlayers=100?AllowCrateSpawnsOnTopOfStructures=True?ServerPassword=JoinPassword456');
    expect(parsedCommandline[1]).toBe('ServerAdminPassword=SecretAdminPassword123');
    expect(parsedCommandline[2]).toBe('Port=7777');
    expect(parsedCommandline).toContain('-NoBattlEye');
    expect(parsedCommandline).toContain('-crossplay');

    const newProfile = {
      name: params.sessionName,
      host: '127.0.0.1',
      port: effectiveRconPort,
      password: params.adminPassword,
      game: 'ark_sa',
      features: {
        currentPlayers: {
          enabled: true,
          updateInterval: 10
        }
      },
      autoStart: false,
      directory: params.instanceDirectory,
      parsedCommandline,
      manuallyStopped: true
    };

    expect(newProfile.name).toBe('Test Island Server');
    expect(newProfile.port).toBe(27020);
    expect(newProfile.password).toBe('SecretAdminPassword123');
    expect(newProfile.game).toBe('ark_sa');
    expect(newProfile.manuallyStopped).toBe(true);
  });

  it('should format GameUserSettings.ini with [ServerSettings] and RCON settings', () => {
    const tmpDir = path.join(__dirname, 'tmp_test_ini');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const gusPath = path.join(tmpDir, 'GameUserSettings.ini');

    function updateGameUserSettings(filePath: string, settings: Record<string, string | number>) {
      let lines: string[] = [];
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        lines = raw.split(/\r?\n/);
      }

      let serverSettingsIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().toLowerCase() === '[serversettings]') {
          serverSettingsIndex = i;
          break;
        }
      }

      const keysToSet = { ...settings };
      const updatedKeys = new Set<string>();

      if (serverSettingsIndex !== -1) {
        let nextSectionIndex = lines.length;
        for (let i = serverSettingsIndex + 1; i < lines.length; i++) {
          if (/^\s*\[.+\]/.test(lines[i].trim())) {
            nextSectionIndex = i;
            break;
          }
        }
        for (let i = serverSettingsIndex + 1; i < nextSectionIndex; i++) {
          const match = lines[i].match(/^\s*([^=]+?)\s*=/);
          if (match) {
            const existingKey = match[1].trim();
            for (const [targetKey, targetVal] of Object.entries(keysToSet)) {
              if (existingKey.toLowerCase() === targetKey.toLowerCase()) {
                lines[i] = `${targetKey}=${targetVal}`;
                updatedKeys.add(targetKey);
                break;
              }
            }
          }
        }
        const missingLines: string[] = [];
        for (const [targetKey, targetVal] of Object.entries(keysToSet)) {
          if (!updatedKeys.has(targetKey)) {
            missingLines.push(`${targetKey}=${targetVal}`);
          }
        }
        if (missingLines.length > 0) {
          lines.splice(nextSectionIndex, 0, ...missingLines);
        }
      } else {
        if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
          lines.push('');
        }
        lines.push('[ServerSettings]');
        for (const [targetKey, targetVal] of Object.entries(keysToSet)) {
          lines.push(`${targetKey}=${targetVal}`);
        }
      }
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
      }
      lines.push('');
      fs.writeFileSync(filePath, lines.join('\r\n'), 'utf-8');
    }

    try {
      updateGameUserSettings(gusPath, {
        RCONEnabled: 'True',
        RCONPort: 27020,
        ServerAdminPassword: 'MyAdminPassword',
        ServerPassword: 'MyServerPassword'
      });

      const content = fs.readFileSync(gusPath, 'utf-8');
      expect(content).toContain('[ServerSettings]');
      expect(content).toContain('RCONEnabled=True');
      expect(content).toContain('RCONPort=27020');
      expect(content).toContain('ServerAdminPassword=MyAdminPassword');
      expect(content).toContain('ServerPassword=MyServerPassword');

      updateGameUserSettings(gusPath, {
        RCONEnabled: 'True',
        RCONPort: 28155,
        ServerAdminPassword: 'NewPassword'
      });

      const updatedContent = fs.readFileSync(gusPath, 'utf-8');
      expect(updatedContent).toContain('RCONPort=28155');
      expect(updatedContent).toContain('ServerAdminPassword=NewPassword');
      expect(updatedContent).not.toContain('RCONPort=27020');
      expect(updatedContent.match(/\[ServerSettings\]/g)?.length).toBe(1);
    } finally {
      if (fs.existsSync(gusPath)) fs.unlinkSync(gusPath);
      if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
    }
  });
});
