import fs from 'fs';
import path from 'path';

export const ARK_SA_APP_ID = '2430930';
export const STEAMCMD_API_URL = `https://api.steamcmd.net/v1/info/${ARK_SA_APP_ID}`;

export interface BaseInstallInfo {
  id: string;
  path: string;
  version?: string | null;
  lastUpdated?: string | null;
  updateAvailable?: boolean;
  installAvailable?: boolean;
  latestBuildId?: string | null;
  isDirty?: boolean;
  [key: string]: any;
}

/**
 * Extracts the "buildid" field from a Valve ACF / VDF manifest string.
 * Format typically looks like:
 *   "buildid"		"12345678"
 */
export function parseAcfBuildId(acfContent: string): string | null {
  if (!acfContent) return null;
  const match = acfContent.match(/"buildid"\s+"(\d+)"/i);
  return match ? match[1] : null;
}

/**
 * Reads and parses the appmanifest ACF file for a given game install directory.
 * Standard location: <installDir>/steamapps/appmanifest_<appId>.acf
 */
export function getAcfBuildIdFromDir(installDir: string, appId: string = ARK_SA_APP_ID): string | null {
  try {
    if (!installDir || typeof installDir !== 'string') return null;
    const acfPath = path.join(installDir, 'steamapps', `appmanifest_${appId}.acf`);
    if (!fs.existsSync(acfPath)) return null;
    const raw = fs.readFileSync(acfPath, 'utf-8');
    return parseAcfBuildId(raw);
  } catch {
    return null;
  }
}

/**
 * Queries the public SteamCMD branch API for the latest published buildid.
 */
export async function fetchSteamLatestBuildId(
  appId: string = ARK_SA_APP_ID,
  apiUrl: string = STEAMCMD_API_URL
): Promise<string | null> {
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    const data: any = await res.json();
    const buildId = data?.data?.[appId]?.depots?.branches?.public?.buildid;
    return buildId ? String(buildId) : null;
  } catch {
    return null;
  }
}

/**
 * Inspects a list of base installs against installed ACF files and the latest build ID.
 * Returns the updated base install objects along with a flag indicating if any field changed.
 */
export function evaluateBaseInstalls(
  baseInstalls: BaseInstallInfo[],
  latestBuildId: string | null,
  appId: string = ARK_SA_APP_ID
): { updatedList: BaseInstallInfo[]; hasChanges: boolean } {
  let hasChanges = false;
  const updatedList = (baseInstalls || []).map((base) => {
    const updated: BaseInstallInfo = { ...base };
    try {
      const installedBuildId = getAcfBuildIdFromDir(updated.path, appId);

      if (installedBuildId) {
        const isUpdateAvailable = !!(
          latestBuildId &&
          Number.parseInt(installedBuildId, 10) < Number.parseInt(latestBuildId, 10)
        );

        if (
          updated.version !== installedBuildId ||
          updated.updateAvailable !== isUpdateAvailable ||
          updated.latestBuildId !== latestBuildId ||
          updated.installAvailable !== false
        ) {
          hasChanges = true;
        }

        updated.version = installedBuildId;
        updated.updateAvailable = isUpdateAvailable;
        updated.installAvailable = false;
        updated.latestBuildId = latestBuildId;
      } else {
        // ACF not found: check if directory exists
        const dirExists = fs.existsSync(updated.path);
        const installAvail = dirExists;

        if (
          updated.version !== null ||
          updated.updateAvailable !== false ||
          updated.installAvailable !== installAvail ||
          updated.latestBuildId !== latestBuildId
        ) {
          hasChanges = true;
        }

        updated.version = null;
        updated.updateAvailable = false;
        updated.installAvailable = installAvail;
        updated.latestBuildId = latestBuildId;
      }
    } catch {
      if (
        updated.version !== null ||
        updated.updateAvailable !== false ||
        updated.installAvailable !== false ||
        updated.latestBuildId !== latestBuildId
      ) {
        hasChanges = true;
      }
      updated.version = null;
      updated.updateAvailable = false;
      updated.installAvailable = false;
      updated.latestBuildId = latestBuildId;
    }

    return updated;
  });

  return { updatedList, hasChanges };
}

/**
 * Resolves whether a server directory is linked to a base install.
 * Matches by directory path or by checking if <serverDir>/steamapps is junctioned/symlinked into a base install.
 */
export function findLinkedBaseInstall(
  serverDir: string,
  baseInstalls: BaseInstallInfo[]
): BaseInstallInfo | null {
  if (!serverDir || !Array.isArray(baseInstalls) || baseInstalls.length === 0) return null;

  const normalize = (p: string) => path.resolve(p).toLowerCase();
  const normalizedServerDir = normalize(serverDir);

  // 1. Direct match
  const direct = baseInstalls.find((b) => normalize(b.path) === normalizedServerDir);
  if (direct) return direct;

  // 2. Junction / realpath match on steamapps or binaries
  try {
    const steamappsPath = path.join(serverDir, 'steamapps');
    if (fs.existsSync(steamappsPath)) {
      const real = fs.realpathSync(steamappsPath);
      const parentDir = path.dirname(real);
      const matched = baseInstalls.find((b) => normalize(b.path) === normalize(parentDir));
      if (matched) return matched;
    }
  } catch {
    // Ignore resolution errors
  }

  return null;
}
