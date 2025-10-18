/**
 * Visual Regression Testing System
 * Screenshot comparison and baseline management for UI consistency
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface VisualTestConfig {
  baselineDir: string;
  currentDir: string;
  diffDir: string;
  threshold: number; // 0-1, where 1 is exact match
  updateBaselines: boolean;
  browsers: string[];
  viewports: Array<{ width: number; height: number; name: string }>;
  ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface ScreenshotOptions {
  component: string;
  url?: string;
  selector?: string;
  browser: string;
  viewport: { width: number; height: number; name: string };
  waitFor?: number;
  animations?: 'disabled' | 'allow';
  fullPage?: boolean;
}

export interface VisualComparisonResult {
  component: string;
  browser: string;
  viewport: string;
  baseline: string;
  current: string;
  diff?: string;
  similarity: number;
  diffPixels: number;
  totalPixels: number;
  passed: boolean;
  threshold: number;
  timestamp: string;
}

export interface BaselineMetadata {
  component: string;
  browser: string;
  viewport: string;
  createdAt: string;
  updatedAt: string;
  hash: string;
  size: { width: number; height: number };
}

export class VisualRegressionSystem extends EventEmitter {
  private config: VisualTestConfig;
  private baselineMetadata = new Map<string, BaselineMetadata>();
  private comparisonResults: VisualComparisonResult[] = [];

  constructor(
    config: Partial<VisualTestConfig>,
    private logger: ILogger,
  ) {
    super();

    this.config = {
      baselineDir: path.join(process.cwd(), 'tests/visual/baselines'),
      currentDir: path.join(process.cwd(), 'tests/visual/current'),
      diffDir: path.join(process.cwd(), 'tests/visual/diffs'),
      threshold: 0.99,
      updateBaselines: false,
      browsers: ['chromium'],
      viewports: [
        { width: 1920, height: 1080, name: 'desktop' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 375, height: 667, name: 'mobile' },
      ],
      ...config,
    };

    this.initializeDirectories();
    this.loadBaselineMetadata();
  }

  /**
   * Capture screenshot for visual testing
   */
  async captureScreenshot(options: ScreenshotOptions): Promise<string> {
    try {
      this.logger.info('Capturing screenshot', {
        component: options.component,
        browser: options.browser,
        viewport: options.viewport.name,
      });

      const filename = this.generateFilename(options);
      const filepath = path.join(this.config.currentDir, filename);

      // Ensure directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      // Simulate screenshot capture (would use Playwright/Puppeteer in real implementation)
      const screenshot = await this.performScreenshotCapture(options);
      await fs.writeFile(filepath, screenshot);

      this.emit('screenshot-captured', {
        component: options.component,
        filepath,
        size: screenshot.length,
      });

      return filepath;
    } catch (error) {
      this.logger.error('Screenshot capture failed', { error, options });
      throw error;
    }
  }

  /**
   * Compare screenshot with baseline
   */
  async compareWithBaseline(screenshotPath: string, options: ScreenshotOptions): Promise<VisualComparisonResult> {
    try {
      const filename = path.basename(screenshotPath);
      const baselinePath = path.join(this.config.baselineDir, filename);

      // Check if baseline exists
      const baselineExists = await this.fileExists(baselinePath);

      if (!baselineExists) {
        if (this.config.updateBaselines) {
          // Create new baseline
          await this.createBaseline(screenshotPath, options);
          return this.createPassingResult(options, screenshotPath, baselinePath, 'Baseline created');
        } else {
          throw new Error(`Baseline not found: ${baselinePath}`);
        }
      }

      // Perform comparison
      const comparison = await this.performComparison(screenshotPath, baselinePath);

      // Generate diff image if needed
      let diffPath: string | undefined;
      if (comparison.similarity < this.config.threshold) {
        diffPath = await this.generateDiffImage(screenshotPath, baselinePath, options);
      }

      const result: VisualComparisonResult = {
        component: options.component,
        browser: options.browser,
        viewport: options.viewport.name,
        baseline: baselinePath,
        current: screenshotPath,
        diff: diffPath,
        similarity: comparison.similarity,
        diffPixels: comparison.diffPixels,
        totalPixels: comparison.totalPixels,
        passed: comparison.similarity >= this.config.threshold,
        threshold: this.config.threshold,
        timestamp: new Date().toISOString(),
      };

      this.comparisonResults.push(result);

      this.emit('comparison-completed', result);

      // Update baseline if configured and test passed
      if (this.config.updateBaselines && result.passed) {
        await this.updateBaseline(screenshotPath, options);
      }

      return result;
    } catch (error) {
      this.logger.error('Visual comparison failed', { error, options });
      throw error;
    }
  }

  /**
   * Test component across all configured browsers and viewports
   */
  async testComponent(component: string, url?: string, selector?: string): Promise<VisualComparisonResult[]> {
    const results: VisualComparisonResult[] = [];

    for (const browser of this.config.browsers) {
      for (const viewport of this.config.viewports) {
        try {
          const options: ScreenshotOptions = {
            component,
            url,
            selector,
            browser,
            viewport,
            animations: 'disabled',
            fullPage: false,
          };

          const screenshotPath = await this.captureScreenshot(options);
          const result = await this.compareWithBaseline(screenshotPath, options);
          results.push(result);
        } catch (error) {
          this.logger.error('Component test failed', {
            error,
            component,
            browser,
            viewport: viewport.name,
          });
        }
      }
    }

    return results;
  }

  /**
   * Test multiple components in batch
   */
  async testComponents(components: Array<{ name: string; url?: string; selector?: string }>): Promise<Map<string, VisualComparisonResult[]>> {
    const resultMap = new Map<string, VisualComparisonResult[]>();

    for (const component of components) {
      try {
        const results = await this.testComponent(component.name, component.url, component.selector);
        resultMap.set(component.name, results);
      } catch (error) {
        this.logger.error('Component batch test failed', { error, component: component.name });
      }
    }

    return resultMap;
  }

  /**
   * Get all comparison results
   */
  getResults(): VisualComparisonResult[] {
    return this.comparisonResults;
  }

  /**
   * Get failed comparisons
   */
  getFailures(): VisualComparisonResult[] {
    return this.comparisonResults.filter((r) => !r.passed);
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    averageSimilarity: number;
    totalDiffPixels: number;
  } {
    const total = this.comparisonResults.length;
    const passed = this.comparisonResults.filter((r) => r.passed).length;
    const failed = total - passed;
    const averageSimilarity =
      this.comparisonResults.reduce((sum, r) => sum + r.similarity, 0) / total || 0;
    const totalDiffPixels = this.comparisonResults.reduce((sum, r) => sum + r.diffPixels, 0);

    return {
      total,
      passed,
      failed,
      averageSimilarity,
      totalDiffPixels,
    };
  }

  /**
   * Update baselines for all current screenshots
   */
  async updateAllBaselines(): Promise<void> {
    try {
      this.logger.info('Updating all baselines');

      const currentFiles = await this.listFiles(this.config.currentDir);

      for (const file of currentFiles) {
        const sourcePath = path.join(this.config.currentDir, file);
        const targetPath = path.join(this.config.baselineDir, file);

        await fs.copyFile(sourcePath, targetPath);

        // Update metadata
        const metadata: BaselineMetadata = {
          component: this.extractComponentName(file),
          browser: this.extractBrowser(file),
          viewport: this.extractViewport(file),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hash: await this.calculateFileHash(sourcePath),
          size: await this.getImageSize(sourcePath),
        };

        this.baselineMetadata.set(file, metadata);
      }

      await this.saveBaselineMetadata();

      this.emit('baselines-updated', { count: currentFiles.length });
    } catch (error) {
      this.logger.error('Baseline update failed', { error });
      throw error;
    }
  }

  /**
   * Clean up old test artifacts
   */
  async cleanup(keepDays: number = 7): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - keepDays);

      await this.cleanDirectory(this.config.currentDir, cutoffDate);
      await this.cleanDirectory(this.config.diffDir, cutoffDate);

      this.logger.info('Visual test cleanup completed', { keepDays });
    } catch (error) {
      this.logger.error('Cleanup failed', { error });
    }
  }

  // Private helper methods

  private async initializeDirectories(): Promise<void> {
    await fs.mkdir(this.config.baselineDir, { recursive: true });
    await fs.mkdir(this.config.currentDir, { recursive: true });
    await fs.mkdir(this.config.diffDir, { recursive: true });
  }

  private async loadBaselineMetadata(): Promise<void> {
    try {
      const metadataPath = path.join(this.config.baselineDir, 'metadata.json');
      const data = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(data);

      for (const [key, value] of Object.entries(metadata)) {
        this.baselineMetadata.set(key, value as BaselineMetadata);
      }
    } catch (error) {
      // Metadata file doesn't exist yet
      this.logger.debug('No baseline metadata found, starting fresh');
    }
  }

  private async saveBaselineMetadata(): Promise<void> {
    const metadataPath = path.join(this.config.baselineDir, 'metadata.json');
    const metadata = Object.fromEntries(this.baselineMetadata);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  private generateFilename(options: ScreenshotOptions): string {
    const timestamp = Date.now();
    return `${options.component}__${options.browser}__${options.viewport.name}__${timestamp}.png`;
  }

  private async performScreenshotCapture(options: ScreenshotOptions): Promise<Buffer> {
    // Placeholder: Would integrate with Playwright/Puppeteer
    // For now, return a mock buffer
    return Buffer.from('mock-screenshot-data');
  }

  private async performComparison(
    currentPath: string,
    baselinePath: string,
  ): Promise<{ similarity: number; diffPixels: number; totalPixels: number }> {
    // Placeholder: Would use pixelmatch or similar library
    // For now, return mock comparison
    return {
      similarity: 0.995,
      diffPixels: 100,
      totalPixels: 1920 * 1080,
    };
  }

  private async generateDiffImage(
    currentPath: string,
    baselinePath: string,
    options: ScreenshotOptions,
  ): Promise<string> {
    const filename = this.generateFilename(options).replace('.png', '-diff.png');
    const diffPath = path.join(this.config.diffDir, filename);

    // Placeholder: Would generate actual diff image
    await fs.writeFile(diffPath, Buffer.from('mock-diff-image'));

    return diffPath;
  }

  private async createBaseline(screenshotPath: string, options: ScreenshotOptions): Promise<void> {
    const filename = path.basename(screenshotPath);
    const baselinePath = path.join(this.config.baselineDir, filename);

    await fs.copyFile(screenshotPath, baselinePath);

    const metadata: BaselineMetadata = {
      component: options.component,
      browser: options.browser,
      viewport: options.viewport.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hash: await this.calculateFileHash(screenshotPath),
      size: options.viewport,
    };

    this.baselineMetadata.set(filename, metadata);
    await this.saveBaselineMetadata();

    this.logger.info('Baseline created', { component: options.component, filename });
  }

  private async updateBaseline(screenshotPath: string, options: ScreenshotOptions): Promise<void> {
    const filename = path.basename(screenshotPath);
    const baselinePath = path.join(this.config.baselineDir, filename);

    await fs.copyFile(screenshotPath, baselinePath);

    const metadata = this.baselineMetadata.get(filename);
    if (metadata) {
      metadata.updatedAt = new Date().toISOString();
      metadata.hash = await this.calculateFileHash(screenshotPath);
      await this.saveBaselineMetadata();
    }
  }

  private createPassingResult(
    options: ScreenshotOptions,
    current: string,
    baseline: string,
    reason: string,
  ): VisualComparisonResult {
    return {
      component: options.component,
      browser: options.browser,
      viewport: options.viewport.name,
      baseline,
      current,
      similarity: 1,
      diffPixels: 0,
      totalPixels: options.viewport.width * options.viewport.height,
      passed: true,
      threshold: this.config.threshold,
      timestamp: new Date().toISOString(),
    };
  }

  private async fileExists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  private async listFiles(dir: string): Promise<string[]> {
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  private async cleanDirectory(dir: string, cutoffDate: Date): Promise<void> {
    const files = await this.listFiles(dir);

    for (const file of files) {
      const filepath = path.join(dir, file);
      const stats = await fs.stat(filepath);

      if (stats.mtime < cutoffDate) {
        await fs.unlink(filepath);
      }
    }
  }

  private async calculateFileHash(filepath: string): Promise<string> {
    // Placeholder: Would use crypto to calculate actual hash
    return `hash-${Date.now()}`;
  }

  private async getImageSize(filepath: string): Promise<{ width: number; height: number }> {
    // Placeholder: Would use image library to get actual size
    return { width: 1920, height: 1080 };
  }

  private extractComponentName(filename: string): string {
    return filename.split('__')[0] || 'unknown';
  }

  private extractBrowser(filename: string): string {
    return filename.split('__')[1] || 'unknown';
  }

  private extractViewport(filename: string): string {
    return filename.split('__')[2] || 'unknown';
  }
}