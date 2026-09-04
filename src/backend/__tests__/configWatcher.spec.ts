import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigWatcher, createConfigWatcher } from '../configWatcher';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 25): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (predicate()) return;
    } catch {}
    await sleep(intervalMs);
  }
  if (!predicate()) {
    throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
  }
}

describe('ConfigWatcher', () => {
  let tmpDir: string;
  let configPath: string;
  let watcher: ConfigWatcher | null = null;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-watcher-test-'));
    configPath = path.join(tmpDir, 'config.json');
    watcher = null;
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
      watcher = null;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. Debouncing: multiple rapid file writes within debounceMs result in a single reload', async () => {
    const initialConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }],
      steamcmdPath: 'C:\\steamcmd\\0'
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    const onConfigChanged = jest.fn();

    watcher = createConfigWatcher({
      configPath,
      debounceMs: 150,
      onProfilesChanged,
      onConfigChanged
    });
    watcher.start();
    expect(watcher.isWatching()).toBe(true);

    // Perform multiple rapid writes within the 150ms debounce window
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          profiles: [{ host: '127.0.0.1', port: 7777 + i, name: `Server ${i}` }],
          steamcmdPath: `C:\\steamcmd\\${i}`
        }),
        'utf-8'
      );
      await sleep(15);
    }

    // Wait for the debounce timer to settle and fire
    await waitFor(() => onProfilesChanged.mock.calls.length > 0, 2500);
    // Allow an extra window to confirm no further calls are made
    await sleep(250);

    expect(onProfilesChanged).toHaveBeenCalledTimes(1);
    expect(onConfigChanged).toHaveBeenCalledTimes(1);
    expect(onConfigChanged).toHaveBeenCalledWith(
      expect.objectContaining({ steamcmdPath: 'C:\\steamcmd\\5' })
    );
  });

  it('2. Profile additions: triggers onProfilesChanged with new profile and changed key', async () => {
    const initialConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      debounceMs: 50,
      onProfilesChanged
    });
    watcher.start();

    const updatedConfig = {
      profiles: [
        { host: '127.0.0.1', port: 7777, name: 'Server 1' },
        { host: '127.0.0.1', port: 7778, name: 'Server 2' }
      ]
    };
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig), 'utf-8');

    await waitFor(() => onProfilesChanged.mock.calls.length > 0);

    expect(onProfilesChanged).toHaveBeenCalledWith(
      updatedConfig.profiles,
      ['127.0.0.1:7778']
    );
  });

  it('3. Profile updates: changes in port, host, password, or fields triggers onProfilesChanged with appropriate key', async () => {
    const initialConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, password: 'initial_password', name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      debounceMs: 50,
      onProfilesChanged
    });
    watcher.start();

    // 3a. Update password/fields on existing host:port
    const passwordUpdatedConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, password: 'updated_password', name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(passwordUpdatedConfig), 'utf-8');

    await waitFor(() => onProfilesChanged.mock.calls.length === 1);
    expect(onProfilesChanged).toHaveBeenLastCalledWith(
      passwordUpdatedConfig.profiles,
      ['127.0.0.1:7777']
    );

    // 3b. Update port (e.g. 7777 -> 7779)
    const portUpdatedConfig = {
      profiles: [{ host: '127.0.0.1', port: 7779, password: 'updated_password', name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(portUpdatedConfig), 'utf-8');

    await waitFor(() => onProfilesChanged.mock.calls.length === 2);
    const lastCallKeys = onProfilesChanged.mock.calls[1][1];
    expect(lastCallKeys).toEqual(expect.arrayContaining(['127.0.0.1:7777', '127.0.0.1:7779']));
  });

  it('4. Profile deletions: removing a profile triggers onProfilesChanged with the removed key', async () => {
    const initialConfig = {
      profiles: [
        { host: '127.0.0.1', port: 7777, name: 'Server 1' },
        { host: '127.0.0.1', port: 7778, name: 'Server 2' }
      ]
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      debounceMs: 50,
      onProfilesChanged
    });
    watcher.start();

    const updatedConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig), 'utf-8');

    await waitFor(() => onProfilesChanged.mock.calls.length > 0);

    expect(onProfilesChanged).toHaveBeenCalledWith(
      updatedConfig.profiles,
      ['127.0.0.1:7778']
    );
  });

  it('5. Config general change: triggers onConfigChanged when other keys (e.g. steamcmdPath) change', async () => {
    const initialConfig = {
      steamcmdPath: 'C:\\steamcmd\\old',
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    const onConfigChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      debounceMs: 50,
      onProfilesChanged,
      onConfigChanged
    });
    watcher.start();

    const updatedConfig = {
      steamcmdPath: 'C:\\steamcmd\\new',
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig), 'utf-8');

    await waitFor(() => onConfigChanged.mock.calls.length > 0);

    expect(onConfigChanged).toHaveBeenCalledWith(updatedConfig);
    expect(onProfilesChanged).not.toHaveBeenCalled();
  });

  it('6. Corrupt JSON: writing `{ broken json` calls onError and does not crash; writing valid JSON afterwards recovers', async () => {
    const initialConfig = {
      steamcmdPath: 'C:\\steamcmd',
      profiles: []
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onError = jest.fn();
    const onConfigChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      debounceMs: 50,
      onError,
      onConfigChanged
    });
    watcher.start();

    // Write malformed JSON
    fs.writeFileSync(configPath, '{ broken json', 'utf-8');
    await waitFor(() => onError.mock.calls.length > 0);

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onConfigChanged).not.toHaveBeenCalled();

    // Write valid JSON and verify recovery
    const recoveredConfig = {
      steamcmdPath: 'C:\\steamcmd\\recovered',
      profiles: []
    };
    fs.writeFileSync(configPath, JSON.stringify(recoveredConfig), 'utf-8');
    await waitFor(() => onConfigChanged.mock.calls.length > 0);

    expect(onConfigChanged).toHaveBeenCalledWith(recoveredConfig);
  });

  it('7. markLastKnownConfig: ensures subsequent file watcher trigger detects no diff and does not call onProfilesChanged', async () => {
    const initialConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    const onConfigChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      debounceMs: 50,
      onProfilesChanged,
      onConfigChanged
    });
    watcher.start();

    const newConfig = {
      profiles: [
        { host: '127.0.0.1', port: 7777, name: 'Server 1' },
        { host: '127.0.0.1', port: 7778, name: 'Server 2' }
      ]
    };

    // Mark as last known before/concurrent with saving to disk
    watcher.markLastKnownConfig(newConfig);

    // Save to disk
    fs.writeFileSync(configPath, JSON.stringify(newConfig), 'utf-8');

    // Wait past debounce duration
    await sleep(150);

    expect(onProfilesChanged).not.toHaveBeenCalled();
    expect(onConfigChanged).not.toHaveBeenCalled();
  });

  it('8. stop() cleanly cleans up watcher and pending debounce timers', async () => {
    const initialConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      debounceMs: 150,
      onProfilesChanged
    });
    watcher.start();
    expect(watcher.isWatching()).toBe(true);

    // Write changes
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        profiles: [{ host: '127.0.0.1', port: 8888, name: 'Server Changed' }]
      }),
      'utf-8'
    );

    // Immediately stop watcher before debounce timer expires
    watcher.stop();
    expect(watcher.isWatching()).toBe(false);

    // Wait well past debounce time
    await sleep(250);

    expect(onProfilesChanged).not.toHaveBeenCalled();
  });

  it('supports markLastKnownProfiles to avoid duplicate notification for saved profiles', async () => {
    const initialConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      debounceMs: 50,
      onProfilesChanged
    });
    watcher.start();

    const updatedProfiles = [
      { host: '127.0.0.1', port: 7777, name: 'Server 1' },
      { host: '127.0.0.1', port: 9999, name: 'Server 3' }
    ];
    watcher.markLastKnownProfiles(updatedProfiles);

    fs.writeFileSync(configPath, JSON.stringify({ profiles: updatedProfiles }), 'utf-8');
    await sleep(150);

    expect(onProfilesChanged).not.toHaveBeenCalled();
  });

  it('reload() and reloadNow() return false when file content is identical', () => {
    const initialConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      onProfilesChanged
    });
    watcher.start();

    // Baseline is already set on start
    expect(watcher.reload()).toBe(false);
    expect(watcher.reloadNow()).toBe(false);
    expect(onProfilesChanged).not.toHaveBeenCalled();
  });

  it('handles atomic file replacement / rename event cleanly', async () => {
    const initialConfig = {
      profiles: [{ host: '127.0.0.1', port: 7777, name: 'Server 1' }]
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf-8');

    const onProfilesChanged = jest.fn();
    watcher = createConfigWatcher({
      configPath,
      debounceMs: 50,
      onProfilesChanged
    });
    watcher.start();

    // Simulate atomic write (write to temp file, then rename/replace destination)
    const tempFilePath = path.join(tmpDir, 'config.tmp');
    const newConfig = {
      profiles: [
        { host: '127.0.0.1', port: 7777, name: 'Server 1' },
        { host: '127.0.0.1', port: 7778, name: 'Server 2' }
      ]
    };
    fs.writeFileSync(tempFilePath, JSON.stringify(newConfig), 'utf-8');
    fs.renameSync(tempFilePath, configPath);

    await waitFor(() => onProfilesChanged.mock.calls.length > 0);
    expect(onProfilesChanged).toHaveBeenCalledWith(
      newConfig.profiles,
      ['127.0.0.1:7778']
    );
  });
});
