// installInstance.ts
import { HandlerFn } from '../TaskHandler';
import fs from 'fs';
import path from 'path';
import { ensureDirSync, createJunction, createSymlink, isAdmin } from './fsUtils';

function getDriveLetter(p: string) {
  const match = /^([a-zA-Z]:)/.exec(path.resolve(p));
  return match ? match[1].toUpperCase() : '';
}

export const installInstanceHandler: HandlerFn = async (params) => {
  const { baseInstallPath, instanceDirectory, linkType = 'Junction' } = params;
  if (!baseInstallPath || !instanceDirectory) {
    throw new Error('baseInstallPath and instanceDirectory are required');
  }
  // Validate base install
  if (!fs.existsSync(baseInstallPath) || !fs.statSync(baseInstallPath).isDirectory()) {
    throw new Error(`Base install directory '${baseInstallPath}' does not exist or is not a directory.`);
  }
  if (!fs.existsSync(path.join(baseInstallPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe'))) {
    throw new Error(`ArkAscendedServer.exe not found in base install at '${baseInstallPath}'.`);
  }
  // Create instance directory if needed
  ensureDirSync(instanceDirectory);
  // Create instance-specific subdirectories
  const instanceShooterGamePath = path.join(instanceDirectory, 'ShooterGame');
  const instanceSavedPath = path.join(instanceShooterGamePath, 'Saved');
  ensureDirSync(instanceShooterGamePath);
  ensureDirSync(instanceSavedPath);
  ensureDirSync(path.join(instanceSavedPath, 'Config', 'WindowsServer'));
  ensureDirSync(path.join(instanceSavedPath, 'Logs'));
  ensureDirSync(path.join(instanceSavedPath, 'SavedArks'));

  // Determine link type (junction or symlink)
  let effectiveLinkType = linkType;
  if (linkType === 'Junction') {
    const baseDrive = getDriveLetter(baseInstallPath);
    const instanceDrive = getDriveLetter(instanceDirectory);
    if (baseDrive !== instanceDrive) {
      effectiveLinkType = 'SymbolicLink';
    }
  }

  // Exclusion lists
  const excludeFromRoot = ['ShooterGame'];
  const excludeFromShooterGame = ['Saved', 'Binaries'];
  const excludeFromBinaries = ['Win64'];
  const excludeFromWin64 = ['ShooterGame'];
  const excludeFromWin64ShooterGame = ['Mods', 'ModsUserData'];

  // Helper to create a link
  function link(target: string, source: string, type: 'dir' | 'file') {
    if (fs.existsSync(target)) return;
    if (effectiveLinkType === 'Junction' && type === 'dir') {
      createJunction(target, source);
    } else {
      createSymlink(target, source, type);
    }
  }

  // --- Link items in baseInstallPath (root) ---
  for (const item of fs.readdirSync(baseInstallPath, { withFileTypes: true })) {
    if (excludeFromRoot.includes(item.name)) continue;
    const source = path.join(baseInstallPath, item.name);
    const target = path.join(instanceDirectory, item.name);
    link(target, source, item.isDirectory() ? 'dir' : 'file');
  }

  // --- Link items in baseInstallPath/ShooterGame ---
  const baseShooterGamePath = path.join(baseInstallPath, 'ShooterGame');
  if (fs.existsSync(baseShooterGamePath) && fs.statSync(baseShooterGamePath).isDirectory()) {
    for (const item of fs.readdirSync(baseShooterGamePath, { withFileTypes: true })) {
      if (excludeFromShooterGame.includes(item.name)) continue;
      const source = path.join(baseShooterGamePath, item.name);
      const target = path.join(instanceShooterGamePath, item.name);
      link(target, source, item.isDirectory() ? 'dir' : 'file');
    }
    // Always create real Binaries dir
    const instanceBinariesPath = path.join(instanceShooterGamePath, 'Binaries');
    ensureDirSync(instanceBinariesPath);
    // --- Link items in baseInstallPath/ShooterGame/Binaries ---
    const baseBinariesPath = path.join(baseShooterGamePath, 'Binaries');
    if (fs.existsSync(baseBinariesPath) && fs.statSync(baseBinariesPath).isDirectory()) {
      for (const item of fs.readdirSync(baseBinariesPath, { withFileTypes: true })) {
        if (excludeFromBinaries.includes(item.name)) continue;
        const source = path.join(baseBinariesPath, item.name);
        const target = path.join(instanceBinariesPath, item.name);
        link(target, source, item.isDirectory() ? 'dir' : 'file');
      }
    }
    // Always create real Win64 dir
    const instanceWin64Path = path.join(instanceBinariesPath, 'Win64');
    ensureDirSync(instanceWin64Path);
    // --- Link items in baseInstallPath/ShooterGame/Binaries/Win64 ---
    const baseWin64Path = path.join(baseBinariesPath, 'Win64');
    if (fs.existsSync(baseWin64Path) && fs.statSync(baseWin64Path).isDirectory()) {
      for (const item of fs.readdirSync(baseWin64Path, { withFileTypes: true })) {
        if (excludeFromWin64.includes(item.name)) continue;
        const source = path.join(baseWin64Path, item.name);
        const target = path.join(instanceWin64Path, item.name);
        link(target, source, item.isDirectory() ? 'dir' : 'file');
      }
      // Now handle ShooterGame subdir (but do NOT link the directory itself)
      const baseWin64ShooterGamePath = path.join(baseWin64Path, 'ShooterGame');
      const instanceWin64ShooterGamePath = path.join(instanceWin64Path, 'ShooterGame');
      ensureDirSync(instanceWin64ShooterGamePath);
      if (fs.existsSync(baseWin64ShooterGamePath) && fs.statSync(baseWin64ShooterGamePath).isDirectory()) {
        for (const item of fs.readdirSync(baseWin64ShooterGamePath, { withFileTypes: true })) {
          if (excludeFromWin64ShooterGame.includes(item.name)) continue;
          const source = path.join(baseWin64ShooterGamePath, item.name);
          const target = path.join(instanceWin64ShooterGamePath, item.name);
          link(target, source, item.isDirectory() ? 'dir' : 'file');
        }
      }
      // Ensure Mods and ModsUserData are real folders
      for (const realFolder of excludeFromWin64ShooterGame) {
        const realFolderPath = path.join(instanceWin64ShooterGamePath, realFolder);
        ensureDirSync(realFolderPath);
      }
    }
  }

  return `SUCCESS: Ark Ascended server instance created successfully at '${instanceDirectory}'!\nUnique config files are located in: '${instanceDirectory}\\ShooterGame\\Saved\\Config\\WindowsServer'`;
};
