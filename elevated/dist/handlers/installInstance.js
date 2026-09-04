"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installInstanceHandler = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fsUtils_1 = require("./fsUtils");
function getDriveLetter(p) {
    const match = /^([a-zA-Z]:)/.exec(path_1.default.resolve(p));
    return match ? match[1].toUpperCase() : '';
}
function updateGameUserSettings(filePath, settings) {
    let lines = [];
    if (fs_1.default.existsSync(filePath)) {
        const raw = fs_1.default.readFileSync(filePath, 'utf-8');
        lines = raw.split(/\r?\n/);
    }
    // Find [ServerSettings] section
    let serverSettingsIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().toLowerCase() === '[serversettings]') {
            serverSettingsIndex = i;
            break;
        }
    }
    const keysToSet = { ...settings };
    const updatedKeys = new Set();
    if (serverSettingsIndex !== -1) {
        // Find where [ServerSettings] section ends (next section header or end of file)
        let nextSectionIndex = lines.length;
        for (let i = serverSettingsIndex + 1; i < lines.length; i++) {
            if (/^\s*\[.+\]/.test(lines[i].trim())) {
                nextSectionIndex = i;
                break;
            }
        }
        // Update existing keys in [ServerSettings]
        for (let i = serverSettingsIndex + 1; i < nextSectionIndex; i++) {
            const match = lines[i].match(/^\s*([^=]+?)\s*=/);
            if (match) {
                const existingKey = match[1].trim();
                for (const [targetKey, targetVal] of Object.entries(keysToSet)) {
                    if (existingKey.toLowerCase() === targetKey.toLowerCase()) {
                        lines[i] = `${targetKey}=${targetVal}`;
                        updatedKeys.add(targetKey);
                        break;
                    }
                }
            }
        }
        // Insert any missing keys before the next section
        const missingLines = [];
        for (const [targetKey, targetVal] of Object.entries(keysToSet)) {
            if (!updatedKeys.has(targetKey)) {
                missingLines.push(`${targetKey}=${targetVal}`);
            }
        }
        if (missingLines.length > 0) {
            lines.splice(nextSectionIndex, 0, ...missingLines);
        }
    }
    else {
        // [ServerSettings] does not exist in file, add it
        if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
            lines.push('');
        }
        lines.push('[ServerSettings]');
        for (const [targetKey, targetVal] of Object.entries(keysToSet)) {
            lines.push(`${targetKey}=${targetVal}`);
        }
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }
    lines.push('');
    fs_1.default.writeFileSync(filePath, lines.join('\r\n'), 'utf-8');
}
const installInstanceHandler = async (params) => {
    const { baseInstallPath, instanceDirectory, linkType = 'Junction', rconPort, queryPort, gamePort, adminPassword, serverPassword, modIds } = params;
    if (!baseInstallPath || !instanceDirectory) {
        throw new Error('baseInstallPath and instanceDirectory are required');
    }
    // Validate base install
    if (!fs_1.default.existsSync(baseInstallPath) || !fs_1.default.statSync(baseInstallPath).isDirectory()) {
        throw new Error(`Base install directory '${baseInstallPath}' does not exist or is not a directory.`);
    }
    if (!fs_1.default.existsSync(path_1.default.join(baseInstallPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe'))) {
        throw new Error(`ArkAscendedServer.exe not found in base install at '${baseInstallPath}'.`);
    }
    // Create instance directory if needed
    (0, fsUtils_1.ensureDirSync)(instanceDirectory);
    // Create instance-specific subdirectories
    const instanceShooterGamePath = path_1.default.join(instanceDirectory, 'ShooterGame');
    const instanceSavedPath = path_1.default.join(instanceShooterGamePath, 'Saved');
    (0, fsUtils_1.ensureDirSync)(instanceShooterGamePath);
    (0, fsUtils_1.ensureDirSync)(instanceSavedPath);
    (0, fsUtils_1.ensureDirSync)(path_1.default.join(instanceSavedPath, 'Config', 'WindowsServer'));
    (0, fsUtils_1.ensureDirSync)(path_1.default.join(instanceSavedPath, 'Logs'));
    (0, fsUtils_1.ensureDirSync)(path_1.default.join(instanceSavedPath, 'SavedArks'));
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
    function link(target, source, type) {
        if (fs_1.default.existsSync(target))
            return;
        if (effectiveLinkType === 'Junction' && type === 'dir') {
            (0, fsUtils_1.createJunction)(target, source);
        }
        else {
            (0, fsUtils_1.createSymlink)(target, source, type);
        }
    }
    // --- Link items in baseInstallPath (root) ---
    for (const item of fs_1.default.readdirSync(baseInstallPath, { withFileTypes: true })) {
        if (excludeFromRoot.includes(item.name))
            continue;
        const source = path_1.default.join(baseInstallPath, item.name);
        const target = path_1.default.join(instanceDirectory, item.name);
        link(target, source, item.isDirectory() ? 'dir' : 'file');
    }
    // --- Link items in baseInstallPath/ShooterGame ---
    const baseShooterGamePath = path_1.default.join(baseInstallPath, 'ShooterGame');
    if (fs_1.default.existsSync(baseShooterGamePath) && fs_1.default.statSync(baseShooterGamePath).isDirectory()) {
        for (const item of fs_1.default.readdirSync(baseShooterGamePath, { withFileTypes: true })) {
            if (excludeFromShooterGame.includes(item.name))
                continue;
            const source = path_1.default.join(baseShooterGamePath, item.name);
            const target = path_1.default.join(instanceShooterGamePath, item.name);
            link(target, source, item.isDirectory() ? 'dir' : 'file');
        }
        // Always create real Binaries dir
        const instanceBinariesPath = path_1.default.join(instanceShooterGamePath, 'Binaries');
        (0, fsUtils_1.ensureDirSync)(instanceBinariesPath);
        // --- Link items in baseInstallPath/ShooterGame/Binaries ---
        const baseBinariesPath = path_1.default.join(baseShooterGamePath, 'Binaries');
        if (fs_1.default.existsSync(baseBinariesPath) && fs_1.default.statSync(baseBinariesPath).isDirectory()) {
            for (const item of fs_1.default.readdirSync(baseBinariesPath, { withFileTypes: true })) {
                if (excludeFromBinaries.includes(item.name))
                    continue;
                const source = path_1.default.join(baseBinariesPath, item.name);
                const target = path_1.default.join(instanceBinariesPath, item.name);
                link(target, source, item.isDirectory() ? 'dir' : 'file');
            }
        }
        // Always create real Win64 dir
        const instanceWin64Path = path_1.default.join(instanceBinariesPath, 'Win64');
        (0, fsUtils_1.ensureDirSync)(instanceWin64Path);
        // --- Link items in baseInstallPath/ShooterGame/Binaries/Win64 ---
        const baseWin64Path = path_1.default.join(baseBinariesPath, 'Win64');
        if (fs_1.default.existsSync(baseWin64Path) && fs_1.default.statSync(baseWin64Path).isDirectory()) {
            for (const item of fs_1.default.readdirSync(baseWin64Path, { withFileTypes: true })) {
                if (excludeFromWin64.includes(item.name))
                    continue;
                const source = path_1.default.join(baseWin64Path, item.name);
                const target = path_1.default.join(instanceWin64Path, item.name);
                link(target, source, item.isDirectory() ? 'dir' : 'file');
            }
            // Now handle ShooterGame subdir (but do NOT link the directory itself)
            const baseWin64ShooterGamePath = path_1.default.join(baseWin64Path, 'ShooterGame');
            const instanceWin64ShooterGamePath = path_1.default.join(instanceWin64Path, 'ShooterGame');
            (0, fsUtils_1.ensureDirSync)(instanceWin64ShooterGamePath);
            if (fs_1.default.existsSync(baseWin64ShooterGamePath) && fs_1.default.statSync(baseWin64ShooterGamePath).isDirectory()) {
                for (const item of fs_1.default.readdirSync(baseWin64ShooterGamePath, { withFileTypes: true })) {
                    if (excludeFromWin64ShooterGame.includes(item.name))
                        continue;
                    const source = path_1.default.join(baseWin64ShooterGamePath, item.name);
                    const target = path_1.default.join(instanceWin64ShooterGamePath, item.name);
                    link(target, source, item.isDirectory() ? 'dir' : 'file');
                }
            }
            // Ensure Mods and ModsUserData are real folders
            for (const realFolder of excludeFromWin64ShooterGame) {
                const realFolderPath = path_1.default.join(instanceWin64ShooterGamePath, realFolder);
                (0, fsUtils_1.ensureDirSync)(realFolderPath);
            }
        }
    }
    // Ensure config files exist and are configured
    const configDir = path_1.default.join(instanceSavedPath, 'Config', 'WindowsServer');
    (0, fsUtils_1.ensureDirSync)(configDir);
    const effectiveRconPort = rconPort || queryPort || 27020;
    const gusSettings = {
        RCONEnabled: 'True',
        RCONPort: effectiveRconPort,
        ServerAdminPassword: adminPassword || ''
    };
    if (serverPassword !== undefined && serverPassword !== null && serverPassword !== '') {
        gusSettings.ServerPassword = serverPassword;
    }
    const gusPath = path_1.default.join(configDir, 'GameUserSettings.ini');
    updateGameUserSettings(gusPath, gusSettings);
    const gameIniPath = path_1.default.join(configDir, 'Game.ini');
    if (!fs_1.default.existsSync(gameIniPath)) {
        fs_1.default.writeFileSync(gameIniPath, '[/Script/ShooterGame.ShooterGameMode]\n', 'utf-8');
    }
    const ids = String(modIds || '').split(/[,\s]+/).filter(Boolean).filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);
    fs_1.default.writeFileSync(path_1.default.join(instanceDirectory, 'ark-launch-args.txt'), `${ids.length ? `-mods=${ids.join(',')} ` : ''}-automanagedmods\n`, 'utf-8');
    return `SUCCESS: Ark Ascended server instance created successfully at '${instanceDirectory}'!\nUnique config files are located in: '${instanceDirectory}\\ShooterGame\\Saved\\Config\\WindowsServer'`;
};
exports.installInstanceHandler = installInstanceHandler;
