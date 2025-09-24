"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDirSync = ensureDirSync;
exports.createJunction = createJunction;
exports.createSymlink = createSymlink;
exports.isAdmin = isAdmin;
// Utility for creating directories and links with elevation if needed
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
function ensureDirSync(dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
function createJunction(target, source) {
    // mklink /J target source
    (0, child_process_1.execSync)(`cmd /c mklink /J "${target}" "${source}"`, { stdio: 'inherit' });
}
function createSymlink(target, source, type) {
    fs_1.default.symlinkSync(source, target, type);
}
function isAdmin() {
    // Try to create a symlink in a temp dir, catch error
    try {
        const tmp = path_1.default.join(process.env.TEMP || '/tmp', `test-symlink-${Date.now()}`);
        fs_1.default.symlinkSync(__filename, tmp);
        fs_1.default.unlinkSync(tmp);
        return true;
    }
    catch {
        return false;
    }
}
