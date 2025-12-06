/**
 * File Processor - Extracts indexable text from source files
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ProcessedFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface FileProcessor {
  process(filePath: string): Promise<ProcessedFile | null>;
  canProcess(filePath: string): boolean;
}

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
  '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.cs': 'csharp', '.php': 'php',
  '.md': 'markdown', '.mdx': 'markdown',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
  '.html': 'html', '.css': 'css', '.scss': 'scss',
  '.sql': 'sql', '.sh': 'shell', '.bash': 'shell',
};

export class SourceFileProcessor implements FileProcessor {
  private maxFileSize: number;
  
  constructor(maxFileSize: number = 100 * 1024) {
    this.maxFileSize = maxFileSize;
  }
  
  canProcess(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext in LANGUAGE_MAP;
  }
  
  async process(filePath: string): Promise<ProcessedFile | null> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize || !stats.isFile()) return null;
      
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();
      const language = LANGUAGE_MAP[ext] ?? 'unknown';
      
      let processed = content.replace(/\n{3,}/g, '\n\n');
      const maxChars = 8000;
      if (processed.length > maxChars) {
        processed = processed.slice(0, maxChars) + '\n[truncated]';
      }
      
      return { path: filePath, content: processed.trim(), language, size: stats.size };
    } catch {
      return null;
    }
  }
}

export function createFileProcessor(maxFileSize?: number): FileProcessor {
  return new SourceFileProcessor(maxFileSize);
}