/**
 * Agent Compliance Validator Test Suite
 *
 * Tests all agent files for compliance with new requirements:
 * - SQLite memory integration
 * - Hook validation system
 * - Blocking coordination (coordinators)
 * - CFN Loop memory patterns
 * - ACL level declarations
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface AgentFrontmatter {
  name: string;
  description: string;
  tools: string[];
  model: string;
  provider?: string;
  color: string;
  type?: string;
  validation_hooks?: string[];
  lifecycle?: {
    pre_task?: string;
    post_task?: string;
  };
  acl_level?: number;
  capabilities?: string[];
}

interface AgentFile {
  path: string;
  name: string;
  frontmatter: AgentFrontmatter;
  body: string;
  category: AgentCategory;
}

type AgentCategory =
  | 'implementer'
  | 'coordinator'
  | 'validator'
  | 'strategic'
  | 'sparc'
  | 'researcher'
  | 'documentation';

interface ValidationResult {
  valid: boolean;
  violations: string[];
  warnings: string[];
  category: AgentCategory;
  score: number; // 0-100
}

interface CategoryRequirements {
  requiredValidationHooks: string[];
  requiredACLLevel: number | number[];
  requiresBlockingCoordination: boolean;
  requiresCFNLoopIntegration: boolean;
  requiresTestCoverage: boolean;
  minBodySections: string[];
}

// ============================================================================
// Configuration
// ============================================================================

const AGENT_BASE_PATH = path.join(process.cwd(), '.claude', 'agents');

const CATEGORY_REQUIREMENTS: Record<AgentCategory, CategoryRequirements> = {
  implementer: {
    requiredValidationHooks: [
      'agent-template-validator',
      'cfn-loop-memory-validator',
      'test-coverage-validator'
    ],
    requiredACLLevel: 1, // Private
    requiresBlockingCoordination: false,
    requiresCFNLoopIntegration: true, // Loop 3
    requiresTestCoverage: true,
    minBodySections: [
      'SQLite Integration',
      'Agent Lifecycle',
      'CFN Loop 3 Integration',
      'Error Handling'
    ]
  },
  coordinator: {
    requiredValidationHooks: [
      'agent-template-validator',
      'cfn-loop-memory-validator',
      'blocking-coordination-validator'
    ],
    requiredACLLevel: 3, // Swarm
    requiresBlockingCoordination: true,
    requiresCFNLoopIntegration: true,
    requiresTestCoverage: false,
    minBodySections: [
      'Blocking Coordination Integration',
      'Signal ACK Protocol',
      'Heartbeat Broadcasting',
      'Dead Coordinator Detection',
      'Error Handling'
    ]
  },
  validator: {
    requiredValidationHooks: [
      'agent-template-validator',
      'cfn-loop-memory-validator',
      'test-coverage-validator'
    ],
    requiredACLLevel: 3, // Swarm
    requiresBlockingCoordination: false,
    requiresCFNLoopIntegration: true, // Loop 2
    requiresTestCoverage: true,
    minBodySections: [
      'CFN Loop 2 Consensus Validation',
      'Validation Vote Persistence',
      'Consensus Calculation',
      'Error Handling'
    ]
  },
  strategic: {
    requiredValidationHooks: [
      'agent-template-validator',
      'cfn-loop-memory-validator'
    ],
    requiredACLLevel: 4, // Project
    requiresBlockingCoordination: false,
    requiresCFNLoopIntegration: true, // Loop 4
    requiresTestCoverage: false,
    minBodySections: [
      'Loop 4 GOAP Decision',
      'Decision Persistence',
      '365-Day Retention',
      'Error Handling'
    ]
  },
  sparc: {
    requiredValidationHooks: [
      'agent-template-validator',
      'cfn-loop-memory-validator'
    ],
    requiredACLLevel: [1, 3], // Varies by SPARC phase
    requiresBlockingCoordination: false,
    requiresCFNLoopIntegration: false,
    requiresTestCoverage: false,
    minBodySections: [
      'SPARC Methodology',
      'Memory Persistence',
      'Error Handling'
    ]
  },
  researcher: {
    requiredValidationHooks: [
      'agent-template-validator'
    ],
    requiredACLLevel: [1, 3], // Varies by context
    requiresBlockingCoordination: false,
    requiresCFNLoopIntegration: false,
    requiresTestCoverage: false,
    minBodySections: [
      'Research Approach',
      'Memory Persistence'
    ]
  },
  documentation: {
    requiredValidationHooks: [
      'agent-template-validator'
    ],
    requiredACLLevel: 3, // Swarm (shared docs)
    requiresBlockingCoordination: false,
    requiresCFNLoopIntegration: false,
    requiresTestCoverage: false,
    minBodySections: [
      'Documentation Standards',
      'Memory Persistence'
    ]
  }
};

// Agent categorization by path patterns
const AGENT_CATEGORY_PATTERNS: Array<[RegExp, AgentCategory]> = [
  [/core-agents\/(coder|tester|analyst)\.md/, 'implementer'],
  [/development\/backend\//, 'implementer'],
  [/specialized\/mobile\//, 'implementer'],
  [/testing\//, 'implementer'],
  [/core-agents\/(coordinator|task-coordinator)\.md/, 'coordinator'],
  [/swarm\/.*coordinator.*\.md/, 'coordinator'],
  [/consensus\/.*coordinator.*\.md/, 'coordinator'],
  [/core-agents\/reviewer\.md/, 'validator'],
  [/analysis\/code-review\//, 'validator'],
  [/security\//, 'validator'],
  [/testing\/validation\//, 'validator'],
  [/cfn-loop\/product-owner\.md/, 'strategic'],
  [/goal\/goal-planner\.md/, 'strategic'],
  [/sparc\//, 'sparc'],
  [/core-agents\/(researcher|planner)\.md/, 'researcher'],
  [/documentation\//, 'documentation'],
  [/frontend\//, 'implementer']
];

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Discover all agent files in the agents directory
 */
function discoverAgentFiles(): string[] {
  const agentFiles: string[] = [];

  function traverse(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip non-agent directories
        if (!['agent-principles', 'examples', 'predesign-negotiation'].includes(entry.name)) {
          traverse(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Skip documentation files
        if (!entry.name.startsWith('README') &&
            !entry.name.includes('CLAUDE.md') &&
            !entry.name.includes('GUIDELINES') &&
            !entry.name.includes('FINDINGS') &&
            !entry.name.includes('PRINCIPLES') &&
            !entry.name.includes('VALIDATION')) {
          agentFiles.push(fullPath);
        }
      }
    }
  }

  traverse(AGENT_BASE_PATH);
  return agentFiles;
}

/**
 * Parse agent file frontmatter and body
 */
function parseAgentFile(filePath: string): AgentFile {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract frontmatter (YAML between --- markers)
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    throw new Error(`No frontmatter found in ${filePath}`);
  }

  const frontmatterYaml = frontmatterMatch[1];
  const frontmatter = yaml.load(frontmatterYaml) as AgentFrontmatter;

  // Extract body (everything after frontmatter)
  const body = content.slice(frontmatterMatch[0].length).trim();

  // Determine category
  const relativePath = path.relative(AGENT_BASE_PATH, filePath);
  const category = categorizeAgent(relativePath);

  return {
    path: filePath,
    name: frontmatter.name || path.basename(filePath, '.md'),
    frontmatter,
    body,
    category
  };
}

/**
 * Categorize agent based on file path
 */
function categorizeAgent(relativePath: string): AgentCategory {
  for (const [pattern, category] of AGENT_CATEGORY_PATTERNS) {
    if (pattern.jest.setTimeout(10000);
  test(relativePath)) {
      return category;
    }
  }

  // Default to implementer if unclear
  return 'implementer';
}

/**
 * Validate agent file against requirements
 */
function validateAgent(agent: AgentFile): ValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const requirements = CATEGORY_REQUIREMENTS[agent.category];

  // 1. Validate frontmatter structure
  if (!agent.frontmatter.name) {
    violations.push('Missing required field: name');
  }

  if (!agent.frontmatter.description) {
    violations.push('Missing required field: description');
  }

  if (!agent.frontmatter.tools || agent.frontmatter.tools.length === 0) {
    violations.push('Missing required field: tools');
  }

  if (!agent.frontmatter.model) {
    violations.push('Missing required field: model');
  }

  if (!agent.frontmatter.color) {
    violations.push('Missing required field: color');
  }

  // 2. Validate validation_hooks
  if (!agent.frontmatter.validation_hooks || agent.frontmatter.validation_hooks.length === 0) {
    violations.push('Missing required field: validation_hooks');
  } else {
    for (const requiredHook of requirements.requiredValidationHooks) {
      if (!agent.frontmatter.validation_hooks.includes(requiredHook)) {
        violations.push(`Missing required validation hook: ${requiredHook}`);
      }
    }
  }

  // 3. Validate lifecycle hooks
  if (!agent.frontmatter.lifecycle) {
    violations.push('Missing required field: lifecycle');
  } else {
    if (!agent.frontmatter.lifecycle.pre_task) {
      violations.push('Missing required lifecycle hook: pre_task (SQLite agent registration)');
    } else {
      // Validate pre_task contains SQLite registration
      if (!agent.frontmatter.lifecycle.pre_task.includes('INSERT INTO agents')) {
        violations.push('lifecycle.pre_task must contain SQLite INSERT INTO agents statement');
      }
    }

    if (!agent.frontmatter.lifecycle.post_task) {
      violations.push('Missing required lifecycle hook: post_task (SQLite completion update)');
    } else {
      // Validate post_task contains SQLite update
      if (!agent.frontmatter.lifecycle.post_task.includes('UPDATE agents')) {
        violations.push('lifecycle.post_task must contain SQLite UPDATE agents statement');
      }
    }
  }

  // 4. Validate ACL level
  if (agent.frontmatter.acl_level === undefined) {
    violations.push('Missing required field: acl_level');
  } else {
    const requiredLevel = requirements.requiredACLLevel;
    if (Array.isArray(requiredLevel)) {
      if (!requiredLevel.includes(agent.frontmatter.acl_level)) {
        violations.push(`Invalid acl_level: ${agent.frontmatter.acl_level} (expected one of: ${requiredLevel.join(', ')})`);
      }
    } else {
      if (agent.frontmatter.acl_level !== requiredLevel) {
        violations.push(`Invalid acl_level: ${agent.frontmatter.acl_level} (expected: ${requiredLevel})`);
      }
    }
  }

  // 5. Validate body sections
  for (const section of requirements.minBodySections) {
    if (!agent.body.includes(section)) {
      violations.push(`Missing required body section: ${section}`);
    }
  }

  // 6. Category-specific validations
  if (requirements.requiresBlockingCoordination) {
    // Coordinator-specific checks
    if (!agent.body.includes('BlockingCoordinationSignals')) {
      violations.push('Coordinator missing BlockingCoordinationSignals import');
    }

    if (!agent.body.includes('CoordinatorTimeoutHandler')) {
      violations.push('Coordinator missing CoordinatorTimeoutHandler import');
    }

    if (!agent.body.includes('BLOCKING_COORDINATION_SECRET')) {
      violations.push('Coordinator missing HMAC secret usage (process.env.BLOCKING_COORDINATION_SECRET)');
    }

    if (!agent.body.includes('sendSignal')) {
      violations.push('Coordinator missing sendSignal pattern');
    }

    if (!agent.body.includes('waitForAck')) {
      violations.push('Coordinator missing waitForAck pattern');
    }
  }

  if (requirements.requiresCFNLoopIntegration) {
    // CFN Loop memory patterns
    if (agent.category === 'implementer' && !agent.body.includes('cfn/phase-')) {
      violations.push('Implementer missing CFN Loop 3 memory key pattern (cfn/phase-${phaseId}/loop3/)');
    }

    if (agent.category === 'validator' && !agent.body.includes('consensus')) {
      violations.push('Validator missing Loop 2 consensus validation pattern');
    }

    if (agent.category === 'strategic' && !agent.body.includes('loop4/decision')) {
      violations.push('Strategic agent missing Loop 4 decision persistence pattern');
    }
  }

  // 7. Validate SQLite error handling
  if (!agent.body.includes('SQLITE_BUSY') && !agent.body.includes('sqlite.*error')) {
    warnings.push('Missing SQLite error handling patterns (SQLITE_BUSY, retry logic)');
  }

  // 8. Validate Redis pub/sub coordination
  if (!agent.body.includes('redis.publish') && agent.category !== 'researcher') {
    warnings.push('Missing Redis pub/sub coordination (redis.publish)');
  }

  // Calculate compliance score (0-100)
  const totalChecks = 10 + requirements.minBodySections.length;
  const passedChecks = totalChecks - violations.length;
  const score = Math.round((passedChecks / totalChecks) * 100);

  return {
    valid: violations.length === 0,
    violations,
    warnings,
    category: agent.category,
    score
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Agent Compliance Validation', () => {
  let agentFiles: AgentFile[] = [];

  beforeAll(() => {
    const filePaths = discoverAgentFiles();
    agentFiles = filePaths.map(parseAgentFile);

    console.log(`\n📊 Discovered ${agentFiles.length} agent files for validation\n`);
  });

  // ========================================================================
  // Universal Requirements (All Agents)
  // ========================================================================

  describe('Universal Requirements', () => {
    it('should have all required frontmatter fields', () => {
      const results = agentFiles.map(agent => {
        const missing: string[] = [];

        if (!agent.frontmatter.name) missing.push('name');
        if (!agent.frontmatter.description) missing.push('description');
        if (!agent.frontmatter.tools) missing.push('tools');
        if (!agent.frontmatter.model) missing.push('model');
        if (!agent.frontmatter.color) missing.push('color');

        return { agent: agent.name, missing };
      });

      const failedAgents = results.filter(r => r.missing.length > 0);

      if (failedAgents.length > 0) {
        console.log('\n❌ Agents with missing frontmatter fields:');
        failedAgents.forEach(({ agent, missing }) => {
          console.log(`  - ${agent}: Missing [${missing.join(', ')}]`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have validation_hooks array in frontmatter', () => {
      const results = agentFiles.map(agent => ({
        agent: agent.name,
        category: agent.category,
        hasValidationHooks: !!agent.frontmatter.validation_hooks,
        hooks: agent.frontmatter.validation_hooks || []
      }));

      const failedAgents = results.filter(r => !r.hasValidationHooks);

      if (failedAgents.length > 0) {
        console.log('\n❌ Agents missing validation_hooks:');
        failedAgents.forEach(({ agent, category }) => {
          console.log(`  - ${agent} (${category})`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have agent-template-validator hook (mandatory for all)', () => {
      const results = agentFiles.map(agent => ({
        agent: agent.name,
        category: agent.category,
        hasRequiredHook: agent.frontmatter.validation_hooks?.includes('agent-template-validator') || false
      }));

      const failedAgents = results.filter(r => !r.hasRequiredHook);

      if (failedAgents.length > 0) {
        console.log('\n❌ Agents missing agent-template-validator:');
        failedAgents.forEach(({ agent, category }) => {
          console.log(`  - ${agent} (${category})`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have lifecycle.pre_task SQLite registration', () => {
      const results = agentFiles.map(agent => ({
        agent: agent.name,
        category: agent.category,
        hasPreTask: !!agent.frontmatter.lifecycle?.pre_task,
        hasSQLiteInsert: agent.frontmatter.lifecycle?.pre_task?.includes('INSERT INTO agents') || false
      }));

      const failedAgents = results.filter(r => !r.hasPreTask || !r.hasSQLiteInsert);

      if (failedAgents.length > 0) {
        console.log('\n❌ Agents with invalid lifecycle.pre_task:');
        failedAgents.forEach(({ agent, category, hasPreTask, hasSQLiteInsert }) => {
          console.log(`  - ${agent} (${category}): ${!hasPreTask ? 'Missing pre_task' : 'Missing INSERT INTO agents'}`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have lifecycle.post_task SQLite completion update', () => {
      const results = agentFiles.map(agent => ({
        agent: agent.name,
        category: agent.category,
        hasPostTask: !!agent.frontmatter.lifecycle?.post_task,
        hasSQLiteUpdate: agent.frontmatter.lifecycle?.post_task?.includes('UPDATE agents') || false
      }));

      const failedAgents = results.filter(r => !r.hasPostTask || !r.hasSQLiteUpdate);

      if (failedAgents.length > 0) {
        console.log('\n❌ Agents with invalid lifecycle.post_task:');
        failedAgents.forEach(({ agent, category, hasPostTask, hasSQLiteUpdate }) => {
          console.log(`  - ${agent} (${category}): ${!hasPostTask ? 'Missing post_task' : 'Missing UPDATE agents'}`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have acl_level declared', () => {
      const results = agentFiles.map(agent => ({
        agent: agent.name,
        category: agent.category,
        hasACLLevel: agent.frontmatter.acl_level !== undefined,
        aclLevel: agent.frontmatter.acl_level
      }));

      const failedAgents = results.filter(r => !r.hasACLLevel);

      if (failedAgents.length > 0) {
        console.log('\n❌ Agents missing acl_level:');
        failedAgents.forEach(({ agent, category }) => {
          console.log(`  - ${agent} (${category})`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });
  });

  // ========================================================================
  // Category-Specific Requirements
  // ========================================================================

  describe('Implementer Agents', () => {
    const implementers = agentFiles.filter(a => a.category === 'implementer');

    it(`should validate ${implementers.length} implementer agents`, () => {
      console.log(`\n📋 Testing ${implementers.length} implementer agents...`);
      expect(implementers.length).toBeGreaterThan(0);
    });

    it('should have ACL level 1 (Private)', () => {
      const results = implementers.map(agent => ({
        agent: agent.name,
        aclLevel: agent.frontmatter.acl_level,
        isValid: agent.frontmatter.acl_level === 1
      }));

      const failedAgents = results.filter(r => !r.isValid);

      if (failedAgents.length > 0) {
        console.log('\n❌ Implementers with wrong ACL level:');
        failedAgents.forEach(({ agent, aclLevel }) => {
          console.log(`  - ${agent}: ACL ${aclLevel} (expected: 1)`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have test-coverage-validator hook', () => {
      const results = implementers.map(agent => ({
        agent: agent.name,
        hasHook: agent.frontmatter.validation_hooks?.includes('test-coverage-validator') || false
      }));

      const failedAgents = results.filter(r => !r.hasHook);

      if (failedAgents.length > 0) {
        console.log('\n❌ Implementers missing test-coverage-validator:');
        failedAgents.forEach(({ agent }) => {
          console.log(`  - ${agent}`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have CFN Loop 3 integration patterns', () => {
      const results = implementers.map(agent => ({
        agent: agent.name,
        hasLoop3Pattern: agent.body.includes('cfn/phase-') && agent.body.includes('loop3')
      }));

      const failedAgents = results.filter(r => !r.hasLoop3Pattern);

      if (failedAgents.length > 0) {
        console.log('\n❌ Implementers missing CFN Loop 3 patterns:');
        failedAgents.forEach(({ agent }) => {
          console.log(`  - ${agent}`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });
  });

  describe('Coordinator Agents', () => {
    const coordinators = agentFiles.filter(a => a.category === 'coordinator');

    it(`should validate ${coordinators.length} coordinator agents`, () => {
      console.log(`\n📋 Testing ${coordinators.length} coordinator agents...`);
      expect(coordinators.length).toBeGreaterThan(0);
    });

    it('should have ACL level 3 (Swarm)', () => {
      const results = coordinators.map(agent => ({
        agent: agent.name,
        aclLevel: agent.frontmatter.acl_level,
        isValid: agent.frontmatter.acl_level === 3
      }));

      const failedAgents = results.filter(r => !r.isValid);

      if (failedAgents.length > 0) {
        console.log('\n❌ Coordinators with wrong ACL level:');
        failedAgents.forEach(({ agent, aclLevel }) => {
          console.log(`  - ${agent}: ACL ${aclLevel} (expected: 3)`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have blocking-coordination-validator hook', () => {
      const results = coordinators.map(agent => ({
        agent: agent.name,
        hasHook: agent.frontmatter.validation_hooks?.includes('blocking-coordination-validator') || false
      }));

      const failedAgents = results.filter(r => !r.hasHook);

      if (failedAgents.length > 0) {
        console.log('\n❌ Coordinators missing blocking-coordination-validator:');
        failedAgents.forEach(({ agent }) => {
          console.log(`  - ${agent}`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have BlockingCoordinationSignals import', () => {
      const results = coordinators.map(agent => ({
        agent: agent.name,
        hasImport: agent.body.includes('BlockingCoordinationSignals')
      }));

      const failedAgents = results.filter(r => !r.hasImport);

      if (failedAgents.length > 0) {
        console.log('\n❌ Coordinators missing BlockingCoordinationSignals:');
        failedAgents.forEach(({ agent }) => {
          console.log(`  - ${agent}`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have HMAC secret usage', () => {
      const results = coordinators.map(agent => ({
        agent: agent.name,
        hasHMACSecret: agent.body.includes('BLOCKING_COORDINATION_SECRET')
      }));

      const failedAgents = results.filter(r => !r.hasHMACSecret);

      if (failedAgents.length > 0) {
        console.log('\n❌ Coordinators missing HMAC secret:');
        failedAgents.forEach(({ agent }) => {
          console.log(`  - ${agent}`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have Signal ACK patterns (sendSignal, waitForAck)', () => {
      const results = coordinators.map(agent => ({
        agent: agent.name,
        hasSendSignal: agent.body.includes('sendSignal'),
        hasWaitForAck: agent.body.includes('waitForAck')
      }));

      const failedAgents = results.filter(r => !r.hasSendSignal || !r.hasWaitForAck);

      if (failedAgents.length > 0) {
        console.log('\n❌ Coordinators missing Signal ACK patterns:');
        failedAgents.forEach(({ agent, hasSendSignal, hasWaitForAck }) => {
          const missing = [];
          if (!hasSendSignal) missing.push('sendSignal');
          if (!hasWaitForAck) missing.push('waitForAck');
          console.log(`  - ${agent}: Missing [${missing.join(', ')}]`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });
  });

  describe('Validator Agents', () => {
    const validators = agentFiles.filter(a => a.category === 'validator');

    it(`should validate ${validators.length} validator agents`, () => {
      console.log(`\n📋 Testing ${validators.length} validator agents...`);
      expect(validators.length).toBeGreaterThan(0);
    });

    it('should have ACL level 3 (Swarm)', () => {
      const results = validators.map(agent => ({
        agent: agent.name,
        aclLevel: agent.frontmatter.acl_level,
        isValid: agent.frontmatter.acl_level === 3
      }));

      const failedAgents = results.filter(r => !r.isValid);

      if (failedAgents.length > 0) {
        console.log('\n❌ Validators with wrong ACL level:');
        failedAgents.forEach(({ agent, aclLevel }) => {
          console.log(`  - ${agent}: ACL ${aclLevel} (expected: 3)`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have CFN Loop 2 consensus validation patterns', () => {
      const results = validators.map(agent => ({
        agent: agent.name,
        hasConsensusPattern: agent.body.includes('consensus') &&
                            (agent.body.includes('loop2') || agent.body.includes('loop 2') || agent.body.includes('Loop 2'))
      }));

      const failedAgents = results.filter(r => !r.hasConsensusPattern);

      if (failedAgents.length > 0) {
        console.log('\n❌ Validators missing Loop 2 consensus patterns:');
        failedAgents.forEach(({ agent }) => {
          console.log(`  - ${agent}`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });
  });

  describe('Strategic Agents (Product Owner)', () => {
    const strategic = agentFiles.filter(a => a.category === 'strategic');

    it(`should validate ${strategic.length} strategic agent(s)`, () => {
      console.log(`\n📋 Testing ${strategic.length} strategic agent(s)...`);
      expect(strategic.length).toBeGreaterThan(0);
    });

    it('should have ACL level 4 (Project)', () => {
      const results = strategic.map(agent => ({
        agent: agent.name,
        aclLevel: agent.frontmatter.acl_level,
        isValid: agent.frontmatter.acl_level === 4
      }));

      const failedAgents = results.filter(r => !r.isValid);

      if (failedAgents.length > 0) {
        console.log('\n❌ Strategic agents with wrong ACL level:');
        failedAgents.forEach(({ agent, aclLevel }) => {
          console.log(`  - ${agent}: ACL ${aclLevel} (expected: 4)`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have CFN Loop 4 GOAP decision patterns', () => {
      const results = strategic.map(agent => ({
        agent: agent.name,
        hasLoop4Pattern: agent.body.includes('loop4') || agent.body.includes('Loop 4'),
        hasGOAPPattern: agent.body.includes('GOAP') || agent.body.includes('goap')
      }));

      const failedAgents = results.filter(r => !r.hasLoop4Pattern || !r.hasGOAPPattern);

      if (failedAgents.length > 0) {
        console.log('\n❌ Strategic agents missing Loop 4 GOAP patterns:');
        failedAgents.forEach(({ agent, hasLoop4Pattern, hasGOAPPattern }) => {
          const missing = [];
          if (!hasLoop4Pattern) missing.push('Loop 4 reference');
          if (!hasGOAPPattern) missing.push('GOAP reference');
          console.log(`  - ${agent}: Missing [${missing.join(', ')}]`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });

    it('should have 365-day retention policy documented', () => {
      const results = strategic.map(agent => ({
        agent: agent.name,
        hasRetentionPolicy: agent.body.includes('365') || agent.body.includes('31536000')
      }));

      const failedAgents = results.filter(r => !r.hasRetentionPolicy);

      if (failedAgents.length > 0) {
        console.log('\n❌ Strategic agents missing 365-day retention:');
        failedAgents.forEach(({ agent }) => {
          console.log(`  - ${agent}`);
        });
      }

      expect(failedAgents.length).toBe(0);
    });
  });

  // ========================================================================
  // Comprehensive Compliance Report
  // ========================================================================

  describe('Compliance Report', () => {
    it('should generate comprehensive compliance report', () => {
      const results = agentFiles.map(agent => validateAgent(agent));

      const compliantAgents = results.filter(r => r.valid);
      const nonCompliantAgents = results.filter(r => !r.valid);

      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

      console.log('\n' + '='.repeat(80));
      console.log('📊 AGENT COMPLIANCE REPORT');
      console.log('='.repeat(80));
      console.log(`\nTotal Agents: ${agentFiles.length}`);
      console.log(`Compliant: ${compliantAgents.length} (${Math.round(compliantAgents.length / agentFiles.length * 100)}%)`);
      console.log(`Non-Compliant: ${nonCompliantAgents.length} (${Math.round(nonCompliantAgents.length / agentFiles.length * 100)}%)`);
      console.log(`Average Compliance Score: ${avgScore.toFixed(1)}%`);

      // Breakdown by category
      const categories = ['implementer', 'coordinator', 'validator', 'strategic', 'sparc', 'researcher', 'documentation'] as AgentCategory[];

      console.log('\n' + '-'.repeat(80));
      console.log('Category Breakdown:');
      console.log('-'.repeat(80));

      for (const category of categories) {
        const categoryAgents = results.filter(r => r.category === category);
        if (categoryAgents.length === 0) continue;

        const categoryCompliant = categoryAgents.filter(r => r.valid).length;
        const categoryAvgScore = categoryAgents.reduce((sum, r) => sum + r.score, 0) / categoryAgents.length;

        console.log(`\n${category.toUpperCase()}:`);
        console.log(`  Total: ${categoryAgents.length}`);
        console.log(`  Compliant: ${categoryCompliant}/${categoryAgents.length} (${Math.round(categoryCompliant / categoryAgents.length * 100)}%)`);
        console.log(`  Avg Score: ${categoryAvgScore.toFixed(1)}%`);
      }

      // Top violations
      const violationCounts = new Map<string, number>();
      for (const result of results) {
        for (const violation of result.violations) {
          violationCounts.set(violation, (violationCounts.get(violation) || 0) + 1);
        }
      }

      const topViolations = Array.from(violationCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      console.log('\n' + '-'.repeat(80));
      console.log('Top 10 Violations:');
      console.log('-'.repeat(80));

      for (const [violation, count] of topViolations) {
        console.log(`  ${count} agents: ${violation}`);
      }

      console.log('\n' + '='.repeat(80));

      // This test should track progress, not block (use warning instead of assertion)
      if (nonCompliantAgents.length > 0) {
        console.log(`\n⚠️  WARNING: ${nonCompliantAgents.length} agents are not compliant`);
        console.log('   This is expected during the update process.');
        console.log('   See AGENT_UPDATE_MASTER_PLAN.md for remediation timeline.');
      }
    });
  });
});
