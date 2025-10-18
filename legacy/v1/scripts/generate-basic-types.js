#!/usr/bin/env node

/**
 * Generate basic type declarations when TypeScript compiler fails
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const typesDir = path.join(projectRoot, '.claude-flow-novice/dist');

// Create basic index.d.ts
const indexDts = `/**
 * Claude Flow Novice - Type Declarations
 */

export interface AgentConfig {
  id: string;
  name: string;
  type: string;
  capabilities?: string[];
}

export interface SwarmConfig {
  maxAgents?: number;
  strategy?: string;
  mode?: string;
  persistence?: boolean;
}

export declare class AgentManager {
  constructor(config?: SwarmConfig);
  spawnAgent(config: AgentConfig): Promise<string>;
  destroyAgent(id: string): Promise<void>;
  listAgents(): string[];
}

export declare class SimpleAgent {
  constructor(config: AgentConfig);
  execute(task: string): Promise<any>;
}

export declare const AgentType: {
  CODER: string;
  TESTER: string;
  REVIEWER: string;
  PLANNER: string;
};

export declare class ProjectManager {
  createProject(name: string): Promise<void>;
  loadProject(name: string): Promise<void>;
  saveProject(): Promise<void>;
}

export { default as cli } from './src/cli/main.js';
export { default as mcpServer } from './mcp/mcp-server-sdk.js';
`;

// Ensure types directory exists
if (!fs.existsSync(typesDir)) {
  fs.mkdirSync(typesDir, { recursive: true });
}

// Write type declarations
fs.writeFileSync(path.join(typesDir, 'index.d.ts'), indexDts);

console.log('✅ Created basic type declarations');