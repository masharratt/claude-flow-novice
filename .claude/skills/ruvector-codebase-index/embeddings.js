#!/usr/bin/env node
/**
 * OpenAI Embeddings Generator for RuVector Codebase Index
 *
 * Generates vector embeddings for code files using OpenAI's text-embedding-3-small model.
 * Supports batch processing and handles rate limiting.
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const CONFIG = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'config.json'), 'utf8'));

// Initialize OpenAI client (direct API only - Z.ai doesn't support embeddings)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

/**
 * Generate embedding for a single text input
 * @param {string} text - Input text to embed
 * @returns {Promise<number[]>} - 1536-dimensional embedding vector
 */
async function generateEmbedding(text) {
  try {
    // Skip empty or very short text
    if (!text || text.trim().length < 10) {
      console.error('Error: Text too short for embedding (min 10 chars)');
      return null;
    }

    const response = await openai.embeddings.create({
      model: CONFIG.embeddingModel,
      input: text,
      dimensions: CONFIG.embeddingDimensions,
    });

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      console.error('Error: OpenAI API returned empty response');
      console.error('Response:', JSON.stringify(response, null, 2));
      return null;
    }

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.status, error.response.data);
    }
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
async function generateBatchEmbeddings(texts) {
  const embeddings = [];

  // Process in batches to respect rate limits
  for (let i = 0; i < texts.length; i += CONFIG.batchSize) {
    const batch = texts.slice(i, i + CONFIG.batchSize);

    try {
      const response = await openai.embeddings.create({
        model: CONFIG.embeddingModel,
        input: batch,
        dimensions: CONFIG.embeddingDimensions,
      });

      embeddings.push(...response.data.map(d => d.embedding));

      // Rate limiting: wait 100ms between batches
      if (i + CONFIG.batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Error generating batch embeddings (batch ${i / CONFIG.batchSize + 1}):`, error.message);
      throw error;
    }
  }

  return embeddings;
}

/**
 * Store error pattern in RuVector (placeholder - implement with actual RuVector client)
 */
async function storeErrorPattern(doc) {
  const data = JSON.parse(doc);
  // TODO: Integrate with RuVector client to store in 'error_patterns' collection
  console.error('Warning: RuVector storage not yet implemented. Error pattern would be stored:');
  console.error(JSON.stringify(data, null, 2));
  return { stored: true, collection: 'error_patterns', id: data.task_id };
}

/**
 * Store learning in RuVector (placeholder - implement with actual RuVector client)
 */
async function storeLearning(doc) {
  const data = JSON.parse(doc);
  // TODO: Integrate with RuVector client to store in 'learnings' collection
  console.error('Warning: RuVector storage not yet implemented. Learning would be stored:');
  console.error(JSON.stringify(data, null, 2));
  return { stored: true, collection: 'learnings', id: data.task_id };
}

/**
 * Query error patterns from RuVector (placeholder - implement with actual RuVector client)
 */
async function queryErrorPatterns(taskDescription, limit) {
  // TODO: Integrate with RuVector client to query 'error_patterns' collection
  console.error('Warning: RuVector query not yet implemented. Would search for:', taskDescription);
  return []; // Return empty array for now
}

/**
 * Query learnings from RuVector (placeholder - implement with actual RuVector client)
 */
async function queryLearnings(taskDescription, category, limit) {
  // TODO: Integrate with RuVector client to query 'learnings' collection
  console.error('Warning: RuVector query not yet implemented. Would search for:', taskDescription, 'category:', category);
  return []; // Return empty array for now
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: embeddings.js <command> [args...]');
    console.error('Commands:');
    console.error('  <text>                    - Generate embedding for text');
    console.error('  --batch <file.json>       - Batch generate embeddings');
    console.error('  store-error-pattern <doc> - Store error pattern');
    console.error('  store-learning <doc>      - Store learning/pattern');
    console.error('  query-error-patterns <desc> <limit> - Query error patterns');
    console.error('  query-learnings <desc> <category> <limit> - Query learnings');
    process.exit(1);
  }

  // Command routing
  const command = args[0];

  if (command === '--batch' && args[1]) {
    // Batch mode: read JSON file with array of texts
    const texts = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    const embeddings = await generateBatchEmbeddings(texts);
    console.log(JSON.stringify(embeddings));
  } else if (command === 'store-error-pattern' && args[1]) {
    const result = await storeErrorPattern(args[1]);
    console.log(JSON.stringify(result));
  } else if (command === 'store-learning' && args[1]) {
    const result = await storeLearning(args[1]);
    console.log(JSON.stringify(result));
  } else if (command === 'query-error-patterns' && args[1]) {
    const limit = parseInt(args[2]) || 5;
    const results = await queryErrorPatterns(args[1], limit);
    console.log(JSON.stringify(results));
  } else if (command === 'query-learnings' && args[1]) {
    const category = args[2] || '';
    const limit = parseInt(args[3]) || 5;
    const results = await queryLearnings(args[1], category, limit);
    console.log(JSON.stringify(results));
  } else {
    // Single mode: embed single text
    const text = args.join(' ');
    const embedding = await generateEmbedding(text);
    console.log(JSON.stringify(embedding));
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { generateEmbedding, generateBatchEmbeddings };
