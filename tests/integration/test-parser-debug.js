#!/usr/bin/env node

/**
 * Debug test for agent-definition-parser.ts
 * Tests the parseFrontmatter function with docker-ts-fixer.md content
 */

const content = `---
name: docker-ts-fixer
description: Fix TypeScript errors in single files (Docker container execution)
tools: [Read, Edit]
model: haiku
type: specialist
---

# Docker TypeScript Fixer

## Mission

Fix TypeScript errors in ONE specified file. No exploration, no project analysis.
`;

function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    console.log("❌ No frontmatter match found");
    return { frontmatter: {}, body: content };
  }

  const [, yamlContent, body] = match;
  console.log("✓ Frontmatter extracted:");
  console.log(yamlContent);
  console.log("\n--- Parsing Line by Line ---\n");

  // Simple YAML parser
  const frontmatter = {};
  const lines = yamlContent.split('\n');
  let currentKey = '';
  let currentArray = [];
  let isInArray = false;
  let isInObject = false;
  let currentObject = {};
  let objectKey = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    console.log(`Line ${i}: "${line}"`);
    console.log(`  Trimmed: "${trimmed}"`);

    if (!trimmed || trimmed.startsWith('#')) {
      console.log(`  → Skip (empty or comment)`);
      continue;
    }

    // Array item
    if (trimmed.startsWith('- ')) {
      console.log(`  → Array item detected`);
      if (!isInArray) {
        isInArray = true;
        currentArray = [];
      }
      currentArray.push(trimmed.substring(2).trim());
      continue;
    }

    // End of array
    if (isInArray && !trimmed.startsWith('- ')) {
      console.log(`  → End of array for key: ${currentKey}`);
      frontmatter[currentKey] = currentArray;
      isInArray = false;
      currentArray = [];
    }

    // Object field (indented key-value)
    if (trimmed.match(/^\s+\w+:/) && isInObject) {
      console.log(`  → Object field`);
      const [objKey, ...objValueParts] = trimmed.split(':');
      const objValue = objValueParts.join(':').trim().replace(/^["']|["']$/g, '');
      currentObject[objKey.trim()] = objValue;
      continue;
    }

    // Key-value pair
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      console.log(`  → Key-value: key="${key}", value="${value}"`);

      // Check if this starts an object
      if (value === '') {
        console.log(`  → Starting object for key: ${key}`);
        isInObject = true;
        currentObject = {};
        objectKey = key;
        continue;
      }

      // End previous object if any
      if (isInObject && !trimmed.match(/^\s+/)) {
        console.log(`  → Ending object for key: ${objectKey}`);
        frontmatter[objectKey] = currentObject;
        isInObject = false;
        currentObject = {};
      }

      currentKey = key;

      // Multi-line string (starts with |)
      if (value === '|') {
        console.log(`  → Multi-line string starts`);
        continue;
      }

      // Inline array (e.g., [item1, item2, item3])
      if (value.startsWith('[') && value.endsWith(']')) {
        console.log(`  → Inline array detected!`);
        const arrayContent = value.substring(1, value.length - 1);
        console.log(`  → Array content: "${arrayContent}"`);
        const items = arrayContent.split(',').map(item => item.trim());
        console.log(`  → Parsed items:`, items);
        frontmatter[key] = items;
        console.log(`  → Assigned to frontmatter[${key}]:`, frontmatter[key]);
        continue;
      }

      // Remove quotes
      const cleanValue = value.replace(/^["']|["']$/g, '');
      console.log(`  → Clean value: "${cleanValue}"`);
      frontmatter[key] = cleanValue;
    } else if (currentKey && trimmed && !isInArray && !isInObject) {
      console.log(`  → Multi-line continuation for key: ${currentKey}`);
      const existingValue = frontmatter[currentKey];
      frontmatter[currentKey] = existingValue
        ? `${existingValue}\n${trimmed}`
        : trimmed;
    }
  }

  // Handle trailing array or object
  if (isInArray) {
    console.log(`\n→ Trailing array for key: ${currentKey}`);
    frontmatter[currentKey] = currentArray;
  }
  if (isInObject) {
    console.log(`\n→ Trailing object for key: ${objectKey}`);
    frontmatter[objectKey] = currentObject;
  }

  console.log("\n--- Final Frontmatter ---\n");
  console.log(JSON.stringify(frontmatter, null, 2));

  return { frontmatter, body: body.trim() };
}

// Run test
console.log("=== Testing parseFrontmatter ===\n");
const result = parseFrontmatter(content);

console.log("\n=== Tools Array Check ===");
console.log("frontmatter.tools:", result.frontmatter.tools);
console.log("Is Array:", Array.isArray(result.frontmatter.tools));
console.log("Length:", result.frontmatter.tools?.length);
console.log("Contents:", result.frontmatter.tools);
