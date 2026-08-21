#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// .claude/skills/cfn-agent-lifecycle/lib/selection/src/agent-selector.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var SELECTION_DIR = path.resolve(__dirname, "..");
var DEFAULT_MAPPINGS_PATH = path.join(SELECTION_DIR, "agent-mappings.json");
var DEFAULT_AGENTS_DIR = path.resolve(
  SELECTION_DIR,
  "..",
  "..",
  "..",
  "..",
  "agents",
  "cfn-dev-team"
);
var CLASSIFICATION_KEYWORDS = {
  security: [
    "security",
    "vulnerability",
    "exploit",
    "encryption",
    "ssl",
    "tls",
    "certificate",
    "oauth",
    "saml",
    "rbac",
    "permission",
    "auth",
    "jwt",
    "authentication",
    "authorization"
  ],
  infrastructure: [
    "docker",
    "kubernetes",
    "k8s",
    "helm",
    "deployment",
    "ci/cd",
    "pipeline",
    "aws",
    "gcp",
    "azure",
    "cloud",
    "terraform",
    "ansible",
    "infrastructure"
  ],
  mobile: [
    "mobile",
    "ios",
    "android",
    "react-native",
    "react native",
    "swift",
    "kotlin",
    "flutter",
    "app store",
    "play store"
  ],
  frontend: [
    "react",
    "vue",
    "angular",
    "svelte",
    "typescript",
    "javascript",
    "css",
    "scss",
    "tailwind",
    "ui",
    "ux",
    "design",
    "component",
    "frontend",
    "next.js",
    "remix"
  ],
  database: [
    "schema",
    "migration",
    "index",
    "database",
    "sql",
    "nosql",
    "postgres",
    "mongodb",
    "redis",
    "mysql",
    "table design",
    "create table"
  ],
  "backend-api": [
    "api",
    "rest",
    "graphql",
    "endpoint",
    "middleware",
    "express",
    "fastify",
    "nest.js",
    "backend",
    "server",
    "microservice"
  ],
  performance: [
    "performance",
    "benchmark",
    "latency",
    "throughput",
    "profiling",
    "memory leak",
    "cpu usage",
    "slow",
    "optimize"
  ],
  fullstack: [
    "fullstack",
    "full-stack",
    "full stack"
  ],
  default: []
};
var CATEGORY_PRIORITY = [
  "security",
  "infrastructure",
  "mobile",
  "fullstack",
  "performance",
  "database",
  "frontend",
  "backend-api",
  "default"
];
var AgentSelector = class {
  agentMappings = null;
  mappingsPath;
  agentsDir;
  constructor(mappingsPath = DEFAULT_MAPPINGS_PATH, agentsDir = DEFAULT_AGENTS_DIR) {
    this.mappingsPath = mappingsPath;
    this.agentsDir = agentsDir;
  }
  /**
   * Load agent mappings from JSON file
   */
  async loadMappings() {
    if (this.agentMappings !== null) {
      return this.agentMappings;
    }
    try {
      const mappingsContent = await fs.promises.readFile(this.mappingsPath, "utf-8");
      const parsed = JSON.parse(mappingsContent);
      this.agentMappings = parsed;
      return parsed;
    } catch (error) {
      console.error(`Failed to load agent mappings from ${this.mappingsPath}:`, error);
      throw new Error(`Cannot load agent mappings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /**
   * Classify a task description into a category
   * Returns the category with highest confidence score
   */
  async classifyTask(description) {
    if (!description || description.trim().length === 0) {
      return {
        category: "default",
        confidence: 0,
        keywords: []
      };
    }
    const lowerDesc = description.toLowerCase();
    const scores = {};
    for (const category of CATEGORY_PRIORITY) {
      scores[category] = { count: 0, keywords: [] };
    }
    const hasFrontend = this.hasKeywords(lowerDesc, ["react", "vue", "angular", "svelte", "typescript", "javascript", "css", "scss", "tailwind", "ui", "component", "frontend"]);
    const hasBackend = this.hasKeywords(lowerDesc, ["api", "backend", "server", "database", "endpoint"]);
    const hasFullstackKeyword = this.hasKeywords(lowerDesc, ["fullstack", "full-stack", "full stack"]);
    if (hasFullstackKeyword || hasFrontend && hasBackend) {
      scores["fullstack"].count = 3;
      scores["fullstack"].keywords = ["fullstack"];
    }
    for (const category of CATEGORY_PRIORITY) {
      if (category === "fullstack" || category === "default") continue;
      const keywords = CLASSIFICATION_KEYWORDS[category] || [];
      for (const keyword of keywords) {
        if (lowerDesc.includes(keyword)) {
          scores[category].count++;
          scores[category].keywords.push(keyword);
        }
      }
    }
    let bestCategory = "default";
    let bestScore = 0;
    let bestKeywords = [];
    for (const category of CATEGORY_PRIORITY) {
      if (scores[category].count > bestScore) {
        bestScore = scores[category].count;
        bestCategory = category;
        bestKeywords = scores[category].keywords;
      }
    }
    const confidence = bestCategory === "default" ? 0 : Math.min(1, 0.5 + bestScore * 0.1);
    return {
      category: bestCategory,
      confidence: Math.round(confidence * 100) / 100,
      keywords: bestKeywords
    };
  }
  /**
   * Check if description contains any of the given keywords
   */
  hasKeywords(description, keywords) {
    return keywords.some((keyword) => description.includes(keyword));
  }
  /**
   * Select agents for the given task description
   */
  async selectAgents(description, minValidators = 3) {
    const mappings = await this.loadMappings();
    const classification = await this.classifyTask(description);
    let category = classification.category;
    if (!mappings.categories[category]) {
      console.warn(`[WARN] Invalid category '${category}', falling back to 'default'`);
      category = "default";
    }
    const categoryMapping = mappings.categories[category];
    if (!categoryMapping) {
      throw new Error(`Category '${category}' not found in mappings`);
    }
    let loop3Agents = Array.isArray(categoryMapping.loop3) ? [...categoryMapping.loop3] : [];
    let loop2Agents = Array.isArray(categoryMapping.loop2) ? [...categoryMapping.loop2] : [];
    if (loop3Agents.length === 0) {
      console.warn(`[WARN] Empty Loop 3 agents for category '${category}', using default`);
      const defaultMapping = mappings.categories["default"];
      loop3Agents = Array.isArray(defaultMapping.loop3) ? [...defaultMapping.loop3] : [];
    }
    if (loop2Agents.length === 0) {
      console.warn(`[WARN] Empty Loop 2 agents for category '${category}', using default`);
      const defaultMapping = mappings.categories["default"];
      loop2Agents = Array.isArray(defaultMapping.loop2) ? [...defaultMapping.loop2] : [];
    }
    const validatedLoop3 = await this.validateAndFixAgents(loop3Agents, "backend-developer");
    const validatedLoop2 = await this.validateAndFixAgents(loop2Agents, "tester");
    if (validatedLoop3.length < 2) {
      console.warn("[WARN] Less than 2 Loop 3 agents, adding devops-engineer");
      validatedLoop3.push("devops-engineer");
    }
    while (validatedLoop2.length < minValidators) {
      console.warn(`[WARN] Less than ${minValidators} Loop 2 validators, adding code-quality-validator`);
      validatedLoop2.push("code-quality-validator");
    }
    const productOwner = mappings.product_owner || "product-owner";
    return {
      loop3: validatedLoop3,
      loop2: validatedLoop2,
      product_owner: productOwner,
      category,
      confidence: categoryMapping.confidence || 0.7
    };
  }
  /**
   * Validate agents and replace invalid ones with fallback
   */
  async validateAndFixAgents(agents, fallbackAgent) {
    const mappings = await this.loadMappings();
    const validated = [];
    for (const agent of agents) {
      if (await this.validateAgent(agent, mappings)) {
        validated.push(agent);
      } else {
        console.warn(`[WARN] Invalid agent '${agent}', replacing with ${fallbackAgent}`);
        validated.push(fallbackAgent);
      }
    }
    return validated.length > 0 ? validated : [fallbackAgent];
  }
  /**
   * Validate that an agent exists in the agent profiles
   */
  async validateAgent(agentName, mappings) {
    const agentAliases = mappings.agent_aliases || {};
    const aliasEntry = agentAliases[agentName];
    if (!aliasEntry) {
      return false;
    }
    const resolvedPath = typeof aliasEntry === "string" ? aliasEntry : aliasEntry.path;
    const fullPath = path.join(this.agentsDir, resolvedPath);
    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
      const realPath = await fs.promises.realpath(fullPath);
      const realAgentsDir = await fs.promises.realpath(this.agentsDir);
      return realPath.startsWith(realAgentsDir);
    } catch {
      return false;
    }
  }
  /**
   * Validate agents exist in agent profiles
   */
  async validateAgents(agents) {
    const mappings = await this.loadMappings();
    const validated = [];
    for (const agent of agents) {
      if (await this.validateAgent(agent, mappings)) {
        validated.push(agent);
      }
    }
    return validated;
  }
};

// .claude/skills/cfn-agent-lifecycle/lib/selection/src/cli.ts
var path2 = __toESM(require("path"), 1);
async function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) {
      const defaultResult = {
        loop3: ["backend-developer", "devops-engineer"],
        loop2: ["code-reviewer", "tester", "code-quality-validator"],
        product_owner: "product-owner",
        category: "default",
        confidence: 0.7
      };
      console.log(JSON.stringify(defaultResult));
      return;
    }
    const taskDescription = args[0];
    let minValidators = 3;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--min-validators" && i + 1 < args.length) {
        const parsed = parseInt(args[i + 1], 10);
        if (!isNaN(parsed) && parsed > 0) {
          minValidators = parsed;
        }
        i++;
      }
    }
    const selectionDir = path2.resolve(__dirname, "..");
    const mappingsPath = path2.join(selectionDir, "agent-mappings.json");
    const agentsDir = path2.resolve(
      selectionDir,
      "..",
      "..",
      "..",
      "..",
      "agents",
      "cfn-dev-team"
    );
    const selector = new AgentSelector(mappingsPath, agentsDir);
    const result = await selector.selectAgents(taskDescription, minValidators);
    console.log(JSON.stringify(result));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult = {
      loop3: ["backend-developer", "devops-engineer"],
      loop2: ["code-reviewer", "tester", "code-quality-validator"],
      product_owner: "product-owner",
      category: "default",
      confidence: 0.7
    };
    console.error(`[ERROR] ${errorMessage}`);
    console.log(JSON.stringify(errorResult));
    process.exit(1);
  }
}
main();
