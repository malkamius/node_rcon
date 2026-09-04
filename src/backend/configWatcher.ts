import fs from 'fs';

export interface ConfigWatcherLogger {
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
}

export interface ConfigWatcherOptions {
  configPath: string;
  debounceMs?: number;
  onProfilesChanged?: (profiles: any[], changedKeys: string[]) => void;
  onConfigChanged?: (config: any) => void;
  onError?: (err: Error) => void;
  logger?: ConfigWatcherLogger;
}

export class ConfigWatcher {
  private configPath: string;
  private debounceMs: number;
  private onProfilesChanged?: (profiles: any[], changedKeys: string[]) => void;
  private onConfigChanged?: (config: any) => void;
  private onError?: (err: Error) => void;
  private logger?: ConfigWatcherLogger;

  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private reattachTimer: NodeJS.Timeout | null = null;

  private lastRawContent: string | null = null;
  private lastKnownConfig: any = null;
  private lastKnownProfiles: any[] = [];
  private watching: boolean = false;
  private isClosed: boolean = false;

  constructor(options: ConfigWatcherOptions) {
    this.configPath = options.configPath;
    this.debounceMs = options.debounceMs ?? 250;
    this.onProfilesChanged = options.onProfilesChanged;
    this.onConfigChanged = options.onConfigChanged;
    this.onError = options.onError;
    this.logger = options.logger;
  }

  public start(): void {
    if (this.watching && this.watcher) {
      return;
    }
    this.watching = true;
    this.isClosed = false;

    if (this.lastKnownConfig === null) {
      this.seedBaseline();
    }

    this.attachWatcher();
  }

  public stop(): void {
    this.watching = false;
    this.isClosed = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.reattachTimer) {
      clearTimeout(this.reattachTimer);
      this.reattachTimer = null;
    }

    if (this.watcher) {
      try {
        this.watcher.close();
      } catch (err: any) {
        this.logger?.warn?.(`ConfigWatcher: error closing watcher: ${err?.message || String(err)}`);
      }
      this.watcher = null;
    }
  }

  public isWatching(): boolean {
    return this.watching && !this.isClosed;
  }

  public markLastKnownConfig(config: any): void {
    if (config && typeof config === 'object') {
      this.lastKnownConfig = JSON.parse(JSON.stringify(config));
      if (Array.isArray(config.profiles)) {
        this.lastKnownProfiles = JSON.parse(JSON.stringify(config.profiles));
      }
    } else {
      this.lastKnownConfig = null;
      this.lastKnownProfiles = [];
    }
  }

  public markLastKnownProfiles(profiles: any[]): void {
    this.lastKnownProfiles = Array.isArray(profiles) ? JSON.parse(JSON.stringify(profiles)) : [];
    if (this.lastKnownConfig && typeof this.lastKnownConfig === 'object') {
      this.lastKnownConfig = {
        ...this.lastKnownConfig,
        profiles: this.lastKnownProfiles
      };
    }
  }

  public reloadNow(): boolean {
    return this.reload();
  }

  public reload(): boolean {
    if (!fs.existsSync(this.configPath)) {
      this.logger?.warn?.(`ConfigWatcher: config file not found at ${this.configPath}`);
      return false;
    }

    let rawContent: string;
    try {
      rawContent = fs.readFileSync(this.configPath, 'utf-8');
    } catch (err: any) {
      const readErr = err instanceof Error ? err : new Error(String(err));
      this.logger?.error?.(`ConfigWatcher: error reading config file: ${readErr.message}`);
      this.onError?.(readErr);
      return false;
    }

    // Avoid false positive triggers when raw content has not changed
    if (this.lastRawContent !== null && rawContent === this.lastRawContent) {
      return false;
    }

    let newConfig: any;
    try {
      newConfig = JSON.parse(rawContent);
    } catch (err: any) {
      const parseErr = err instanceof Error ? err : new Error(String(err));
      this.logger?.error?.(`ConfigWatcher: error parsing JSON: ${parseErr.message}`);
      this.onError?.(parseErr);
      return false;
    }

    const newProfiles: any[] = Array.isArray(newConfig?.profiles) ? newConfig.profiles : [];
    const oldProfiles: any[] = Array.isArray(this.lastKnownProfiles) ? this.lastKnownProfiles : [];

    // Diff profiles by host:port
    const getKey = (p: any): string => {
      if (!p || typeof p !== 'object') return '';
      return `${p.host}:${p.port}`;
    };

    const oldMap = new Map<string, any>();
    for (const p of oldProfiles) {
      const key = getKey(p);
      if (key) oldMap.set(key, p);
    }

    const newMap = new Map<string, any>();
    for (const p of newProfiles) {
      const key = getKey(p);
      if (key) newMap.set(key, p);
    }

    const changedKeysSet = new Set<string>();
    for (const [key, newP] of newMap.entries()) {
      const oldP = oldMap.get(key);
      if (!oldP || JSON.stringify(oldP) !== JSON.stringify(newP)) {
        changedKeysSet.add(key);
      }
    }
    for (const key of oldMap.keys()) {
      if (!newMap.has(key)) {
        changedKeysSet.add(key);
      }
    }
    const changedKeys = Array.from(changedKeysSet);

    const profilesChanged = changedKeys.length > 0 || JSON.stringify(oldProfiles) !== JSON.stringify(newProfiles);

    // Diff general config (excluding profiles)
    const oldConfigWithoutProfiles = this.lastKnownConfig ? { ...this.lastKnownConfig } : {};
    delete oldConfigWithoutProfiles.profiles;
    const newConfigWithoutProfiles = newConfig ? { ...newConfig } : {};
    delete newConfigWithoutProfiles.profiles;

    const generalConfigChanged = this.lastKnownConfig === null
      ? Object.keys(newConfigWithoutProfiles).length > 0
      : JSON.stringify(oldConfigWithoutProfiles) !== JSON.stringify(newConfigWithoutProfiles);

    // Update last known state
    this.lastRawContent = rawContent;
    this.lastKnownConfig = JSON.parse(JSON.stringify(newConfig));
    this.lastKnownProfiles = JSON.parse(JSON.stringify(newProfiles));

    const hasChanges = profilesChanged || generalConfigChanged;

    if (profilesChanged && this.onProfilesChanged) {
      this.onProfilesChanged(newProfiles, changedKeys);
    }

    if (generalConfigChanged || (!this.onProfilesChanged && profilesChanged)) {
      this.onConfigChanged?.(newConfig);
    }

    return hasChanges;
  }

  private seedBaseline(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        this.lastRawContent = raw;
        const parsed = JSON.parse(raw);
        this.lastKnownConfig = parsed;
        this.lastKnownProfiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
      }
    } catch (err: any) {
      this.logger?.warn?.(`ConfigWatcher: failed to seed initial baseline: ${err?.message || String(err)}`);
    }
  }

  private attachWatcher(): void {
    if (this.isClosed || !this.watching) return;

    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
      this.watcher = null;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        this.scheduleReattach(200);
        return;
      }

      this.watcher = fs.watch(this.configPath, (eventType) => {
        this.handleWatchEvent(eventType);
      });

      if (this.watcher && typeof this.watcher.unref === 'function') {
        this.watcher.unref();
      }

      this.watcher.on('error', (err) => {
        this.logger?.warn?.(`ConfigWatcher: watch error on ${this.configPath}: ${err?.message || String(err)}`);
        this.scheduleReattach(200);
      });
    } catch (err: any) {
      this.logger?.warn?.(`ConfigWatcher: failed to attach watcher to ${this.configPath}: ${err?.message || String(err)}`);
      this.scheduleReattach(200);
    }
  }

  private handleWatchEvent(eventType: string): void {
    if (this.isClosed || !this.watching) return;

    // Handle atomic replace by editors on Windows
    if (eventType === 'rename') {
      this.scheduleReattach(100);
    }

    this.triggerDebouncedReload();
  }

  private triggerDebouncedReload(): void {
    if (this.isClosed || !this.watching) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.isClosed || !this.watching) return;
      this.reload();
    }, this.debounceMs);

    if (this.debounceTimer && typeof this.debounceTimer.unref === 'function') {
      this.debounceTimer.unref();
    }
  }

  private scheduleReattach(delayMs = 100): void {
    if (this.isClosed || !this.watching) return;

    if (this.reattachTimer) {
      clearTimeout(this.reattachTimer);
      this.reattachTimer = null;
    }

    this.reattachTimer = setTimeout(() => {
      this.reattachTimer = null;
      if (this.isClosed || !this.watching) return;
      this.attachWatcher();
    }, delayMs);

    if (this.reattachTimer && typeof this.reattachTimer.unref === 'function') {
      this.reattachTimer.unref();
    }
  }
}

export function createConfigWatcher(options: ConfigWatcherOptions): ConfigWatcher {
  return new ConfigWatcher(options);
}
