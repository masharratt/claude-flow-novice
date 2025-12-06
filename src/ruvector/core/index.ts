/**
 * RuVectorIndex - Core API for semantic codebase search
 */

import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';

import { createEmbeddingProvider, type EmbeddingProvider } from '../embeddings/index.js';
import { createFileProcessor, type FileProcessor, type ProcessedFile } from './file-processor.js';

export interface SearchResult {
  path: string;
  score: number;
}

export interface IndexStats {
  totalFiles: number;
  indexedFiles: number;
  failedFiles: number;
  lastIndexedAt: Date | null;
}

export interface RuVectorIndexOptions {
  storagePath?: string;
  embedding?: {
    provider?: 'openai' | 'ollama' | 'transformers';
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  indexing?: {
    include?: string[];
    exclude?: string[];
    maxFileSize?: number;
    batchSize?: number;
  };
  verbose?: boolean;
}

interface VectorDB {
  upsert(items: Array<{ id: string; vector: Float32Array }>): Promise<void>;
  search(params: { vector: Float32Array; k: number }): Promise<Array<{ id: string; score: number }>>;
  count(): Promise<number>;
}

export class RuVectorIndex {
  private embeddingProvider: EmbeddingProvider;
  private fileProcessor: FileProcessor;
  private db: VectorDB | null = null;
  private workingDir: string;
  private storagePath: string;
  private include: string[];
  private exclude: string[];
  private batchSize: number;
  private verbose: boolean;
  
  constructor(options: RuVectorIndexOptions = {}, workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
    this.storagePath = options.storagePath ?? './data/codebase.db';
    this.include = options.indexing?.include ?? ['**/*.ts', '**/*.js', '**/*.md'];
    this.exclude = options.indexing?.exclude ?? ['node_modules/**', 'dist/**', '.git/**'];
    this.batchSize = options.indexing?.batchSize ?? 50;
    this.verbose = options.verbose ?? false;
    
    this.embeddingProvider = createEmbeddingProvider({
      provider: options.embedding?.provider ?? 'openai',
      model: options.embedding?.model,
      apiKey: options.embedding?.apiKey,
      baseUrl: options.embedding?.baseUrl,
    });
    
    this.fileProcessor = createFileProcessor(options.indexing?.maxFileSize);
  }
  
  private async getDb(): Promise<VectorDB> {
    if (this.db) return this.db;
    
    const { VectorDB } = await import('@ruvector/core');
    const storagePath = path.resolve(this.workingDir, this.storagePath);
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    
    this.db = new VectorDB({ dimensions: 1536, storagePath });
    return this.db;
  }
  
  private log(msg: string): void {
    if (this.verbose) console.log(`[ruvector] ${msg}`);
  }
  
  async indexDirectory(directory: string = '.'): Promise<IndexStats> {
    const absoluteDir = path.resolve(this.workingDir, directory);
    this.log(`Indexing: ${absoluteDir}`);
    
    const patterns = this.include.map(p => path.join(absoluteDir, p));
    const files = await glob(patterns, { ignore: this.exclude, nodir: true, absolute: true });
    
    this.log(`Found ${files.length} files`);
    
    const stats: IndexStats = { totalFiles: files.length, indexedFiles: 0, failedFiles: 0, lastIndexedAt: new Date() };
    const db = await this.getDb();
    
    for (let i = 0; i < files.length; i += this.batchSize) {
      const batch = files.slice(i, i + this.batchSize);
      const processed: ProcessedFile[] = [];
      
      for (const file of batch) {
        const result = await this.fileProcessor.process(file);
        if (result) processed.push(result);
        else stats.failedFiles++;
      }
      
      if (processed.length === 0) continue;
      
      try {
        const texts = processed.map(p => p.content);
        const embeddings = await this.embeddingProvider.embedBatch(texts);
        
        const items = processed.map((p, idx) => ({
          id: path.relative(this.workingDir, p.path),
          vector: new Float32Array(embeddings[idx].embedding),
        }));
        
        await db.upsert(items);
        stats.indexedFiles += processed.length;
        this.log(`Indexed ${stats.indexedFiles}/${stats.totalFiles}`);
      } catch (error) {
        this.log(`Batch failed: ${(error as Error).message}`);
        stats.failedFiles += processed.length;
      }
    }
    
    return stats;
  }
  
  async search(query: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 10;
    const { embedding } = await this.embeddingProvider.embed(query);
    const db = await this.getDb();
    
    const results = await db.search({ vector: new Float32Array(embedding), k: limit });
    return results.map(r => ({ path: r.id, score: r.score }));
  }
  
  async getStats(): Promise<IndexStats> {
    const db = await this.getDb();
    const count = await db.count();
    return { totalFiles: count, indexedFiles: count, failedFiles: 0, lastIndexedAt: null };
  }
  
  async clear(): Promise<void> {
    const storagePath = path.resolve(this.workingDir, this.storagePath);
    try { await fs.unlink(storagePath); this.db = null; } catch {}
  }
}

export { createFileProcessor, type ProcessedFile, type FileProcessor } from './file-processor.js';