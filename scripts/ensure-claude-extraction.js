#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  } catch (error) {
    console.error(`Error creating directory ${dirPath}: ${error.message}`);
  }
}

function copyDirectory(source, destination) {
  try {
    fs.cpSync(source, destination, { recursive: true });
    console.log(`Copied ${source} to ${destination}`);
  } catch (error) {
    console.error(`Error copying ${source} to ${destination}: ${error.message}`);
  }
}

function extractCfnAgents() {
  const packageRoot = path.resolve(__dirname, '..');
  const nodeModulesPath = path.resolve(packageRoot, 'node_modules/claude-flow-novice');
  const claudeAgentsSource = path.resolve(packageRoot, '.claude');
  const claudeAgentsDestination = path.resolve(nodeModulesPath, '.claude');

  try {
    ensureDirectoryExists(nodeModulesPath);
    copyDirectory(claudeAgentsSource, claudeAgentsDestination);
    console.log('CFN Agents extraction complete.');
  } catch (error) {
    console.error('CFN Agents extraction failed:', error);
  }
}

extractCfnAgents();