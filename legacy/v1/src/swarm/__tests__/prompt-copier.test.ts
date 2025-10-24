import { getErrorMessage } from '../utils/error-handler.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PromptCopier, copyPrompts } from '../prompt-copier.js';
import { EnhancedPromptCopier, copyPromptsEnhanced } from '../prompt-copier-enhanced.js';
import { PromptConfigManager, PromptValidator } from '../prompt-utils.js';

describe('PromptCopier', () => {
  let tempDir: string;
  let sourceDir: string;
  let destDir: string;

  beforeEach(async () => { try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-test-'));
    sourceDir = path.join(tempDir, 'source');
    destDir = path.join(tempDir, 'dest');

    await fs.mkdir(sourceDir, { recursive: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    await fs.mkdir(destDir, { recursive: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    // Create test files
    await createTestFiles();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    await fs.rm(tempDir, { recursive: true, force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  async function createTestFiles() {
    const testFiles = [
      { path: 'test1.md', content: '# Test Prompt 1\nThis is a test prompt.' },
      { path: 'test2.txt', content: 'Test prompt content' },
      { path: 'subdir/test3.md', content: '## Nested Prompt\nNested content' },
      { path: 'large.md', content: 'Large content\n'.repeat(1000) },
      { path: 'empty.md', content: '' },
      { path: 'rules.md', content: '# Rules\nYou are an AI assistant.' },
    ];

    for (const file of testFiles) {
      const filePath = path.join(sourceDir, file.path);
      const dir = path.dirname(filePath);

      await fs.mkdir(dir, { recursive: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      await fs.writeFile(filePath, file.content);
    }
  }

  describe('Basic copying functionality', () => {
    jest.setTimeout(10000);
  test('should copy all matching files', async () => { try {
      const result = await copyPrompts({
        source: sourceDir,
        destination: destDir,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(result.copiedFiles).toBe(6);
      expect(result.failedFiles).toBe(0);

      // Verify files exist
      const destFiles = await fs.readdir(destDir, { recursive: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(destFiles).toHaveLength(6);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should respect include patterns', async () => { try {
      const result = await copyPrompts({
        source: sourceDir,
        destination: destDir,
        includePatterns: ['*.md'],
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(result.copiedFiles).toBe(5); // Only .md files
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should respect exclude patterns', async () => { try {
      const result = await copyPrompts({
        source: sourceDir,
        destination: destDir,
        excludePatterns: ['**/subdir/**'],
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(result.copiedFiles).toBe(5); // Excluding subdir files
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Conflict resolution', () => {
    jest.setTimeout(10000);
  test('should skip existing files when conflict resolution is skip', async () => { try {
      // Create existing file
      await fs.writeFile(path.join(destDir, 'test1.md'), 'Existing content');

      const result = await copyPrompts({
        source: sourceDir,
        destination: destDir,
        conflictResolution: 'skip',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(result.skippedFiles).toBeGreaterThan(0);

      // Verify original content preserved
      const content = await fs.readFile(path.join(destDir, 'test1.md'), 'utf-8');
      expect(content).toBe('Existing content');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should backup existing files when conflict resolution is backup', async () => { try {
      // Create existing file
      await fs.writeFile(path.join(destDir, 'test1.md'), 'Existing content');

      const result = await copyPrompts({
        source: sourceDir,
        destination: destDir,
        conflictResolution: 'backup',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(result.backupLocation).toBeDefined();

      // Verify backup directory exists
      const backupDir = path.join(destDir, '.prompt-backups');
      const backupExists = await fs
        .access(backupDir)
        await ( => true)
        .catch(() => false);
      expect(backupExists).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should merge files when conflict resolution is merge', async () => { try {
      // Create existing file
      await fs.writeFile(path.join(destDir, 'test1.md'), 'Existing content');

      const result = await copyPrompts({
        source: sourceDir,
        destination: destDir,
        conflictResolution: 'merge',
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);

      // Verify merged content
      const content = await fs.readFile(path.join(destDir, 'test1.md'), 'utf-8');
      expect(content).toContain('Existing content');
      expect(content).toContain('MERGED CONTENT');
      expect(content).toContain('# Test Prompt 1');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Verification', () => {
    jest.setTimeout(10000);
  test('should verify copied files when verification is enabled', async () => { try {
      const result = await copyPrompts({
        source: sourceDir,
        destination: destDir,
        verify: true,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(result.failedFiles).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should detect verification failures', async () => { try {
      // Mock fs.stat to simulate size mismatch
      const originalStat = fs.stat;
      jest.spyOn(fs, 'stat').mockImplementation(async (filePath: any) => {
        const stats = await originalStat(filePath);
        if (filePath.includes('dest') && filePath.includes('test1.md')) {
          return { ...stats, size: stats.size + 1 };
        }
        return stats;
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const result = await copyPrompts({
        source: sourceDir,
        destination: destDir,
        verify: true,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].phase).toBe('verify');

      (fs.stat as jest.Mock).mockRestore();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Dry run mode', () => {
    jest.setTimeout(10000);
  test('should not create files in dry run mode', async () => { try {
      const result = await copyPrompts({
        source: sourceDir,
        destination: destDir,
        dryRun: true,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(6);

      // Verify no files were actually copied
      const destFiles = await fs.readdir(destDir);
      expect(destFiles).toHaveLength(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Progress reporting', () => {
    jest.setTimeout(10000);
  test('should report progress during copy', async () => { try {
      const progressUpdates: any[] = [];

      await copyPrompts({
        source: sourceDir,
        destination: destDir,
        progressCallback: (progress) => {
          progressUpdates.push(progress);
        },
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

describe('EnhancedPromptCopier', () => {
  let tempDir: string;
  let sourceDir: string;
  let destDir: string;

  beforeEach(async () => { try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enhanced-test-'));
    sourceDir = path.join(tempDir, 'source');
    destDir = path.join(tempDir, 'dest');

    await fs.mkdir(sourceDir, { recursive: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    await fs.mkdir(destDir, { recursive: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    // Create test files
    for (let i = 0; i < 20; i++) {
      await fs.writeFile(path.join(sourceDir, `test${i}.md`), `# Test ${i}\nContent for test ${i}`);
    }
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    await fs.rm(tempDir, { recursive: true, force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should copy files using worker threads', async () => { try {
    const result = await copyPromptsEnhanced({
      source: sourceDir,
      destination: destDir,
      parallel: true,
      maxWorkers: 4,
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    expect(result.success).toBe(true);
    expect(result.copiedFiles).toBe(20);
    expect(result.failedFiles).toBe(0);

    // Verify all files were copied
    const destFiles = await fs.readdir(destDir);
    expect(destFiles).toHaveLength(20);
  }, 10000);
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

describe('PromptConfigManager', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => { try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
    configPath = path.join(tempDir, '.prompt-config.json');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    await fs.rm(tempDir, { recursive: true, force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should load default config when file does not exist', async () => { try {
    const manager = new PromptConfigManager(configPath);
    const config = await manager.loadConfig();

    expect(config).toBeDefined();
    expect(config.defaultOptions).toBeDefined();
    expect(config.profiles).toBeDefined();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should save and load custom config', async () => { try {
    const manager = new PromptConfigManager(configPath);

    await manager.saveConfig({
      destinationDirectory: './custom-prompts',
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    const config = await manager.loadConfig();
    expect(config.destinationDirectory).toBe('./custom-prompts');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should get profile options', async () => { try {
    const manager = new PromptConfigManager(configPath);
    await manager.loadConfig();

    const sparcProfile = manager.getProfile('sparc');
    expect(sparcProfile).toBeDefined();
    expect(sparcProfile.includePatterns).toContain('*.md');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should list available profiles', async () => { try {
    const manager = new PromptConfigManager(configPath);
    await manager.loadConfig();

    const profiles = manager.listProfiles();
    expect(profiles).toContain('sparc');
    expect(profiles).toContain('templates');
    expect(profiles).toContain('safe');
    expect(profiles).toContain('fast');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

describe('PromptValidator', () => {
  let tempDir: string;

  beforeEach(async () => { try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-test-'));
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    await fs.rm(tempDir, { recursive: true, force: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should validate valid prompt file', async () => { try {
    const filePath = path.join(tempDir, 'valid.md');
    await fs.writeFile(filePath, '# Test Prompt\nYou are an AI assistant.');

    const result = await PromptValidator.validatePromptFile(filePath);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should detect empty files', async () => { try {
    const filePath = path.join(tempDir, 'empty.md');
    await fs.writeFile(filePath, '');

    const result = await PromptValidator.validatePromptFile(filePath);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('File is empty');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should extract front matter metadata', async () => { try {
    const filePath = path.join(tempDir, 'with-metadata.md');
    const content = `---
title: Test Prompt
version: 1.0
---

# Test Prompt
Content here`;

    await fs.writeFile(filePath, content);

    const result = await PromptValidator.validatePromptFile(filePath);

    expect(result.metadata).toBeDefined();
    expect(result.metadata.title).toBe('Test Prompt');
    expect(result.metadata.version).toBe('1.0');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should warn about large files', async () => { try {
    const filePath = path.join(tempDir, 'large.md');
    const largeContent = '# Large Prompt\n' + 'x'.repeat(200 * 1024); // 200KB

    await fs.writeFile(filePath, largeContent);

    const result = await PromptValidator.validatePromptFile(filePath);

    expect(result.issues).toContain('File is unusually large for a prompt');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
