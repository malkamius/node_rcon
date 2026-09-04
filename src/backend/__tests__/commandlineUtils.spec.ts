import {
  parseCommandline,
  buildOrSyncCommandline,
  cleanModIds,
  STANDARD_FLAGS
} from '../../frontend/commandlineUtils';

describe('commandlineUtils', () => {
  const sampleArgs = [
    'TheIsland_WP?listen?SessionName="Poland Mythos"?QueryPort=28005?MaxPlayers=100?AllowCrateSpawnsOnTopOfStructures=True',
    'ServerAdminPassword=warmianinrules',
    'Port=28705',
    '-mods=928708,930389,934401,955451',
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
    '-ServerPlatform=ALL',
    '-clusterID="mythos"',
    '-ClusterDirOverride="G:\\ark_server_instances\\clusters"'
  ];

  describe('cleanModIds', () => {
    it('handles commas, spaces, and empty tokens', () => {
      expect(cleanModIds('  928708, 930389,   934401 , ')).toBe('928708,930389,934401');
      expect(cleanModIds('111 222, 333')).toBe('111,222,333');
      expect(cleanModIds('')).toBe('');
    });
  });

  describe('parseCommandline', () => {
    it('correctly parses all settings from sample command-line arguments', () => {
      const parsed = parseCommandline(sampleArgs);
      expect(parsed.mapName).toBe('TheIsland_WP');
      expect(parsed.queryPort).toBe(28005);
      expect(parsed.gamePort).toBe(28705);
      expect(parsed.maxPlayers).toBe(100);
      expect(parsed.serverPassword).toBe('');
      expect(parsed.modIds).toBe('928708,930389,934401,955451');
      expect(parsed.clusterId).toBe('mythos');
      expect(parsed.clusterDirOverride).toBe('G:\\ark_server_instances\\clusters');

      // Check standard flags
      expect(parsed.flags['-NoBattlEye']).toBe(true);
      expect(parsed.flags['-crossplay']).toBe(true);
      expect(parsed.flags['-ForceAllowCaveFlyers']).toBe(true);
      expect(parsed.flags['-automanagedmods']).toBe(true);
      expect(parsed.flags['-servergamelog']).toBe(true);
    });

    it('handles missing or empty arguments array gracefully', () => {
      const parsed = parseCommandline(undefined);
      expect(parsed.mapName).toBe('TheIsland_WP');
      expect(parsed.queryPort).toBeUndefined();
      expect(parsed.gamePort).toBeUndefined();
      expect(parsed.flags['-NoBattlEye']).toBe(true);
    });
  });

  describe('buildOrSyncCommandline', () => {
    it('synchronizes updated fields into existing arguments while preserving custom arguments', () => {
      const parsed = parseCommandline(sampleArgs);
      // Change map to Scorched Earth, query port to 28010, game port to 28710
      parsed.mapName = 'ScorchedEarth';
      parsed.queryPort = 28010;
      parsed.gamePort = 28710;
      parsed.clusterId = 'newcluster';
      parsed.modIds = '999999, 888888';
      // Disable NoBattlEye
      parsed.flags['-NoBattlEye'] = false;

      const profile = { name: 'Updated Server Name', password: 'newadminpassword' };
      const updatedArgs = buildOrSyncCommandline(sampleArgs, parsed, profile);

      expect(updatedArgs[0]).toContain('ScorchedEarth_WP?');
      expect(updatedArgs[0]).toContain('SessionName="Updated Server Name"');
      expect(updatedArgs[0]).toContain('QueryPort=28010');
      expect(updatedArgs[0]).toContain('AllowCrateSpawnsOnTopOfStructures=True'); // Preserved URL param!

      expect(updatedArgs).toContain('ServerAdminPassword=newadminpassword');
      expect(updatedArgs).toContain('Port=28710');
      expect(updatedArgs).toContain('-mods=999999,888888');
      expect(updatedArgs).toContain('-clusterID="newcluster"');
      expect(updatedArgs).not.toContain('-NoBattlEye'); // Disabled flag removed

      // Preserved unmanaged arguments
      expect(updatedArgs).toContain('-nosteamclient');
      expect(updatedArgs).toContain('-ServerPlatform=ALL');
    });

    it('generates a complete default command-line array when starting from empty', () => {
      const parsed = parseCommandline([]);
      parsed.mapName = 'Aberration_WP';
      parsed.queryPort = 27015;
      parsed.gamePort = 7777;
      parsed.serverPassword = 'secretjoinpass';

      const profile = { name: 'My New Server', password: 'secretadminpass' };
      const createdArgs = buildOrSyncCommandline([], parsed, profile);

      expect(createdArgs[0]).toContain('Aberration_WP?listen?SessionName="My New Server"?QueryPort=27015?MaxPlayers=100');
      expect(createdArgs[0]).toContain('?ServerPassword=secretjoinpass');
      expect(createdArgs).toContain('ServerAdminPassword=secretadminpass');
      expect(createdArgs).toContain('Port=7777');
      expect(createdArgs).toContain('-NoBattlEye');
      expect(createdArgs).toContain('-crossplay');
      expect(createdArgs).toContain('-ServerPlatform=ALL');
    });

    it('removes mod and cluster parameters when emptied', () => {
      const parsed = parseCommandline(sampleArgs);
      parsed.modIds = '';
      parsed.clusterId = '';
      parsed.clusterDirOverride = '';

      const updated = buildOrSyncCommandline(sampleArgs, parsed, { name: 'Test Server', password: 'pass' });
      expect(updated.some((a) => a.startsWith('-mods='))).toBe(false);
      expect(updated.some((a) => a.startsWith('-clusterID='))).toBe(false);
      expect(updated.some((a) => a.startsWith('-ClusterDirOverride='))).toBe(false);
    });
  });
});
