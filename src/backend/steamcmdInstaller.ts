import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { pipeline } from 'stream';
import * as unzipper from 'unzipper';

const STEAMCMD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';

export async function installSteamCmd(installDir: string): Promise<void> {
  if (!fs.existsSync(installDir)) {
    fs.mkdirSync(installDir, { recursive: true });
  }
  const zipFile = path.join(installDir, 'steamcmd.zip');
  await downloadSteamCmdZip(zipFile);
  await extractZip(zipFile, installDir);
  fs.unlinkSync(zipFile);
}

function downloadSteamCmdZip(dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(STEAMCMD_URL, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      pipeline(response, file, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }).on('error', reject);
  });
}

function extractZip(zipPath: string, extractTo: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractTo }))
      .on('close', resolve)
      .on('error', reject);
  });
}
