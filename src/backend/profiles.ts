import path from 'path';
import fs from 'fs';

const configPath = path.join(__dirname, '../../config.json');

// Optionally accept processStatuses to tack on status to each profile
let getProcessStatuses: (() => Record<string, any>) | null = null;
export function setGetProcessStatuses(fn: typeof getProcessStatuses) {
  getProcessStatuses = fn;
}

export function getProfiles() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const profiles = config.profiles || [];
  if (getProcessStatuses) {
    const statuses = getProcessStatuses();
    return profiles.map((p: any) => {
      const key = `${p.host}:${p.port}`;
      return { ...p, processStatus: statuses[key] || null };
    });
  }
  return profiles;
}

// Handler context and broadcast will be injected/set by server.ts
let profilesChangedEvent: ((type: string, payload: any) => void) | null = null;
export function setProfileChangedEvent(fn: typeof profilesChangedEvent) {
  profilesChangedEvent = fn;
}

let configWatcherInstance: { markLastKnownConfig?: (cfg: any) => void; markLastKnownProfiles?: (profs: any[]) => void } | null = null;
export function setConfigWatcher(watcher: typeof configWatcherInstance) {
  configWatcherInstance = watcher;
}

export function saveProfiles(profiles: any[]) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const oldProfiles = config.profiles || [];

  // Compare profiles for changes (shallow compare by JSON.stringify)
  const oldStr = JSON.stringify(oldProfiles);
  const newStr = JSON.stringify(profiles);
  if (oldStr === newStr) return; // No change, do nothing

  // Find changed server keys (host:port)
  const getKey = (p: any) => `${p.host}:${p.port}`;
  const oldMap = new Map(oldProfiles.map((p: any) => [getKey(p), p]));
  const newMap = new Map(profiles.map((p: any) => [getKey(p), p]));
  const changedKeys: string[] = [];
  for (const [key, newP] of newMap.entries()) {
    const oldP = oldMap.get(key);
    if (!oldP || JSON.stringify(oldP) !== JSON.stringify(newP)) {
      changedKeys.push(key);
    }
  }
  for (const key of oldMap.keys() as IterableIterator<string>) {
    if (!newMap.has(key)) changedKeys.push(key); // deleted or changed port/host
  }

  config.profiles = profiles;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  if (configWatcherInstance) {
    configWatcherInstance.markLastKnownConfig?.(config);
    configWatcherInstance.markLastKnownProfiles?.(profiles);
  }

  // Emit to frontend if broadcast is set
  if (profilesChangedEvent && changedKeys.length > 0) {
    profilesChangedEvent('profilesChanged', { changedKeys, profiles });
  }
}
