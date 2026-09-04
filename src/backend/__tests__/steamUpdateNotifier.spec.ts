import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseAcfBuildId,
  getAcfBuildIdFromDir,
  evaluateBaseInstalls,
  findLinkedBaseInstall,
  BaseInstallInfo,
  ARK_SA_APP_ID
} from '../steamUpdateNotifier';

describe('steamUpdateNotifier', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('parseAcfBuildId', () => {
    it('extracts buildid from standard ACF manifest content', () => {
      const acf = `
"AppState"
{
\t"appid"\t\t"2430930"
\t"Universe"\t\t"1"
\t"name"\t\t"ARK: Survival Ascended Dedicated Server"
\t"StateFlags"\t\t"4"
\t"installdir"\t\t"ARK Survival Ascended Dedicated Server"
\t"LastUpdated"\t\t"1710000000"
\t"UpdateResult"\t\t"0"
\t"SizeOnDisk"\t\t"12345678"
\t"buildid"\t\t"20328142"
\t"LastOwner"\t\t"0"
}
      `;
      expect(parseAcfBuildId(acf)).toBe('20328142');
    });

    it('returns null if buildid is missing or content is empty', () => {
      expect(parseAcfBuildId('')).toBeNull();
      expect(parseAcfBuildId('"AppState" { "appid" "2430930" }')).toBeNull();
    });
  });

  describe('getAcfBuildIdFromDir', () => {
    it('reads and parses ACF file from <installDir>/steamapps/appmanifest_<appId>.acf', () => {
      const steamappsDir = path.join(tmpDir, 'steamapps');
      fs.mkdirSync(steamappsDir, { recursive: true });
      const acfPath = path.join(steamappsDir, `appmanifest_${ARK_SA_APP_ID}.acf`);
      fs.writeFileSync(acfPath, '"AppState" { "buildid" "15987654" }', 'utf-8');

      const buildId = getAcfBuildIdFromDir(tmpDir);
      expect(buildId).toBe('15987654');
    });

    it('returns null if steamapps directory or manifest does not exist', () => {
      expect(getAcfBuildIdFromDir(path.join(tmpDir, 'nonexistent'))).toBeNull();
    });
  });

  describe('evaluateBaseInstalls', () => {
    it('detects updateAvailable when installed version is older than latestBuildId', () => {
      const steamappsDir = path.join(tmpDir, 'steamapps');
      fs.mkdirSync(steamappsDir, { recursive: true });
      fs.writeFileSync(
        path.join(steamappsDir, `appmanifest_${ARK_SA_APP_ID}.acf`),
        '"AppState" { "buildid" "100" }',
        'utf-8'
      );

      const baseInstalls: BaseInstallInfo[] = [
        { id: 'base-1', path: tmpDir, version: '50' }
      ];

      const { updatedList, hasChanges } = evaluateBaseInstalls(baseInstalls, '200');
      expect(hasChanges).toBe(true);
      expect(updatedList[0].version).toBe('100');
      expect(updatedList[0].updateAvailable).toBe(true);
      expect(updatedList[0].installAvailable).toBe(false);
      expect(updatedList[0].latestBuildId).toBe('200');
    });

    it('flags updateAvailable as false when up to date or newer', () => {
      const steamappsDir = path.join(tmpDir, 'steamapps');
      fs.mkdirSync(steamappsDir, { recursive: true });
      fs.writeFileSync(
        path.join(steamappsDir, `appmanifest_${ARK_SA_APP_ID}.acf`),
        '"AppState" { "buildid" "200" }',
        'utf-8'
      );

      const baseInstalls: BaseInstallInfo[] = [
        { id: 'base-1', path: tmpDir, version: '200', updateAvailable: true }
      ];

      const { updatedList, hasChanges } = evaluateBaseInstalls(baseInstalls, '200');
      expect(hasChanges).toBe(true);
      expect(updatedList[0].updateAvailable).toBe(false);
      expect(updatedList[0].latestBuildId).toBe('200');
    });

    it('marks installAvailable as true when directory exists but ACF manifest is missing', () => {
      const baseInstalls: BaseInstallInfo[] = [
        { id: 'base-1', path: tmpDir }
      ];

      const { updatedList, hasChanges } = evaluateBaseInstalls(baseInstalls, '300');
      expect(hasChanges).toBe(true);
      expect(updatedList[0].version).toBeNull();
      expect(updatedList[0].updateAvailable).toBe(false);
      expect(updatedList[0].installAvailable).toBe(true);
    });
  });

  describe('findLinkedBaseInstall', () => {
    it('matches base install by exact path', () => {
      const baseInstalls: BaseInstallInfo[] = [
        { id: 'b1', path: tmpDir }
      ];
      const match = findLinkedBaseInstall(tmpDir, baseInstalls);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('b1');
    });

    it('returns null when path does not match and no junctions exist', () => {
      const baseInstalls: BaseInstallInfo[] = [
        { id: 'b1', path: path.join(tmpDir, 'other') }
      ];
      const match = findLinkedBaseInstall(tmpDir, baseInstalls);
      expect(match).toBeNull();
    });
  });
});
