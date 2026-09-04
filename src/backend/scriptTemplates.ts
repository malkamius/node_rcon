import path from 'path';
import fs from 'fs';

export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  isBuiltIn?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export const BUILT_IN_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'builtin-restart-update-15m',
    name: 'Restart and Update 15 min',
    description: 'Notifies players in intervals before restarting or updating base files.',
    content: [
      'serverchat SYSTEM: Restart and update in 15 minutes',
      'wait 300000',
      'serverchat SYSTEM: Restart and update in 10 minutes',
      'wait 300000',
      'serverchat SYSTEM: Restart and update in 5 minutes',
      'wait 240000',
      'serverchat SYSTEM: Restart and update in 1 minute',
      'wait 50000',
      'serverchat SYSTEM: Restart and update in 10 seconds',
      'wait 10000',
      'SaveWorld'
    ].join('\n'),
    isBuiltIn: true
  },
  {
    id: 'builtin-quick-broadcast-30s',
    name: 'Quick Broadcast 30s',
    description: 'Broadcasting quick shutdown alert with 30s delay and world save.',
    content: [
      'serverchat SYSTEM: Server restart initiated. Saving world in 30 seconds...',
      'wait 20000',
      'serverchat SYSTEM: Restarting in 10 seconds! Please find safety.',
      'wait 10000',
      'SaveWorld'
    ].join('\n'),
    isBuiltIn: true
  },
  {
    id: 'builtin-save-world-now',
    name: 'Save World Now',
    description: 'Immediately triggers an in-game world save via RCON.',
    content: 'SaveWorld',
    isBuiltIn: true
  },
  {
    id: 'builtin-default-template',
    name: 'Default Template',
    description: 'Compose arbitrary RCON commands line-by-line with "wait <ms>" delays.',
    content: [
      '// Enter RCON commands line by line',
      '// Use "wait <milliseconds>" to pause between commands',
      'serverchat SYSTEM: Maintenance starting soon',
      'wait 5000',
      'SaveWorld'
    ].join('\n'),
    isBuiltIn: true
  }
];

let configPath = path.join(__dirname, '../../config.json');

export function setConfigPath(newPath: string): void {
  configPath = newPath;
}

export function getConfigPath(): string {
  return configPath;
}

function readConfig(): any {
  if (!fs.existsSync(configPath)) {
    return { customScripts: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    return { customScripts: [] };
  }
}

function writeConfig(config: any): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function getScriptTemplates(): ScriptTemplate[] {
  const config = readConfig();
  const customScripts: ScriptTemplate[] = Array.isArray(config.customScripts) ? config.customScripts : [];
  return [...BUILT_IN_TEMPLATES, ...customScripts];
}

export function getScriptTemplateById(id: string): ScriptTemplate | undefined {
  return getScriptTemplates().find(t => t.id === id);
}

export function saveScriptTemplate(template: {
  id?: string;
  name: string;
  description?: string;
  content: string;
}): ScriptTemplate {
  if (!template || typeof template.name !== 'string' || !template.name.trim()) {
    throw new Error('Template name is required');
  }
  if (template.content === undefined || template.content === null || typeof template.content !== 'string' || !template.content.trim()) {
    throw new Error('Template content is required');
  }

  const targetId = template.id?.trim();
  if (targetId && BUILT_IN_TEMPLATES.some(b => b.id === targetId)) {
    throw new Error('Cannot modify built-in template');
  }

  const now = Date.now();
  const config = readConfig();
  if (!Array.isArray(config.customScripts)) {
    config.customScripts = [];
  }

  let saved: ScriptTemplate;
  if (targetId) {
    const existingIndex = config.customScripts.findIndex((s: ScriptTemplate) => s.id === targetId);
    if (existingIndex !== -1) {
      const existing = config.customScripts[existingIndex];
      saved = {
        ...existing,
        name: template.name.trim(),
        description: template.description !== undefined ? template.description.trim() : (existing.description || ''),
        content: template.content,
        updatedAt: now
      };
      config.customScripts[existingIndex] = saved;
    } else {
      saved = {
        id: targetId,
        name: template.name.trim(),
        description: (template.description || '').trim(),
        content: template.content,
        createdAt: now,
        updatedAt: now
      };
      config.customScripts.push(saved);
    }
  } else {
    saved = {
      id: `custom-${now}`,
      name: template.name.trim(),
      description: (template.description || '').trim(),
      content: template.content,
      createdAt: now,
      updatedAt: now
    };
    config.customScripts.push(saved);
  }

  writeConfig(config);
  return saved;
}

export function deleteScriptTemplate(id: string): boolean {
  if (!id) return false;
  if (BUILT_IN_TEMPLATES.some(b => b.id === id)) {
    return false;
  }

  const config = readConfig();
  if (!Array.isArray(config.customScripts)) {
    return false;
  }

  const index = config.customScripts.findIndex((s: ScriptTemplate) => s.id === id);
  if (index === -1) {
    return false;
  }

  config.customScripts.splice(index, 1);
  writeConfig(config);
  return true;
}
