import path from 'path';
import fs from 'fs';

const configPath = path.join(__dirname, '../../config.json');

export function getProfiles() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return config.profiles || [];
}

export function saveProfiles(profiles: any[]) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  config.profiles = profiles;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
