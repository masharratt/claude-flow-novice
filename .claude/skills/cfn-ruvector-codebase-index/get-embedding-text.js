#!/usr/bin/env node
/**
 * Get Embedding Text - Helper script to generate embedding text for a file
 *
 * Usage: npx tsx get-embedding-text.js <file_path>
 *
 * Returns the embedding text string for use with embeddings.js
 */

import { createEmbeddingText, parseFile } from './parser.js';

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: npx tsx get-embedding-text.js <file_path>');
  process.exit(1);
}

try {
  const metadata = parseFile(filePath);
  const embeddingText = createEmbeddingText(filePath, metadata);
  console.log(embeddingText);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
