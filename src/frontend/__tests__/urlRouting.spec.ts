import {
  parseUrlParams,
  buildUrlHash,
  resolveBookmarkedServerKey,
  isValidActivity,
} from '../urlRouting';

describe('urlRouting', () => {
  const sampleProfiles = [
    { host: '127.0.0.1', port: 28155, name: 'The Island Main' },
    { host: '192.168.1.100', port: 28015, name: 'Scorched Earth PvP' },
    { host: '10.0.0.5', port: 7777, name: 'Aberration Cluster' },
  ];

  describe('parseUrlParams', () => {
    it('parses standard hash with server key', () => {
      const result = parseUrlParams('', '#server=127.0.0.1:28155');
      expect(result.serverKey).toBe('127.0.0.1:28155');
      expect(result.activity).toBeNull();
    });

    it('parses hash with server key and activity tab', () => {
      const result = parseUrlParams('', '#server=127.0.0.1:28155&activity=config');
      expect(result.serverKey).toBe('127.0.0.1:28155');
      expect(result.activity).toBe('config');
    });

    it('parses hash with baseinstalls activity', () => {
      const result = parseUrlParams('', '#activity=baseinstalls');
      expect(result.serverKey).toBeNull();
      expect(result.activity).toBe('baseinstalls');
    });

    it('parses raw hash without parameter name (e.g. #127.0.0.1:28155)', () => {
      const result = parseUrlParams('', '#127.0.0.1:28155');
      expect(result.serverKey).toBe('127.0.0.1:28155');
      expect(result.activity).toBeNull();
    });

    it('parses query string when hash is empty', () => {
      const result = parseUrlParams('?server=192.168.1.100:28015&activity=config', '');
      expect(result.serverKey).toBe('192.168.1.100:28015');
      expect(result.activity).toBe('config');
    });

    it('prefers hash parameters over search parameters', () => {
      const result = parseUrlParams('?server=10.0.0.5:7777', '#server=127.0.0.1:28155');
      expect(result.serverKey).toBe('127.0.0.1:28155');
    });

    it('decodes URI encoded characters in server key and activity', () => {
      const result = parseUrlParams('', '#server=127.0.0.1%3A28155&activity=rcon');
      expect(result.serverKey).toBe('127.0.0.1:28155');
      expect(result.activity).toBe('rcon');
    });

    it('handles empty, null, or undefined location strings', () => {
      const result = parseUrlParams('', '');
      expect(result.serverKey).toBeNull();
      expect(result.activity).toBeNull();
    });

    it('ignores invalid activity strings', () => {
      const result = parseUrlParams('', '#server=127.0.0.1:28155&activity=invalid_tab');
      expect(result.serverKey).toBe('127.0.0.1:28155');
      expect(result.activity).toBeNull();
    });
  });

  describe('buildUrlHash', () => {
    it('builds hash with server key', () => {
      expect(buildUrlHash('127.0.0.1:28155')).toBe('#server=127.0.0.1%3A28155');
    });

    it('builds hash with server key and non-default activity', () => {
      expect(buildUrlHash('127.0.0.1:28155', 'config')).toBe(
        '#server=127.0.0.1%3A28155&activity=config'
      );
      expect(buildUrlHash('127.0.0.1:28155', 'baseinstalls')).toBe(
        '#server=127.0.0.1%3A28155&activity=baseinstalls'
      );
    });

    it('omits rcon activity because it is the default', () => {
      expect(buildUrlHash('127.0.0.1:28155', 'rcon')).toBe('#server=127.0.0.1%3A28155');
    });

    it('returns empty string when serverKey is null and activity is rcon or null', () => {
      expect(buildUrlHash(null, null)).toBe('');
      expect(buildUrlHash('', 'rcon')).toBe('');
    });

    it('builds hash with activity only when serverKey is null', () => {
      expect(buildUrlHash(null, 'baseinstalls')).toBe('#activity=baseinstalls');
    });
  });

  describe('resolveBookmarkedServerKey', () => {
    it('resolves exact host:port match', () => {
      const resolved = resolveBookmarkedServerKey('127.0.0.1:28155', sampleProfiles);
      expect(resolved).toBe('127.0.0.1:28155');
    });

    it('resolves host:port match case-insensitively', () => {
      const resolved = resolveBookmarkedServerKey('127.0.0.1:28155', sampleProfiles);
      expect(resolved).toBe('127.0.0.1:28155');
    });

    it('resolves by server profile name', () => {
      const resolved = resolveBookmarkedServerKey('The Island Main', sampleProfiles);
      expect(resolved).toBe('127.0.0.1:28155');
    });

    it('resolves by server profile name case-insensitively', () => {
      const resolved = resolveBookmarkedServerKey('scorched earth pvp', sampleProfiles);
      expect(resolved).toBe('192.168.1.100:28015');
    });

    it('preserves valid host:port string even if not present in loaded profiles', () => {
      const resolved = resolveBookmarkedServerKey('10.200.0.1:9999', sampleProfiles);
      expect(resolved).toBe('10.200.0.1:9999');
    });

    it('returns null for unknown name not in profiles and not formatted as host:port', () => {
      const resolved = resolveBookmarkedServerKey('NonExistentServer', sampleProfiles);
      expect(resolved).toBeNull();
    });

    it('returns null for empty or null inputs', () => {
      expect(resolveBookmarkedServerKey(null, sampleProfiles)).toBeNull();
      expect(resolveBookmarkedServerKey('', sampleProfiles)).toBeNull();
      expect(resolveBookmarkedServerKey('   ', sampleProfiles)).toBeNull();
      expect(resolveBookmarkedServerKey('127.0.0.1:28155', [])).toBeNull();
    });
  });

  describe('isValidActivity', () => {
    it('validates activity tabs', () => {
      expect(isValidActivity('rcon')).toBe(true);
      expect(isValidActivity('config')).toBe(true);
      expect(isValidActivity('baseinstalls')).toBe(true);
      expect(isValidActivity('other')).toBe(false);
      expect(isValidActivity('')).toBe(false);
    });
  });
});
