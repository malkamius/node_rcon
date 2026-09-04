import {
  formatBroadcastResult,
  getConnectionSummary,
  calculateConnectionSummary,
  BroadcastResultItem,
  BroadcastProfileInfo,
} from '../rconTerminalManager';

describe('broadcastFormatting', () => {
  const sampleProfiles: BroadcastProfileInfo[] = [
    { host: '127.0.0.1', port: 28155, name: 'The Island Alpha' },
    { host: '192.168.1.100', port: 28015, name: 'Scorched Earth PvP' },
    { host: '10.0.0.5', port: 7777, name: 'Aberration Cluster' },
  ];

  describe('formatBroadcastResult', () => {
    it('formats broadcast header with ANSI cyan styling', () => {
      const command = 'SaveWorld';
      const results: BroadcastResultItem[] = [];
      const lines = formatBroadcastResult(command, results, sampleProfiles);

      expect(lines[0]).toBe('\x1b[1;36m[BROADCAST]\x1b[0m > SaveWorld');
    });

    it('formats successful server responses with green ANSI codes', () => {
      const command = 'SaveWorld';
      const results: BroadcastResultItem[] = [
        {
          key: '127.0.0.1:28155',
          output: 'World Save Complete',
          status: 'success',
        },
        {
          key: '192.168.1.100:28015',
          output: 'Saving game state...',
          status: 'connected',
        },
        {
          key: '10.0.0.5:7777',
          output: 'World saved.',
          // status omitted, clean output
        },
      ];

      const lines = formatBroadcastResult(command, results, sampleProfiles);

      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('\x1b[1;36m[BROADCAST]\x1b[0m > SaveWorld');
      expect(lines[1]).toBe('\x1b[1;32m[The Island Alpha (127.0.0.1:28155)]\x1b[0m World Save Complete');
      expect(lines[2]).toBe('\x1b[1;32m[Scorched Earth PvP (192.168.1.100:28015)]\x1b[0m Saving game state...');
      expect(lines[3]).toBe('\x1b[1;32m[Aberration Cluster (10.0.0.5:7777)]\x1b[0m World saved.');
    });

    it('formats disconnected and error server responses with red ANSI codes', () => {
      const command = 'Broadcast Hello';
      const results: BroadcastResultItem[] = [
        {
          key: '127.0.0.1:28155',
          output: '[RCON] Not connected',
          status: 'disconnected',
        },
        {
          key: '192.168.1.100:28015',
          output: '[RCON ERROR] Connection timed out after 5000ms',
          status: 'error',
        },
        {
          key: '10.0.0.5:7777',
          output: '[RCON ERROR] Socket closed by remote host',
        },
      ];

      const lines = formatBroadcastResult(command, results, sampleProfiles);

      expect(lines).toHaveLength(4);
      expect(lines[1]).toBe('\x1b[1;31m[The Island Alpha (127.0.0.1:28155)]\x1b[0m [RCON] Not connected');
      expect(lines[2]).toBe('\x1b[1;31m[Scorched Earth PvP (192.168.1.100:28015)]\x1b[0m [RCON ERROR] Connection timed out after 5000ms');
      expect(lines[3]).toBe('\x1b[1;31m[Aberration Cluster (10.0.0.5:7777)]\x1b[0m [RCON ERROR] Socket closed by remote host');
    });

    it('resolves server name with precedence: result.serverName > profile.name > result.key', () => {
      const command = 'DoExit';
      const results: BroadcastResultItem[] = [
        // 1. Explicit serverName on result overrides profile
        {
          key: '127.0.0.1:28155',
          output: 'Shutting down...',
          status: 'success',
          serverName: 'Overridden Island Name',
        },
        // 2. Profile name resolved by key
        {
          key: '192.168.1.100:28015',
          output: 'Shutting down...',
          status: 'success',
        },
        // 3. Unknown server key with no profile match falls back to key
        {
          key: '172.16.0.99:27015',
          output: 'Shutting down...',
          status: 'success',
        },
      ];

      const lines = formatBroadcastResult(command, results, sampleProfiles);

      expect(lines[1]).toBe('\x1b[1;32m[Overridden Island Name (127.0.0.1:28155)]\x1b[0m Shutting down...');
      expect(lines[2]).toBe('\x1b[1;32m[Scorched Earth PvP (192.168.1.100:28015)]\x1b[0m Shutting down...');
      expect(lines[3]).toBe('\x1b[1;32m[172.16.0.99:27015 (172.16.0.99:27015)]\x1b[0m Shutting down...');
    });

    it('handles empty results and missing profile lists gracefully', () => {
      const command = 'ListPlayers';
      const emptyResults = formatBroadcastResult(command, []);
      expect(emptyResults).toEqual(['\x1b[1;36m[BROADCAST]\x1b[0m > ListPlayers']);

      const singleWithoutProfiles = formatBroadcastResult(
        command,
        [{ key: '127.0.0.1:7777', output: 'No players' }]
      );
      expect(singleWithoutProfiles).toEqual([
        '\x1b[1;36m[BROADCAST]\x1b[0m > ListPlayers',
        '\x1b[1;32m[127.0.0.1:7777 (127.0.0.1:7777)]\x1b[0m No players',
      ]);
    });
  });

  describe('multi-server connection summary calculation', () => {
    it('calculates summary for mixed connected and disconnected servers', () => {
      const keys = ['127.0.0.1:28155', '192.168.1.100:28015', '10.0.0.5:7777'];
      const rconStatusMap = {
        '127.0.0.1:28155': { status: 'connected' },
        '192.168.1.100:28015': { status: 'connected' },
        '10.0.0.5:7777': { status: 'disconnected' },
      };

      const summary = getConnectionSummary(keys, rconStatusMap);

      expect(summary.total).toBe(3);
      expect(summary.connected).toBe(2);
      expect(summary.disconnected).toBe(1);
      expect(summary.text).toBe('2 Connected, 1 Disconnected');
    });

    it('calculates summary when all servers are connected', () => {
      const keys = ['127.0.0.1:28155', '192.168.1.100:28015'];
      const rconStatusMap = {
        '127.0.0.1:28155': { status: 'connected' },
        '192.168.1.100:28015': { status: 'connected' },
      };

      const summary = getConnectionSummary(keys, rconStatusMap);

      expect(summary.total).toBe(2);
      expect(summary.connected).toBe(2);
      expect(summary.disconnected).toBe(0);
      expect(summary.text).toBe('2 Connected, 0 Disconnected');
    });

    it('handles servers missing from statusMap as disconnected', () => {
      const keys = ['127.0.0.1:28155', '192.168.1.100:28015'];
      const rconStatusMap = {
        '127.0.0.1:28155': { status: 'connecting' },
      };

      const summary = getConnectionSummary(keys, rconStatusMap);

      expect(summary.total).toBe(2);
      expect(summary.connected).toBe(0);
      expect(summary.disconnected).toBe(2);
      expect(summary.text).toBe('0 Connected, 2 Disconnected');
    });

    it('handles empty keys array', () => {
      const summary = getConnectionSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.connected).toBe(0);
      expect(summary.disconnected).toBe(0);
      expect(summary.text).toBe('0 Connected, 0 Disconnected');
    });

    it('verifies calculateConnectionSummary is an alias of getConnectionSummary', () => {
      expect(calculateConnectionSummary).toBe(getConnectionSummary);
    });
  });
});
