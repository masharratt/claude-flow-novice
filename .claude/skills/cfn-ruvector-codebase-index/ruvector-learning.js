#!/usr/bin/env node
/**
 * RuVector Learning & Error Pattern Storage
 *
 * Hybrid approach: RuVector for vectors, SQLite for metadata
 * RuVector 0.1.16 does NOT support metadata in vector storage
 */

import { VectorDB, DistanceMetric } from '@ruvector/core';
import { generateEmbedding } from './embeddings.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const DB_CONFIG = {
  dimensions: 1536,
  distanceMetric: DistanceMetric.Cosine,
  hnswConfig: {
    m: 16,
    efConstruction: 200,
    efSearch: 100,
    maxElements: 10000,
  },
};

// Database paths
const DATA_DIR = process.env.RUVECTOR_DB_PATH || path.join(__dirname, '../../../data/ruvector');
const ERROR_PATTERNS_DB = path.join(DATA_DIR, 'error_patterns.db');
const LEARNINGS_DB = path.join(DATA_DIR, 'learnings.db');
const ERROR_METADATA_DB = path.join(DATA_DIR, 'error_metadata.sqlite');
const LEARNING_METADATA_DB = path.join(DATA_DIR, 'learning_metadata.sqlite');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

// Database instances (lazy-initialized)
let errorPatternsDB = null;
let learningsDB = null;
let errorMetadataDB = null;
let learningMetadataDB = null;

/**
 * Get or create error patterns vector database
 */
function getErrorPatternsDB() {
  if (!errorPatternsDB) {
    errorPatternsDB = new VectorDB({
      ...DB_CONFIG,
      storagePath: ERROR_PATTERNS_DB,
    });
  }
  return errorPatternsDB;
}

/**
 * Get or create learnings vector database
 */
function getLearningsDB() {
  if (!learningsDB) {
    learningsDB = new VectorDB({
      ...DB_CONFIG,
      storagePath: LEARNINGS_DB,
    });
  }
  return learningsDB;
}

/**
 * Get or create error metadata SQLite database
 */
async function getErrorMetadataDB() {
  if (!errorMetadataDB) {
    errorMetadataDB = new sqlite3.Database(ERROR_METADATA_DB);
    const runAsync = promisify(errorMetadataDB.run.bind(errorMetadataDB));

    await runAsync(`
      CREATE TABLE IF NOT EXISTS error_patterns (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        error_type TEXT,
        pattern TEXT,
        context TEXT,
        solution TEXT,
        timestamp TEXT,
        searchable_text TEXT
      )
    `);
  }
  return errorMetadataDB;
}

/**
 * Get or create learning metadata SQLite database
 */
async function getLearningMetadataDB() {
  if (!learningMetadataDB) {
    learningMetadataDB = new sqlite3.Database(LEARNING_METADATA_DB);
    const runAsync = promisify(learningMetadataDB.run.bind(learningMetadataDB));

    await runAsync(`
      CREATE TABLE IF NOT EXISTS learnings (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        category TEXT,
        title TEXT,
        description TEXT,
        confidence REAL,
        tags TEXT,
        timestamp TEXT,
        searchable_text TEXT
      )
    `);
  }
  return learningMetadataDB;
}

/**
 * Store error pattern (hybrid: RuVector + SQLite)
 */
export async function storeErrorPattern(data) {
  try {
    const vectorDB = getErrorPatternsDB();
    const metadataDB = await getErrorMetadataDB();

    const id = `error-${data.task_id}-${Date.now()}`;
    const searchableText = `${data.error_type}: ${data.pattern}. Context: ${data.context}. Solution: ${data.solution}`;

    // Generate embedding
    const embedding = await generateEmbedding(searchableText);
    if (!embedding) {
      throw new Error('Failed to generate embedding for error pattern');
    }

    // Store vector in RuVector
    await vectorDB.insert({
      id,
      vector: Float32Array.from(embedding),
    });

    // Store metadata in SQLite
    const runAsync = promisify(metadataDB.run.bind(metadataDB));
    await runAsync(
      `INSERT INTO error_patterns (id, task_id, error_type, pattern, context, solution, timestamp, searchable_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.task_id, data.error_type, data.pattern, data.context, data.solution, data.timestamp, searchableText]
    );

    return {
      stored: true,
      collection: 'error_patterns',
      id: id,
      dbPath: ERROR_PATTERNS_DB,
      metadataPath: ERROR_METADATA_DB,
    };
  } catch (error) {
    console.error('Error storing error pattern:', error.message);
    throw error;
  }
}

/**
 * Store learning (hybrid: RuVector + SQLite)
 */
export async function storeLearning(data) {
  try {
    const vectorDB = getLearningsDB();
    const metadataDB = await getLearningMetadataDB();

    const id = `learning-${data.task_id}-${Date.now()}`;
    const searchableText = `[${data.category}] ${data.title}: ${data.description}. Tags: ${data.tags}`;

    // Generate embedding
    const embedding = await generateEmbedding(searchableText);
    if (!embedding) {
      throw new Error('Failed to generate embedding for learning');
    }

    // Store vector in RuVector
    await vectorDB.insert({
      id,
      vector: Float32Array.from(embedding),
    });

    // Store metadata in SQLite
    const runAsync = promisify(metadataDB.run.bind(metadataDB));
    await runAsync(
      `INSERT INTO learnings (id, task_id, category, title, description, confidence, tags, timestamp, searchable_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.task_id, data.category, data.title, data.description, data.confidence, data.tags, data.timestamp, searchableText]
    );

    return {
      stored: true,
      collection: 'learnings',
      id: id,
      dbPath: LEARNINGS_DB,
      metadataPath: LEARNING_METADATA_DB,
    };
  } catch (error) {
    console.error('Error storing learning:', error.message);
    throw error;
  }
}

/**
 * Query error patterns (hybrid: RuVector search + SQLite metadata fetch)
 */
export async function queryErrorPatterns(taskDescription, limit = 5) {
  try {
    const vectorDB = getErrorPatternsDB();
    const metadataDB = await getErrorMetadataDB();

    // Generate embedding for query
    const embedding = await generateEmbedding(taskDescription);
    if (!embedding) {
      return [];
    }

    // Search RuVector for similar vectors
    const results = await vectorDB.search({
      vector: Float32Array.from(embedding),
      k: limit,
    });

    // Fetch metadata for each result from SQLite
    const getAsync = promisify(metadataDB.get.bind(metadataDB));
    const enrichedResults = [];

    for (const result of results) {
      const metadata = await getAsync(
        'SELECT * FROM error_patterns WHERE id = ?',
        [result.id]
      );

      if (metadata) {
        enrichedResults.push({
          task_id: metadata.task_id,
          error_type: metadata.error_type,
          pattern: metadata.pattern,
          context: metadata.context,
          solution: metadata.solution,
          timestamp: metadata.timestamp,
          similarity: result.score || 0,
        });
      }
    }

    return enrichedResults;
  } catch (error) {
    console.error('Error querying error patterns:', error.message);
    return [];
  }
}

/**
 * Query learnings (hybrid: RuVector search + SQLite metadata fetch)
 */
export async function queryLearnings(taskDescription, category = '', limit = 5) {
  try {
    const vectorDB = getLearningsDB();
    const metadataDB = await getLearningMetadataDB();

    // Generate embedding for query
    const queryText = category ? `[${category}] ${taskDescription}` : taskDescription;
    const embedding = await generateEmbedding(queryText);
    if (!embedding) {
      return [];
    }

    // Search RuVector for similar vectors
    const results = await vectorDB.search({
      vector: Float32Array.from(embedding),
      k: limit * 2, // Get more for category filtering
    });

    // Fetch metadata for each result from SQLite
    const getAsync = promisify(metadataDB.get.bind(metadataDB));
    const enrichedResults = [];

    for (const result of results) {
      const metadata = await getAsync(
        'SELECT * FROM learnings WHERE id = ?',
        [result.id]
      );

      if (metadata) {
        // Apply category filter if specified
        if (!category || metadata.category.toUpperCase() === category.toUpperCase()) {
          enrichedResults.push({
            task_id: metadata.task_id,
            category: metadata.category,
            title: metadata.title,
            description: metadata.description,
            confidence: metadata.confidence,
            tags: metadata.tags,
            timestamp: metadata.timestamp,
            similarity: result.score || 0,
          });
        }
      }
    }

    return enrichedResults.slice(0, limit);
  } catch (error) {
    console.error('Error querying learnings:', error.message);
    return [];
  }
}
