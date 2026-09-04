import path from 'path';
import fs from 'fs';

export interface IniBackupEntry {
  filename: string;
  baseFile: string;
  timestamp: string;
  formattedDate: string;
  size: number;
  mtime: string;
  isSafetyBackup: boolean;
}

export interface RestoreBackupResult {
  success: boolean;
  restoredFile: string;
  backupFilename: string;
  safetyBackupFile?: string;
  activeContent: string;
  error?: string;
}

export interface PruneIniBackupsOptions {
  file?: string;
  keepCount?: number;
  olderThanDays?: number;
  preserveSafetyBackups?: boolean;
}

export interface PruneIniBackupsResult {
  ok: boolean;
  prunedCount: number;
  keptCount: number;
  deletedFiles: string[];
  keptFiles: string[];
  error?: string;
}

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface SideBySideDiffRow {
  left?: { lineNumber: number; content: string; type: 'unchanged' | 'removed' };
  right?: { lineNumber: number; content: string; type: 'unchanged' | 'added' };
}

/**
 * Resolves the WindowsServer INI directory for a given server profile or directory path.
 */
export function getIniDir(serverOrDir: any): string {
  const directory = typeof serverOrDir === 'string' ? serverOrDir : serverOrDir?.directory;
  if (!directory || typeof directory !== 'string') {
    throw new Error('No directory set for server');
  }
  return path.join(directory, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
}

/**
 * Validates that a backup filename is safe (no path traversal, valid format).
 */
export function isSafeIniBackupFileName(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
  if (filename.includes('\0')) return false;
  // Must end with .backup.ini
  if (!filename.endsWith('.backup.ini')) return false;
  // Base name must start with letters/numbers/underscores followed by dot
  return /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_.:-]+\.backup\.ini$/i.test(filename);
}

/**
 * Determines base INI file name (e.g. 'GameUserSettings.ini') from a backup filename.
 */
export function getBaseFileNameFromBackup(backupFilename: string): string {
  if (backupFilename.startsWith('GameUserSettings.')) {
    return 'GameUserSettings.ini';
  }
  if (backupFilename.startsWith('Game.')) {
    return 'Game.ini';
  }
  const prefix = backupFilename.split('.')[0];
  return `${prefix}.ini`;
}

/**
 * Parse an ISO-like timestamp string from backup filename if present.
 */
export function parseTimestampFromBackupName(filename: string): string | null {
  // Matches e.g. GameUserSettings.2026-09-04T12-30-00-000Z.backup.ini or .pre-restore.backup.ini
  const match = filename.match(/^[a-zA-Z0-9_-]+\.([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}(?:-[0-9]{3})?Z?)/i);
  if (match && match[1]) {
    // Reconstruct ISO 8601 string: replace dashes back to colons and dots
    const raw = match[1];
    const parts = raw.split('T');
    if (parts.length === 2) {
      const datePart = parts[0];
      const timeParts = parts[1].replace(/Z$/i, '').split('-');
      if (timeParts.length >= 3) {
        const timePart = `${timeParts[0]}:${timeParts[1]}:${timeParts[2]}`;
        const msPart = timeParts[3] ? `.${timeParts[3]}` : '';
        return `${datePart}T${timePart}${msPart}Z`;
      }
    }
    return raw;
  }
  return null;
}

/**
 * Format a timestamp or mtime into a friendly human-readable date.
 */
export function formatBackupDate(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return String(isoOrDate);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return String(isoOrDate);
  }
}

/**
 * Enumerates all INI backup snapshots for a server instance.
 * @param serverOrDir Server profile or directory path
 * @param file Optional target base file (e.g. 'GameUserSettings.ini' or 'Game.ini')
 */
export function listIniBackups(serverOrDir: any, file?: string): IniBackupEntry[] {
  const dir = getIniDir(serverOrDir);
  if (!fs.existsSync(dir)) {
    return [];
  }

  let baseFilter: string | null = null;
  if (file) {
    baseFilter = path.basename(file, '.ini');
  }

  const entries: IniBackupEntry[] = [];
  const files = fs.readdirSync(dir);

  for (const f of files) {
    if (!f.endsWith('.backup.ini')) continue;
    if (!isSafeIniBackupFileName(f)) continue;

    const baseName = f.split('.')[0];
    if (baseFilter && baseName.toLowerCase() !== baseFilter.toLowerCase()) {
      continue;
    }

    const fullPath = path.join(dir, f);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      const parsedTimestamp = parseTimestampFromBackupName(f);
      const timestamp = parsedTimestamp || stat.mtime.toISOString();
      const isSafetyBackup = f.includes('.pre-restore.') || f.includes('.safety.');
      const baseFile = getBaseFileNameFromBackup(f);

      entries.push({
        filename: f,
        baseFile,
        timestamp,
        formattedDate: formatBackupDate(timestamp),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        isSafetyBackup
      });
    } catch {
      // Ignore unreadable files
    }
  }

  // Sort descending by mtime (newest first)
  entries.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
  return entries;
}

/**
 * Reads the content of an INI backup file safely.
 */
export function getIniBackupContent(
  serverOrDir: any,
  backupFilename: string
): { filename: string; content: string; size: number; mtime: string; isSafetyBackup: boolean } {
  if (!isSafeIniBackupFileName(backupFilename)) {
    throw new Error(`Invalid or unsafe backup filename: ${backupFilename}`);
  }

  const dir = getIniDir(serverOrDir);
  const fullPath = path.join(dir, backupFilename);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Backup file not found: ${backupFilename}`);
  }

  const stat = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const isSafetyBackup = backupFilename.includes('.pre-restore.') || backupFilename.includes('.safety.');

  return {
    filename: backupFilename,
    content,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    isSafetyBackup
  };
}

/**
 * Reads the content of the active INI file.
 */
export function getActiveIniContent(
  serverOrDir: any,
  baseFile: string
): { baseFile: string; content: string; size: number; exists: boolean } {
  const safeBase = path.basename(baseFile);
  const dir = getIniDir(serverOrDir);
  const fullPath = path.join(dir, safeBase);

  if (!fs.existsSync(fullPath)) {
    return { baseFile: safeBase, content: '', size: 0, exists: false };
  }

  const stat = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return { baseFile: safeBase, content, size: stat.size, exists: true };
}

/**
 * Restores an INI backup snapshot to the active INI file.
 * Automatically creates a pre-restore safety snapshot of the active INI file before restoring.
 */
export function restoreIniBackup(serverOrDir: any, backupFilename: string): RestoreBackupResult {
  if (!isSafeIniBackupFileName(backupFilename)) {
    throw new Error(`Invalid or unsafe backup filename: ${backupFilename}`);
  }

  const dir = getIniDir(serverOrDir);
  const backupPath = path.join(dir, backupFilename);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupFilename}`);
  }

  const baseFile = getBaseFileNameFromBackup(backupFilename);
  const activeFilePath = path.join(dir, baseFile);
  const baseNameNoExt = path.basename(baseFile, '.ini');

  let safetyBackupFile: string | undefined;

  // 1. Take safety snapshot of active file if it exists
  if (fs.existsSync(activeFilePath)) {
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    safetyBackupFile = `${baseNameNoExt}.${date}.pre-restore.backup.ini`;
    const safetyPath = path.join(dir, safetyBackupFile);
    fs.copyFileSync(activeFilePath, safetyPath);
  }

  // 2. Overwrite active file with chosen backup
  fs.copyFileSync(backupPath, activeFilePath);

  // 3. Read back restored active file content
  const activeContent = fs.readFileSync(activeFilePath, 'utf-8');

  return {
    success: true,
    restoredFile: baseFile,
    backupFilename,
    safetyBackupFile,
    activeContent
  };
}

/**
 * Prunes historical INI backups according to retention options.
 * Defaults: preserveSafetyBackups = true, keepCount = 10 (if neither keepCount nor olderThanDays is specified).
 */
export function pruneIniBackups(
  serverOrDir: any,
  options?: PruneIniBackupsOptions
): PruneIniBackupsResult {
  const dir = getIniDir(serverOrDir);
  const allBackups = listIniBackups(serverOrDir, options?.file);

  const preserveSafetyBackups = options?.preserveSafetyBackups !== false;
  let keepCount = options?.keepCount !== undefined && !isNaN(Number(options.keepCount))
    ? Number(options.keepCount)
    : undefined;
  const olderThanDays = options?.olderThanDays !== undefined && !isNaN(Number(options.olderThanDays))
    ? Number(options.olderThanDays)
    : undefined;

  if (keepCount === undefined && olderThanDays === undefined) {
    keepCount = 10;
  }

  const keptFiles: string[] = [];
  const deletedFiles: string[] = [];

  let regularBackups: IniBackupEntry[];
  if (preserveSafetyBackups) {
    regularBackups = [];
    for (const b of allBackups) {
      if (b.isSafetyBackup) {
        keptFiles.push(b.filename);
      } else {
        regularBackups.push(b);
      }
    }
  } else {
    regularBackups = [...allBackups];
  }

  const cutoffTime = olderThanDays !== undefined ? Date.now() - olderThanDays * 86400000 : undefined;

  for (let i = 0; i < regularBackups.length; i++) {
    const backup = regularBackups[i];
    let shouldDelete = false;

    const exceedsKeepCount = keepCount !== undefined && i >= keepCount;
    const backupTime = new Date(backup.mtime).getTime();
    const exceedsAge = cutoffTime !== undefined && backupTime < cutoffTime;

    if (keepCount !== undefined && cutoffTime !== undefined) {
      shouldDelete = exceedsKeepCount || exceedsAge;
    } else if (keepCount !== undefined) {
      shouldDelete = exceedsKeepCount;
    } else if (cutoffTime !== undefined) {
      shouldDelete = exceedsAge;
    }

    if (shouldDelete) {
      if (isSafeIniBackupFileName(backup.filename)) {
        const fullPath = path.join(dir, backup.filename);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
        deletedFiles.push(backup.filename);
      } else {
        keptFiles.push(backup.filename);
      }
    } else {
      keptFiles.push(backup.filename);
    }
  }

  return {
    ok: true,
    prunedCount: deletedFiles.length,
    keptCount: keptFiles.length,
    deletedFiles,
    keptFiles
  };
}

/**
 * Deletes a single INI backup snapshot safely.
 */
export function deleteIniBackup(
  serverOrDir: any,
  filename: string
): { success: boolean; deletedFile: string } {
  if (!isSafeIniBackupFileName(filename)) {
    throw new Error(`Invalid or unsafe backup filename: ${filename}`);
  }

  const dir = getIniDir(serverOrDir);
  const fullPath = path.join(dir, filename);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Backup file not found: ${filename}`);
  }

  fs.unlinkSync(fullPath);
  return { success: true, deletedFile: filename };
}

/**
 * Computes an LCS line diff between two texts.
 * Returns an array of DiffLine items.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const linesOld = oldText.split(/\r?\n/);
  const linesNew = newText.split(/\r?\n/);

  // If both empty
  if (linesOld.length === 1 && linesOld[0] === '' && linesNew.length === 1 && linesNew[0] === '') {
    return [];
  }

  let start = 0;
  let endOld = linesOld.length;
  let endNew = linesNew.length;

  const result: DiffLine[] = [];

  // Common prefix optimization
  while (start < endOld && start < endNew && linesOld[start] === linesNew[start]) {
    result.push({
      type: 'unchanged',
      oldLineNumber: start + 1,
      newLineNumber: start + 1,
      content: linesOld[start]
    });
    start++;
  }

  // Common suffix optimization
  const suffixOld: DiffLine[] = [];
  while (endOld > start && endNew > start && linesOld[endOld - 1] === linesNew[endNew - 1]) {
    suffixOld.unshift({
      type: 'unchanged',
      oldLineNumber: endOld,
      newLineNumber: endNew,
      content: linesOld[endOld - 1]
    });
    endOld--;
    endNew--;
  }

  const subOld = linesOld.slice(start, endOld);
  const subNew = linesNew.slice(start, endNew);

  const n = subOld.length;
  const m = subNew.length;

  // Standard LCS DP on the trimmed middle
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (subOld[i - 1] === subNew[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to assemble diff lines
  let i = n;
  let j = m;
  const middle: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && subOld[i - 1] === subNew[j - 1]) {
      middle.unshift({
        type: 'unchanged',
        oldLineNumber: start + i,
        newLineNumber: start + j,
        content: subOld[i - 1]
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      middle.unshift({
        type: 'added',
        newLineNumber: start + j,
        content: subNew[j - 1]
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      middle.unshift({
        type: 'removed',
        oldLineNumber: start + i,
        content: subOld[i - 1]
      });
      i--;
    }
  }

  return [...result, ...middle, ...suffixOld];
}

/**
 * Converts line diff into side-by-side rows for dual-pane rendering.
 */
export function computeSideBySideDiff(oldText: string, newText: string): SideBySideDiffRow[] {
  const diff = computeLineDiff(oldText, newText);
  const rows: SideBySideDiffRow[] = [];

  let idx = 0;
  while (idx < diff.length) {
    const item = diff[idx];

    if (item.type === 'unchanged') {
      rows.push({
        left: { lineNumber: item.oldLineNumber!, content: item.content, type: 'unchanged' },
        right: { lineNumber: item.newLineNumber!, content: item.content, type: 'unchanged' }
      });
      idx++;
    } else {
      // Gather consecutive removed and added items
      const removedChunk: DiffLine[] = [];
      const addedChunk: DiffLine[] = [];

      while (idx < diff.length && diff[idx].type === 'removed') {
        removedChunk.push(diff[idx]);
        idx++;
      }
      while (idx < diff.length && diff[idx].type === 'added') {
        addedChunk.push(diff[idx]);
        idx++;
      }

      const maxLen = Math.max(removedChunk.length, addedChunk.length);
      for (let r = 0; r < maxLen; r++) {
        const rem = removedChunk[r];
        const add = addedChunk[r];
        rows.push({
          left: rem ? { lineNumber: rem.oldLineNumber!, content: rem.content, type: 'removed' } : undefined,
          right: add ? { lineNumber: add.newLineNumber!, content: add.content, type: 'added' } : undefined
        });
      }
    }
  }

  return rows;
}
