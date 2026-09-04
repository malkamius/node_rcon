import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getScriptTemplates,
  getScriptTemplateById,
  saveScriptTemplate,
  deleteScriptTemplate,
  setConfigPath,
  BUILT_IN_TEMPLATES
} from '../scriptTemplates';

describe('scriptTemplates unit tests', () => {
  let tempDir: string;
  let tempConfigPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcon-script-test-'));
    tempConfigPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(
      tempConfigPath,
      JSON.stringify({
        webserver: { host: '127.0.0.1', port: 3000 },
        customScripts: []
      }, null, 2),
      'utf-8'
    );
    setConfigPath(tempConfigPath);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    } catch (e) {
      // ignore cleanup errors
    }
  });

  describe('Retrieval', () => {
    it('should return all built-in templates when no custom scripts exist', () => {
      const templates = getScriptTemplates();
      expect(templates.length).toBe(BUILT_IN_TEMPLATES.length);
      expect(templates.every(t => t.isBuiltIn)).toBe(true);

      const ids = templates.map(t => t.id);
      expect(ids).toContain('builtin-restart-update-15m');
      expect(ids).toContain('builtin-quick-broadcast-30s');
      expect(ids).toContain('builtin-save-world-now');
      expect(ids).toContain('builtin-default-template');
    });

    it('should return merged built-in templates and custom scripts', () => {
      const custom = {
        id: 'custom-12345',
        name: 'My Custom Script',
        description: 'Test description',
        content: 'serverchat Hello World',
        createdAt: 1000,
        updatedAt: 1000
      };
      fs.writeFileSync(
        tempConfigPath,
        JSON.stringify({ customScripts: [custom] }),
        'utf-8'
      );

      const templates = getScriptTemplates();
      expect(templates.length).toBe(BUILT_IN_TEMPLATES.length + 1);
      const found = templates.find(t => t.id === 'custom-12345');
      expect(found).toBeDefined();
      expect(found?.name).toBe('My Custom Script');
      expect(found?.content).toBe('serverchat Hello World');
    });

    it('should find a built-in template by ID', () => {
      const t = getScriptTemplateById('builtin-save-world-now');
      expect(t).toBeDefined();
      expect(t?.name).toBe('Save World Now');
      expect(t?.content).toBe('SaveWorld');
      expect(t?.isBuiltIn).toBe(true);
    });

    it('should find a custom template by ID', () => {
      const custom = {
        id: 'custom-find-me',
        name: 'Findable Script',
        description: 'Desc',
        content: 'serverchat find me'
      };
      fs.writeFileSync(
        tempConfigPath,
        JSON.stringify({ customScripts: [custom] }),
        'utf-8'
      );

      const t = getScriptTemplateById('custom-find-me');
      expect(t).toBeDefined();
      expect(t?.name).toBe('Findable Script');
    });

    it('should return undefined when ID is not found', () => {
      const t = getScriptTemplateById('non-existent-id');
      expect(t).toBeUndefined();
    });
  });

  describe('Saving and Validation', () => {
    it('should reject templates without a valid name', () => {
      expect(() => {
        saveScriptTemplate({ name: '', content: 'SaveWorld' });
      }).toThrow('Template name is required');

      expect(() => {
        saveScriptTemplate({ name: '   ', content: 'SaveWorld' });
      }).toThrow('Template name is required');
    });

    it('should reject templates without valid content', () => {
      expect(() => {
        saveScriptTemplate({ name: 'Valid Name', content: '' });
      }).toThrow('Template content is required');

      expect(() => {
        saveScriptTemplate({ name: 'Valid Name', content: '   ' });
      }).toThrow('Template content is required');
    });

    it('should save a new custom template with generated ID and timestamps', () => {
      const before = Date.now();
      const saved = saveScriptTemplate({
        name: 'New Custom Script',
        description: 'Testing save',
        content: 'serverchat Announcement\nwait 5000\nSaveWorld'
      });
      const after = Date.now();

      expect(saved.id).toMatch(/^custom-\d+$/);
      expect(saved.name).toBe('New Custom Script');
      expect(saved.description).toBe('Testing save');
      expect(saved.content).toBe('serverchat Announcement\nwait 5000\nSaveWorld');
      expect(saved.createdAt).toBeGreaterThanOrEqual(before);
      expect(saved.createdAt).toBeLessThanOrEqual(after);
      expect(saved.updatedAt).toBe(saved.createdAt);

      // Verify written to config.json
      const config = JSON.parse(fs.readFileSync(tempConfigPath, 'utf-8'));
      expect(config.customScripts).toHaveLength(1);
      expect(config.customScripts[0].id).toBe(saved.id);
    });

    it('should update an existing custom template while preserving createdAt', () => {
      const created = saveScriptTemplate({
        name: 'Initial Name',
        description: 'Initial Desc',
        content: 'serverchat Initial'
      });

      const updated = saveScriptTemplate({
        id: created.id,
        name: 'Updated Name',
        description: 'Updated Desc',
        content: 'serverchat Updated'
      });

      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated Desc');
      expect(updated.content).toBe('serverchat Updated');
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt!);

      const config = JSON.parse(fs.readFileSync(tempConfigPath, 'utf-8'));
      expect(config.customScripts).toHaveLength(1);
      expect(config.customScripts[0].name).toBe('Updated Name');
    });

    it('should prevent modifying built-in templates', () => {
      expect(() => {
        saveScriptTemplate({
          id: 'builtin-save-world-now',
          name: 'Hacked Save World',
          content: 'DoNothing'
        });
      }).toThrow('Cannot modify built-in template');

      // Built-in template content remains unchanged
      const template = getScriptTemplateById('builtin-save-world-now');
      expect(template?.name).toBe('Save World Now');
      expect(template?.content).toBe('SaveWorld');
    });
  });

  describe('Deleting and Built-in Protection', () => {
    it('should delete a custom template and persist changes', () => {
      const saved = saveScriptTemplate({
        name: 'To Delete',
        content: 'SaveWorld'
      });

      expect(getScriptTemplateById(saved.id)).toBeDefined();

      const result = deleteScriptTemplate(saved.id);
      expect(result).toBe(true);
      expect(getScriptTemplateById(saved.id)).toBeUndefined();

      const config = JSON.parse(fs.readFileSync(tempConfigPath, 'utf-8'));
      expect(config.customScripts).toHaveLength(0);
    });

    it('should return false when deleting a non-existent template ID', () => {
      const result = deleteScriptTemplate('custom-does-not-exist');
      expect(result).toBe(false);
    });

    it('should prevent deleting built-in templates and return false', () => {
      const result = deleteScriptTemplate('builtin-restart-update-15m');
      expect(result).toBe(false);

      // Verify built-in still exists
      const template = getScriptTemplateById('builtin-restart-update-15m');
      expect(template).toBeDefined();
    });
  });
});
