export type ActivityTab = 'rcon' | 'config' | 'baseinstalls';

export interface ParsedUrlParams {
  serverKey: string | null;
  activity: ActivityTab | null;
}

/**
 * Parses hash string (e.g. #server=127.0.0.1:28155&activity=rcon or #127.0.0.1:28155)
 * and search query string (?server=127.0.0.1:28155&activity=rcon).
 * Hash parameters take precedence over search parameters.
 */
export function parseUrlParams(
  locationSearch: string = typeof window !== 'undefined' ? window.location.search : '',
  locationHash: string = typeof window !== 'undefined' ? window.location.hash : ''
): ParsedUrlParams {
  let serverKey: string | null = null;
  let activity: ActivityTab | null = null;

  // 1. Check search query string first as baseline
  const cleanSearch = (locationSearch || '').replace(/^\?/, '');
  if (cleanSearch) {
    const searchParams = new URLSearchParams(cleanSearch);
    const searchServer = searchParams.get('server');
    if (searchServer) {
      serverKey = decodeURIComponent(searchServer).trim();
    }
    const searchActivity = searchParams.get('activity');
    if (searchActivity && isValidActivity(searchActivity)) {
      activity = searchActivity as ActivityTab;
    }
  }

  // 2. Hash takes precedence if present
  const cleanHash = (locationHash || '').replace(/^#/, '').trim();
  if (cleanHash) {
    if (cleanHash.includes('=') || cleanHash.includes('&')) {
      const hashParams = new URLSearchParams(cleanHash);
      const hashServer = hashParams.get('server');
      if (hashServer) {
        serverKey = decodeURIComponent(hashServer).trim();
      }
      const hashActivity = hashParams.get('activity');
      if (hashActivity && isValidActivity(hashActivity)) {
        activity = hashActivity as ActivityTab;
      }
    } else {
      // Raw hash format: #127.0.0.1:28155 or #ServerName
      serverKey = decodeURIComponent(cleanHash).trim();
    }
  }

  return {
    serverKey: serverKey || null,
    activity: activity || null,
  };
}

export function isValidActivity(val: string): val is ActivityTab {
  return val === 'rcon' || val === 'config' || val === 'baseinstalls';
}

/**
 * Builds a hash fragment string representing the current server key and activity tab.
 * Example: "#server=127.0.0.1:28155" or "#server=127.0.0.1:28155&activity=config"
 */
export function buildUrlHash(serverKey: string | null, activity?: string | null): string {
  const parts: string[] = [];
  if (serverKey && serverKey.trim()) {
    parts.push(`server=${encodeURIComponent(serverKey.trim())}`);
  }
  if (activity && isValidActivity(activity) && activity !== 'rcon') {
    parts.push(`activity=${encodeURIComponent(activity)}`);
  }
  return parts.length > 0 ? `#${parts.join('&')}` : '';
}

/**
 * Safely updates browser URL hash using history.replaceState (without reload or history pollution).
 */
export function updateUrlHash(serverKey: string | null, activity?: string | null): void {
  if (typeof window === 'undefined') return;

  const newHash = buildUrlHash(serverKey, activity);
  const newUrl = `${window.location.pathname}${window.location.search}${newHash}`;

  try {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', newUrl);
    } else {
      window.location.hash = newHash;
    }
  } catch {
    try {
      window.location.hash = newHash;
    } catch {}
  }
}

/**
 * Matches a bookmarked server string against the available server profiles.
 * Checks exact host:port match, then profile name match (case-insensitive).
 * Returns canonical "host:port" key if found, or the raw key if it contains a colon.
 */
export function resolveBookmarkedServerKey(
  bookmarkedVal: string | null,
  profiles: Array<{ host: string; port: number; name?: string }>
): string | null {
  if (!bookmarkedVal || !bookmarkedVal.trim() || !profiles || profiles.length === 0) {
    return null;
  }

  const cleanVal = bookmarkedVal.trim().toLowerCase();

  // 1. Exact host:port match (case-insensitive)
  const exactMatch = profiles.find((p) => `${p.host}:${p.port}`.toLowerCase() === cleanVal);
  if (exactMatch) {
    return `${exactMatch.host}:${exactMatch.port}`;
  }

  // 2. Profile name match (case-insensitive)
  const nameMatch = profiles.find((p) => p.name && p.name.trim().toLowerCase() === cleanVal);
  if (nameMatch) {
    return `${nameMatch.host}:${nameMatch.port}`;
  }

  // 3. If raw value already looks like host:port (e.g. 127.0.0.1:28155), return it
  if (bookmarkedVal.includes(':')) {
    return bookmarkedVal.trim();
  }

  return null;
}

/**
 * Copies the deep bookmark URL for a server to the clipboard.
 */
export async function copyBookmarkLink(serverKey: string, activity?: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const hash = buildUrlHash(serverKey, activity);
  const fullUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(fullUrl);
      return true;
    } catch {}
  }

  // Fallback using textarea
  try {
    const textArea = document.createElement('textarea');
    textArea.value = fullUrl;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
