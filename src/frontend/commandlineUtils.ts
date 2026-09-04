export interface StandardFlag {
  id: string;
  label: string;
  description: string;
}

export const STANDARD_FLAGS: StandardFlag[] = [
  { id: '-NoBattlEye', label: 'Disable BattlEye', description: 'Run server without BattlEye anti-cheat' },
  { id: '-crossplay', label: 'Enable Crossplay', description: 'Allow crossplay across PC, Xbox, PlayStation' },
  { id: '-ForceAllowCaveFlyers', label: 'Force Cave Flyers', description: 'Allow flying mounts inside caves' },
  { id: '-automanagedmods', label: 'Auto-Managed Mods', description: 'Automatically download and update CurseForge mods' },
  { id: '-servergamelog', label: 'Server Game Log', description: 'Enable game event logging' },
  { id: '-severgamelogincludetribelogs', label: 'Include Tribe Logs', description: 'Include tribe activity logs in server game log' },
  { id: '-ServerRCONOutputTribeLogs', label: 'RCON Tribe Logs', description: 'Send tribe logs to RCON output stream' },
  { id: '-NotifyAdminCommandsInChat', label: 'Notify Admin Commands', description: 'Broadcast admin command executions in server chat' },
  { id: '-noundermeshchecking', label: 'Disable Undermesh Checks', description: 'Disable anti-undermesh teleport and kill checks' },
  { id: '-noantispeedhack', label: 'Disable Anti-Speedhack', description: 'Disable server movement speed validation checks' }
];

export const PRESET_MAPS: { id: string; name: string }[] = [
  { id: 'TheIsland_WP', name: 'The Island' },
  { id: 'ScorchedEarth_WP', name: 'Scorched Earth' },
  { id: 'TheCenter_WP', name: 'The Center' },
  { id: 'Aberration_WP', name: 'Aberration' },
  { id: 'Extinction_WP', name: 'Extinction' }
];

export interface ParsedLaunchSettings {
  mapName: string;
  queryPort?: number;
  gamePort?: number;
  serverPassword?: string;
  maxPlayers?: number;
  modIds: string;
  clusterId: string;
  clusterDirOverride: string;
  flags: Record<string, boolean>;
}

export function cleanModIds(raw: string): string {
  if (!raw) return '';
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s, i, all) => all.findIndex(v => v.toLowerCase() === s.toLowerCase()) === i)
    .join(',');
}

export function mergeModIds(existing: string, selected: string[]): string { return cleanModIds([existing, ...selected].join(',')); }

export function parseCommandline(args?: string[]): ParsedLaunchSettings {
  const flags: Record<string, boolean> = {};
  for (const f of STANDARD_FLAGS) {
    flags[f.id] = false;
  }

  if (!args || args.length === 0) {
    // Default flag configuration
    for (const f of STANDARD_FLAGS) {
      flags[f.id] = true;
    }
    return {
      mapName: 'TheIsland_WP',
      queryPort: undefined,
      gamePort: undefined,
      serverPassword: '',
      maxPlayers: 100,
      modIds: '',
      clusterId: '',
      clusterDirOverride: '',
      flags
    };
  }

  let mapName = 'TheIsland_WP';
  let queryPort: number | undefined;
  let gamePort: number | undefined;
  let serverPassword = '';
  let maxPlayers: number | undefined;
  let modIds = '';
  let clusterId = '';
  let clusterDirOverride = '';

  // Parse Arg 0 (Map + URL query parameters)
  if (args[0]) {
    const firstArg = args[0];
    const qIdx = firstArg.indexOf('?');
    if (qIdx !== -1) {
      mapName = firstArg.substring(0, qIdx);
      const queryParams = firstArg.substring(qIdx + 1).split('?');
      for (const param of queryParams) {
        if (param.toLowerCase().startsWith('queryport=')) {
          const val = parseInt(param.substring(10), 10);
          if (!isNaN(val)) queryPort = val;
        } else if (param.toLowerCase().startsWith('port=')) {
          const val = parseInt(param.substring(5), 10);
          if (!isNaN(val)) gamePort = val;
        } else if (param.toLowerCase().startsWith('serverpassword=')) {
          serverPassword = param.substring(15);
        } else if (param.toLowerCase().startsWith('maxplayers=')) {
          const val = parseInt(param.substring(11), 10);
          if (!isNaN(val)) maxPlayers = val;
        }
      }
    } else {
      mapName = firstArg;
    }
  }

  // Parse remaining arguments
  for (const arg of args) {
    const trimmed = arg.trim();
    if (/^port=\d+$/i.test(trimmed)) {
      const val = parseInt(trimmed.substring(5), 10);
      if (!isNaN(val)) gamePort = val;
    } else if (/^-mods=/i.test(trimmed)) {
      modIds = cleanModIds(trimmed.substring(6));
    } else if (/^-clusterid=/i.test(trimmed)) {
      const rawVal = trimmed.substring(11);
      clusterId = rawVal.replace(/^"(.*)"$/, '$1');
    } else if (/^-clusterdiroverride=/i.test(trimmed)) {
      const rawVal = trimmed.substring(20);
      clusterDirOverride = rawVal.replace(/^"(.*)"$/, '$1');
    }

    // Match flags
    for (const f of STANDARD_FLAGS) {
      if (trimmed.toLowerCase() === f.id.toLowerCase()) {
        flags[f.id] = true;
      }
    }
  }

  return {
    mapName,
    queryPort,
    gamePort,
    serverPassword,
    maxPlayers: maxPlayers ?? 100,
    modIds,
    clusterId,
    clusterDirOverride,
    flags
  };
}

export function buildOrSyncCommandline(
  existingArgs: string[] | undefined,
  settings: ParsedLaunchSettings,
  profile: { name: string; password?: string }
): string[] {
  let mapArg = settings.mapName?.trim() || 'TheIsland_WP';
  if (!mapArg.includes('_WP') && mapArg.toLowerCase() !== 'custom') {
    mapArg = `${mapArg}_WP`;
  }

  const queryPort = settings.queryPort || 27015;
  const gamePort = settings.gamePort || 7777;
  const maxPlayers = settings.maxPlayers || 100;
  const sessionName = profile.name || 'ARK Server';
  const serverPassword = settings.serverPassword?.trim();

  // If no existing arguments, generate fresh default command line
  if (!existingArgs || existingArgs.length === 0) {
    const firstArg = `${mapArg}?listen?SessionName="${sessionName}"?QueryPort=${queryPort}?MaxPlayers=${maxPlayers}?AllowCrateSpawnsOnTopOfStructures=True${
      serverPassword ? `?ServerPassword=${serverPassword}` : ''
    }`;

    const res: string[] = [
      firstArg,
      `ServerAdminPassword=${profile.password || ''}`,
      `Port=${gamePort}`
    ];

    if (settings.modIds) {
      res.push(`-mods=${cleanModIds(settings.modIds)}`);
    }
    if (settings.clusterId) {
      res.push(`-clusterID="${settings.clusterId.trim()}"`);
    }
    if (settings.clusterDirOverride) {
      res.push(`-ClusterDirOverride="${settings.clusterDirOverride.trim()}"`);
    }

    for (const f of STANDARD_FLAGS) {
      if (settings.flags[f.id]) {
        res.push(f.id);
      }
    }

    const baseStandard = [
      '-nosteamclient',
      '-game',
      '-server',
      '-log',
      '-ServerPlatform=ALL'
    ];
    for (const b of baseStandard) {
      if (!res.includes(b)) {
        res.push(b);
      }
    }
    return res;
  }

  // Work from existing arguments to preserve order and custom arguments
  const args = [...existingArgs];

  // 1. Update Arg 0 (Map + URL query parameters)
  if (args.length > 0) {
    const firstArg = args[0];
    const qIdx = firstArg.indexOf('?');
    const existingParams = qIdx !== -1 ? firstArg.substring(qIdx + 1).split('?') : [];

    let hasListen = false;
    let hasSessionName = false;
    let hasQueryPort = false;
    let hasMaxPlayers = false;
    let hasServerPassword = false;

    const newParams: string[] = [];
    for (const param of existingParams) {
      if (param.toLowerCase() === 'listen') {
        hasListen = true;
        newParams.push('listen');
      } else if (param.toLowerCase().startsWith('sessionname=')) {
        hasSessionName = true;
        newParams.push(`SessionName="${sessionName}"`);
      } else if (param.toLowerCase().startsWith('queryport=')) {
        hasQueryPort = true;
        newParams.push(`QueryPort=${queryPort}`);
      } else if (param.toLowerCase().startsWith('maxplayers=')) {
        hasMaxPlayers = true;
        newParams.push(`MaxPlayers=${maxPlayers}`);
      } else if (param.toLowerCase().startsWith('serverpassword=')) {
        hasServerPassword = true;
        if (serverPassword) {
          newParams.push(`ServerPassword=${serverPassword}`);
        }
      } else {
        newParams.push(param);
      }
    }

    if (!hasListen) newParams.unshift('listen');
    if (!hasSessionName) newParams.push(`SessionName="${sessionName}"`);
    if (!hasQueryPort) newParams.push(`QueryPort=${queryPort}`);
    if (!hasMaxPlayers) newParams.push(`MaxPlayers=${maxPlayers}`);
    if (!hasServerPassword && serverPassword) newParams.push(`ServerPassword=${serverPassword}`);

    args[0] = `${mapArg}?${newParams.filter(Boolean).join('?')}`;
  }

  // 2. Update ServerAdminPassword
  const adminIdx = args.findIndex((a) => /^serveradminpassword=/i.test(a));
  const adminVal = `ServerAdminPassword=${profile.password || ''}`;
  if (adminIdx !== -1) {
    args[adminIdx] = adminVal;
  } else {
    args.splice(1, 0, adminVal);
  }

  // 3. Update Port (Game Port)
  const portIdx = args.findIndex((a) => /^port=\d+$/i.test(a));
  const portVal = `Port=${gamePort}`;
  if (portIdx !== -1) {
    args[portIdx] = portVal;
  } else {
    const insertAt = Math.min(2, args.length);
    args.splice(insertAt, 0, portVal);
  }

  // 4. Update -mods
  const cleanedMods = cleanModIds(settings.modIds);
  const modIdx = args.findIndex((a) => /^-mods=/i.test(a));
  if (cleanedMods) {
    const modVal = `-mods=${cleanedMods}`;
    if (modIdx !== -1) {
      args[modIdx] = modVal;
    } else {
      args.push(modVal);
    }
  } else if (modIdx !== -1) {
    args.splice(modIdx, 1);
  }

  // 5. Update -clusterID
  const clusterIdVal = settings.clusterId?.trim();
  const clusterIdx = args.findIndex((a) => /^-clusterid=/i.test(a));
  if (clusterIdVal) {
    const val = `-clusterID="${clusterIdVal}"`;
    if (clusterIdx !== -1) {
      args[clusterIdx] = val;
    } else {
      args.push(val);
    }
  } else if (clusterIdx !== -1) {
    args.splice(clusterIdx, 1);
  }

  // 6. Update -ClusterDirOverride
  const clusterDirVal = settings.clusterDirOverride?.trim();
  const clusterDirIdx = args.findIndex((a) => /^-clusterdiroverride=/i.test(a));
  if (clusterDirVal) {
    const val = `-ClusterDirOverride="${clusterDirVal}"`;
    if (clusterDirIdx !== -1) {
      args[clusterDirIdx] = val;
    } else {
      args.push(val);
    }
  } else if (clusterDirIdx !== -1) {
    args.splice(clusterDirIdx, 1);
  }

  // 7. Update Standard Flags
  for (const f of STANDARD_FLAGS) {
    const isEnabled = !!settings.flags[f.id];
    const existingFlagIdx = args.findIndex((a) => a.toLowerCase() === f.id.toLowerCase());
    if (isEnabled && existingFlagIdx === -1) {
      args.push(f.id);
    } else if (!isEnabled && existingFlagIdx !== -1) {
      // Remove any instance of this disabled flag
      for (let i = args.length - 1; i >= 0; i--) {
        if (args[i].toLowerCase() === f.id.toLowerCase()) {
          args.splice(i, 1);
        }
      }
    }
  }

  return args;
}
