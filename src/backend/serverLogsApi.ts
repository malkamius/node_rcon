import fs from 'fs';
import path from 'path';

export interface ServerLogFileInfo {
  name: string;
  size: number;
  mtime: number; // timestamp in ms
  isCurrent: boolean;
  isCrash: boolean;
}

export interface TailLogResult {
  file: string;
  lines: string[];
  totalLines: number;
  mtime: number;
  size: number;
}

/**
 * Resolves the Logs directory for a given server profile or directory path.
 * In ARK: Survival Ascended, logs reside in <directory>\ShooterGame\Saved\Logs\
 */
export function getServerLogsDir(directory: string): string | null {
  if (!directory || typeof directory !== 'string') return null;
  const resolved = path.resolve(directory);
  return path.join(resolved, 'ShooterGame', 'Saved', 'Logs');
}

/**
 * Checks if a requested filename is safe (prevents directory traversal attacks)
 */
export function isSafeLogFileName(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false;
  // Must be just a filename, no path separators or parent directory references
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  // Standard ARK log extensions and crash dump files
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.log') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.dmp') ||
    lower.endsWith('.xml')
  );
}

/**
 * Lists all log and crash files in the instance's Logs folder.
 * Returns them sorted by modification time (newest first).
 */
export async function listServerLogFiles(directory: string): Promise<ServerLogFileInfo[]> {
  const logsDir = getServerLogsDir(directory);
  if (!logsDir || !fs.existsSync(logsDir)) {
    return [];
  }

  const entries = await fs.promises.readdir(logsDir, { withFileTypes: true });
  const results: ServerLogFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    const lower = name.toLowerCase();

    // Accept .log, .txt, .dmp, .xml
    if (
      !lower.endsWith('.log') &&
      !lower.endsWith('.txt') &&
      !lower.endsWith('.dmp') &&
      !lower.endsWith('.xml')
    ) {
      continue;
    }

    try {
      const fullPath = path.join(logsDir, name);
      const stat = await fs.promises.stat(fullPath);
      const isCurrent = lower === 'shootergame.log';
      const isCrash =
        lower.includes('crash') ||
        lower.endsWith('.dmp') ||
        lower.endsWith('.xml') ||
        lower.includes('assert');

      results.push({
        name,
        size: stat.size,
        mtime: stat.mtimeMs,
        isCurrent,
        isCrash,
      });
    } catch {
      // Ignore unreadable files
    }
  }

  // Sort newest first, with ShooterGame.log pinned to top if present
  results.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return b.mtime - a.mtime;
  });

  return results;
}

/**
 * Reads the last N lines from a log file, with optional search string filtering.
 */
export async function tailServerLog(
  directory: string,
  filename: string,
  options: { lines?: number; search?: string } = {}
): Promise<TailLogResult> {
  if (!isSafeLogFileName(filename)) {
    throw new Error('Invalid or unsafe log filename');
  }

  const logsDir = getServerLogsDir(directory);
  if (!logsDir) {
    throw new Error('Log directory not found');
  }

  const filePath = path.join(logsDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Log file not found: ${filename}`);
  }

  const stat = await fs.promises.stat(filePath);
  const maxLines = Math.max(1, Math.min(options.lines || 200, 5000));
  const searchFilter = (options.search || '').trim().toLowerCase();

  // If file is under 1MB, read using UTF-8 readFile
  // For larger files, read the tail chunk
  let content = '';
  const CHUNK_SIZE = 1024 * 1024; // 1 MB
  if (stat.size <= CHUNK_SIZE) {
    content = await fs.promises.readFile(filePath, 'utf-8');
  } else {
    // Read the tail portion of the file
    const buffer = Buffer.alloc(CHUNK_SIZE);
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const startPos = Math.max(0, stat.size - CHUNK_SIZE);
      const { bytesRead } = await fd.read(buffer, 0, CHUNK_SIZE, startPos);
      content = buffer.toString('utf-8', 0, bytesRead);
    } finally {
      await fd.close();
    }
  }

  // Split into lines (handling both \r\n and \n)
  let allLines = content.split(/\r?\n/);
  // If the last item is empty because the file ends with newline, pop it
  if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
    allLines.pop();
  }

  const totalLines = allLines.length;

  // Apply search filter if provided
  if (searchFilter) {
    allLines = allLines.filter(line => line.toLowerCase().includes(searchFilter));
  }

  // Take the last maxLines
  const slicedLines = allLines.slice(-maxLines);

  return {
    file: filename,
    lines: slicedLines,
    totalLines,
    mtime: stat.mtimeMs,
    size: stat.size,
  };
}

/**
 * Returns the absolute path to a log file after validating safety.
 */
export function getLogFilePath(directory: string, filename: string): string {
  if (!isSafeLogFileName(filename)) {
    throw new Error('Invalid or unsafe log filename');
  }
  const logsDir = getServerLogsDir(directory);
  if (!logsDir) {
    throw new Error('Log directory not configured');
  }
  const target = path.join(logsDir, filename);
  // Extra check to verify target is strictly within logsDir
  const relative = path.relative(logsDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path traversal detected');
  }
  return target;
}
