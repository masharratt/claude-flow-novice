#!/usr/bin/env node

/**
 * CFN Worker Runtime CLI.
 *
 * Invoked by the detached orchestrator process as one headless agent. Routes
 * the run to a cost provider (z.ai by default) via the Claude Code `claude -p`
 * binary while the human's main chat stays on Claude. Writes its result
 * through the Coordinator seam so the orchestrator can pick it up.
 *
 * All logic below is pure and unit-testable; the only impure seam is
 * `runClaude`, which the default deps wire to a real `spawnSync('claude', ...)`
 * call. Tests inject a fake `runClaude` so they never spawn a real process.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

import type { Coordinator, WorkerResult } from '../coordination/coordinator';
import { FileCoordinator } from '../coordination/file-coordinator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  agentType: string;
  taskId: string;
  agentId: string;
  iteration: number;
  context: string;
}

export interface ProviderConfig {
  baseUrl: string | null;
  apiKeyEnvVar: string;
  models: Record<string, string>;
}

export interface ModelMap {
  defaultProvider: string;
  defaultTier: string;
  tiers: string[];
  agentTierOverrides: Record<string, string>;
  providers: Record<string, ProviderConfig>;
}

export interface ResolvedProvider {
  provider: string;
  tier: string;
  model: string;
  baseUrl: string | null;
  apiKeyEnvVar: string;
}

export interface RunClaudeResult {
  stdout: string;
  code: number;
}

export interface SpawnAgentDeps {
  runClaude: (prompt: string, childEnv: NodeJS.ProcessEnv) => RunClaudeResult;
  coordinator: Coordinator;
}

// ---------------------------------------------------------------------------
// CFN_RESULT protocol markers (shared by buildPrompt's instruction and
// parseResult's extraction so the two stay in lockstep).
// ---------------------------------------------------------------------------

const CFN_RESULT_START = '<<<CFN_RESULT>>>';
const CFN_RESULT_END = '<<<CFN_END>>>';

const SAFE_DEFAULT_RESULT: WorkerResult = {
  confidence: 0.5,
  deliverables: [],
  testResult: { pass: 0, fail: 0 },
};

// ---------------------------------------------------------------------------
// 1. parseArgs
// ---------------------------------------------------------------------------

/**
 * Parse worker CLI args. First non-flag positional is the agentType. All of
 * `--task-id`, `--agent-id`, `--iteration`, `--context` are required.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  let agentType: string | undefined;
  let taskId: string | undefined;
  let agentId: string | undefined;
  let iteration: number | undefined;
  let context: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }

    switch (token) {
      case '--task-id': {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new Error('--task-id requires a value');
        }
        taskId = value;
        i++;
        break;
      }
      case '--agent-id': {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new Error('--agent-id requires a value');
        }
        agentId = value;
        i++;
        break;
      }
      case '--iteration': {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new Error('--iteration requires a value');
        }
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed)) {
          throw new Error(`--iteration must be an integer, got: ${value}`);
        }
        iteration = parsed;
        i++;
        break;
      }
      case '--context': {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new Error('--context requires a value');
        }
        context = value;
        i++;
        break;
      }
      default: {
        if (token.startsWith('--')) {
          // Unknown flag: ignore rather than misinterpreting it as the
          // agentType positional.
          break;
        }
        if (agentType === undefined) {
          agentType = token;
        }
        break;
      }
    }
  }

  if (agentType === undefined) {
    throw new Error('Missing required positional argument: agentType');
  }
  if (taskId === undefined) {
    throw new Error('Missing required flag: --task-id');
  }
  if (agentId === undefined) {
    throw new Error('Missing required flag: --agent-id');
  }
  if (iteration === undefined) {
    throw new Error('Missing required flag: --iteration');
  }
  if (context === undefined) {
    throw new Error('Missing required flag: --context');
  }

  return { agentType, taskId, agentId, iteration, context };
}

// ---------------------------------------------------------------------------
// 2. resolveProvider
// ---------------------------------------------------------------------------

export function resolveProvider(
  map: ModelMap,
  agentType: string,
  env: NodeJS.ProcessEnv
): ResolvedProvider {
  const provider = env.CFN_PROVIDER || env.CLAUDE_API_PROVIDER || map.defaultProvider;
  const tier = map.agentTierOverrides[agentType] || map.defaultTier;

  const providerConfig = map.providers[provider];
  if (providerConfig === undefined) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const model = providerConfig.models[tier];
  if (model === undefined) {
    throw new Error(`Unknown tier "${tier}" for provider "${provider}"`);
  }

  return {
    provider,
    tier,
    model,
    baseUrl: providerConfig.baseUrl,
    apiKeyEnvVar: providerConfig.apiKeyEnvVar,
  };
}

// ---------------------------------------------------------------------------
// 3. buildChildEnv
// ---------------------------------------------------------------------------

const MANAGED_ANTHROPIC_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
] as const;

/** Build the child process env for the `claude -p` subprocess. Never mutates `env`. */
export function buildChildEnv(resolved: ResolvedProvider, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = { ...env };
  delete childEnv.ANTHROPIC_API_KEY;

  if (typeof resolved.baseUrl === 'string') {
    childEnv.ANTHROPIC_BASE_URL = resolved.baseUrl;
    childEnv.ANTHROPIC_AUTH_TOKEN = env[resolved.apiKeyEnvVar];
    childEnv.ANTHROPIC_MODEL = resolved.model;
    childEnv.ANTHROPIC_SMALL_FAST_MODEL = resolved.model;
  } else {
    // anthropic provider: leave Claude Code's own default routing in place.
    for (const key of MANAGED_ANTHROPIC_ENV_KEYS) {
      delete childEnv[key];
    }
  }

  return childEnv;
}

// ---------------------------------------------------------------------------
// 4. buildPrompt
// ---------------------------------------------------------------------------

function buildResultInstruction(agentType: string): string {
  return [
    '',
    '',
    '=== REQUIRED FINAL OUTPUT ===',
    `You are running as the "${agentType}" agent. Your reply MUST end with a single`,
    'machine-readable result line. Always output it, even for a trivial task or when',
    'unsure: estimate the values rather than omitting the line. One line, no code fence,',
    'nothing after it, in this EXACT format:',
    `${CFN_RESULT_START}{"confidence":0.9,"deliverables":["path/one.ts"],"testResult":{"pass":0,"fail":0}}${CFN_RESULT_END}`,
    'confidence is 0..1 (your self-assessed correctness); deliverables lists the',
    'repo-relative files you created or modified (empty array [] if none); testResult',
    'holds integer pass/fail counts.',
  ].join('\n');
}

/**
 * Remove a leading YAML frontmatter block (--- ... ---) if present.
 * Agent profile .md files open with metadata frontmatter that is noise for the
 * model AND, critically, starts with '---' — which breaks `claude -p <prompt>`
 * arg parsing (see buildPrompt).
 */
export function stripFrontmatter(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

export function buildPrompt(agentType: string, context: string, profileText?: string): string {
  // Lead with a stable non-dash header. The prompt is passed positionally as
  // `claude -p <prompt>`; a value whose first char is '-' (e.g. an agent
  // profile's leading '---' frontmatter) is misparsed by the CLI as an unknown
  // flag, so claude exits non-zero with empty stdout. This header guarantees a
  // safe first character regardless of profile/context content.
  const parts: string[] = ['=== CFN WORKER RUN ==='];
  if (profileText) {
    const body = stripFrontmatter(profileText).trim();
    if (body.length > 0) {
      parts.push(`\n\n${body}`);
    }
  }
  parts.push(`\n\n=== TASK CONTEXT ===\n${context}`);
  parts.push(buildResultInstruction(agentType));
  return parts.join('');
}

// ---------------------------------------------------------------------------
// 5. parseResult
// ---------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate + normalize a parsed JSON value into a WorkerResult.
 * Returns null if it does not even look like a result object (so the caller can
 * keep scanning for a better candidate).
 */
function coerceWorkerResult(parsed: unknown): WorkerResult | null {
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;

  // Must carry at least one result field, else it is unrelated JSON.
  if (!('confidence' in obj) && !('testResult' in obj) && !('deliverables' in obj)) {
    return null;
  }

  let confidence = isFiniteNumber(obj.confidence) ? obj.confidence : 0.5;
  confidence = Math.min(1, Math.max(0, confidence));

  const deliverables = Array.isArray(obj.deliverables)
    ? obj.deliverables.filter((d): d is string => typeof d === 'string')
    : [];

  let testResult: WorkerResult['testResult'] = { pass: 0, fail: 0 };
  if (typeof obj.testResult === 'object' && obj.testResult !== null) {
    const tr = obj.testResult as Record<string, unknown>;
    const pass = isFiniteNumber(tr.pass) ? Math.trunc(tr.pass) : 0;
    const fail = isFiniteNumber(tr.fail) ? Math.trunc(tr.fail) : 0;
    testResult = isFiniteNumber(tr.skip)
      ? { pass, fail, skip: Math.trunc(tr.skip) }
      : { pass, fail };
  }

  return { confidence, deliverables, testResult };
}

/** Extract the result from the explicit <<<CFN_RESULT>>>...<<<CFN_END>>> block. */
function parseMarkerBlock(stdout: string): WorkerResult | null {
  const startIdx = stdout.lastIndexOf(CFN_RESULT_START);
  if (startIdx === -1) {
    return null;
  }
  const endIdx = stdout.indexOf(CFN_RESULT_END, startIdx);
  if (endIdx === -1) {
    return null;
  }
  const jsonStr = stdout.slice(startIdx + CFN_RESULT_START.length, endIdx);
  try {
    return coerceWorkerResult(JSON.parse(jsonStr));
  } catch {
    return null;
  }
}

/**
 * Fallback for models that emit the JSON but drop/mangle the markers: scan for the
 * last top-level {...} object that coerces to a result. Brace matching is naive
 * (does not skip braces inside strings) but this is best-effort salvage only.
 */
function parseLooseJson(stdout: string): WorkerResult | null {
  let last: WorkerResult | null = null;
  const stack: number[] = [];
  for (let i = 0; i < stdout.length; i++) {
    const ch = stdout[i];
    if (ch === '{') {
      stack.push(i);
    } else if (ch === '}') {
      const start = stack.pop();
      if (start === undefined) {
        continue;
      }
      // Only attempt a parse when we close a top-level object.
      if (stack.length === 0) {
        const candidate = stdout.slice(start, i + 1);
        try {
          const coerced = coerceWorkerResult(JSON.parse(candidate));
          if (coerced) {
            last = coerced;
          }
        } catch {
          // Not valid JSON; keep scanning.
        }
      }
    }
  }
  return last;
}

export function parseResult(stdout: string): WorkerResult {
  // Preferred: the explicit marker block.
  const markerResult = parseMarkerBlock(stdout);
  if (markerResult) {
    return markerResult;
  }

  // Fallback: salvage a result-shaped JSON object from looser output.
  const looseResult = parseLooseJson(stdout);
  if (looseResult) {
    return looseResult;
  }

  return SAFE_DEFAULT_RESULT;
}

// ---------------------------------------------------------------------------
// 6. findProjectRoot
// ---------------------------------------------------------------------------

const PROVIDER_MODELS_REL = '.claude/cfn-config/provider-models.json';

export function findProjectRoot(startDir: string): string {
  const override = process.env.CFN_PROJECT_ROOT || process.env.PROJECT_ROOT;
  if (override && fs.existsSync(path.join(override, PROVIDER_MODELS_REL))) {
    return override;
  }

  let dir = path.resolve(startDir);
  const fsRoot = path.parse(dir).root;

  for (;;) {
    // Anchor on the actual config file, not merely a `.claude` directory. A build
    // that emits a nested `dist/.claude/...` tree would otherwise shadow the real
    // project root (which is where provider-models.json actually lives).
    if (fs.existsSync(path.join(dir, PROVIDER_MODELS_REL))) {
      return dir;
    }
    if (dir === fsRoot) {
      break;
    }
    dir = path.dirname(dir);
  }

  return override || process.cwd();
}

// ---------------------------------------------------------------------------
// 7. loadModelMap
// ---------------------------------------------------------------------------

export function loadModelMap(projectRoot: string): ModelMap {
  const filePath = path.join(projectRoot, '.claude/cfn-config/provider-models.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Model map not found at ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as ModelMap;
}

// ---------------------------------------------------------------------------
// 8. loadAgentProfile
// ---------------------------------------------------------------------------

const AGENT_PROFILE_MAX_DEPTH = 8;

function isAgentProfileMatch(fileName: string, agentType: string): boolean {
  if (!fileName.endsWith('.md')) {
    return false;
  }
  const base = fileName.slice(0, -'.md'.length);
  return base === agentType || base.startsWith(agentType);
}

function findAgentProfilePath(dir: string, agentType: string, depth: number): string | undefined {
  if (depth > AGENT_PROFILE_MAX_DEPTH) {
    return undefined;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    if (entry.isFile() && isAgentProfileMatch(entry.name, agentType)) {
      return path.join(dir, entry.name);
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findAgentProfilePath(path.join(dir, entry.name), agentType, depth + 1);
      if (found !== undefined) {
        return found;
      }
    }
  }

  return undefined;
}

/** Best-effort agent profile lookup. Never throws. */
export function loadAgentProfile(projectRoot: string, agentType: string): string | undefined {
  try {
    const agentsDir = path.join(projectRoot, '.claude/agents');
    const match = findAgentProfilePath(agentsDir, agentType, 0);
    if (match === undefined) {
      return undefined;
    }
    return fs.readFileSync(match, 'utf8');
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Default (impure) runClaude implementation
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function defaultRunClaude(prompt: string, childEnv: NodeJS.ProcessEnv): RunClaudeResult {
  const flagsRaw = childEnv.CFN_WORKER_CLAUDE_FLAGS ?? '';
  const extraFlags = flagsRaw.split(/\s+/).filter((f) => f.length > 0);

  const result = spawnSync('claude', ['-p', prompt, ...extraFlags], {
    env: childEnv,
    encoding: 'utf8',
    input: '', // close stdin so `claude -p` does not block 3s waiting for piped input
    maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
    timeout: DEFAULT_TIMEOUT_MS,
  });

  if (result.error) {
    throw result.error;
  }

  return { stdout: result.stdout ?? '', code: result.status ?? 1 };
}

export const defaultDeps: SpawnAgentDeps = {
  runClaude: defaultRunClaude,
  coordinator: new FileCoordinator(),
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function extractFlagValueLoosely(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) {
    return undefined;
  }
  return argv[idx + 1];
}

const FALLBACK_RESULT: WorkerResult = {
  confidence: 0,
  deliverables: [],
  testResult: { pass: 0, fail: 1 },
};

/**
 * Orchestration entrypoint. `argv` is the full `process.argv` (node, script,
 * ...args) — the leading two entries are stripped before parsing.
 *
 * On any thrown error, a fallback result is written and signalDone is called
 * (best effort) before returning, so the orchestrator never hangs waiting on
 * this worker.
 */
export async function main(argv: string[], deps: SpawnAgentDeps): Promise<number> {
  const rawArgs = argv.slice(2);
  let taskId: string | undefined;
  let agentId: string | undefined;

  try {
    const args = parseArgs(rawArgs);
    taskId = args.taskId;
    agentId = args.agentId;

    const projectRoot = findProjectRoot(__dirname);
    const modelMap = loadModelMap(projectRoot);
    const resolved = resolveProvider(modelMap, args.agentType, process.env);
    const childEnv = buildChildEnv(resolved, process.env);
    const profileText = loadAgentProfile(projectRoot, args.agentType);
    const prompt = buildPrompt(args.agentType, args.context, profileText);

    const { stdout, code } = deps.runClaude(prompt, childEnv);
    if (code !== 0) {
      // Non-zero exit with (typically) empty stdout must NOT be parsed into a
      // 0.5 default that gate/consensus would then trust. Surface it as a real
      // failure via the catch -> FALLBACK_RESULT path.
      throw new Error(`claude worker exited with code ${code}`);
    }
    const result = parseResult(stdout);

    deps.coordinator.setResult(taskId, agentId, result);
    deps.coordinator.signalDone(taskId, agentId);

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`spawn-agent-cli error: ${message}\n`);

    const fallbackTaskId = taskId ?? extractFlagValueLoosely(rawArgs, '--task-id');
    const fallbackAgentId = agentId ?? extractFlagValueLoosely(rawArgs, '--agent-id');

    if (fallbackTaskId !== undefined && fallbackAgentId !== undefined) {
      try {
        deps.coordinator.setResult(fallbackTaskId, fallbackAgentId, FALLBACK_RESULT);
        deps.coordinator.signalDone(fallbackTaskId, fallbackAgentId);
      } catch (coordError) {
        const coordMessage = coordError instanceof Error ? coordError.message : String(coordError);
        process.stderr.write(`spawn-agent-cli: failed to write fallback result: ${coordMessage}\n`);
      }
    }

    return 1;
  }
}

if (require.main === module) {
  main(process.argv, defaultDeps).then((code) => process.exit(code));
}
