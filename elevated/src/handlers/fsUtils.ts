// Utility for creating directories and links with elevation if needed
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createJunction(target: string, source: string) {
  // mklink /J target source
  execSync(`cmd /c mklink /J "${target}" "${source}"`, { stdio: 'inherit' });
}

export function createSymlink(target: string, source: string, type: 'dir' | 'file') {
  fs.symlinkSync(source, target, type);
}

export function isAdmin(): boolean {
  // Try to create a symlink in a temp dir, catch error
  try {
    const tmp = path.join(process.env.TEMP || '/tmp', `test-symlink-${Date.now()}`);
    fs.symlinkSync(__filename, tmp);
    fs.unlinkSync(tmp);
    return true;
  } catch {
    return false;
  }
}
