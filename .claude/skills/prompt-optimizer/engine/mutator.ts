/**
 * Rubric-agnostic strategy-rotation mutator: diagnose-first prompting with
 * targeted edit output. Ported from fireside's lib/mutator-v2.ts, decoupled
 * from any specific rubric — it consumes only:
 *   - the current template
 *   - worst-scoring fixtures' hits (category + matched text, generic)
 *   - a plugin-supplied `rubric.describe()` string (what is scored)
 * No hard-coded ban lists, no `buildRubricReference` — those belonged to
 * fireside's specific rubric and stayed there.
 *
 * BLOCKER-2: this file calls the LLM ONLY through `target.generate`, which
 * is the plugin's own provider client. The engine never imports a provider
 * SDK directly.
 */
import type { Target, Rubric } from './types.js';
import type { PerFixtureResult } from './eval.js';
import type { BudgetTracker } from './budget.js';

export type Strategy =
  | 'tighten-negatives' // strengthen negative constraints / banned patterns
  | 'rewrite-positives' // reword what the model should DO
  | 'restructure-opening' // focus on the opening/first-turn section
  | 'targeted-surgical'; // minimal diff to kill specific violating patterns

export interface MutatorOptions {
  strategy?: Strategy;
  temperature?: number;
  /** iteration index, used to pick a rotation strategy when `strategy` is
   *  omitted. */
  iter?: number;
}

export interface MutationResult {
  newTemplate: string;
  rationale: string;
  diagnosis: string;
  strategy: Strategy;
  cost: number;
  promptTokens: number;
  placeholdersPreserved: boolean;
  modelUsed: string;
}

/** Rotation across iterations to avoid a local optimum. */
export const STRATEGY_ROTATION: Strategy[] = [
  'targeted-surgical',
  'tighten-negatives',
  'rewrite-positives',
  'restructure-opening',
];

export function pickStrategy(iter: number): Strategy {
  return STRATEGY_ROTATION[((iter % STRATEGY_ROTATION.length) + STRATEGY_ROTATION.length) % STRATEGY_ROTATION.length]!;
}

/** The Target contract has no separate placeholder-list field, so the
 *  mutator self-derives the set of {{TOKEN}} placeholders straight from the
 *  template being mutated. This keeps the safety net (never let a rewrite
 *  drop a placeholder) without requiring the contract to carry redundant
 *  metadata a template already encodes. */
export function detectPlaceholders(template: string): string[] {
  const found = new Set<string>();
  const re = /\{\{([A-Z0-9_]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    found.add(m[1]!);
  }
  return [...found];
}

const STRATEGY_INSTRUCTIONS: Record<Strategy, string> = {
  'tighten-negatives': `STRATEGY THIS ITERATION: Tighten the negative constraints / banned-pattern list.
- If the model keeps producing a failure pattern not yet explicitly forbidden, add it to the template's explicit forbidden list.
- Reiterate any "use ONLY the provided data" constraints already in the template.
- Keep the positive instructions mostly unchanged.`,

  'rewrite-positives': `STRATEGY THIS ITERATION: Strengthen the positive instructions.
- The model is likely defaulting to a weak pattern because the instruction under-specifies HOW to satisfy the rubric.
- Replace abstract guidance with CONCRETE required forms.
- Give 1-2 short example shapes the model should mimic (without copying a specific example verbatim).
- Leave the negative/banned list mostly unchanged.`,

  'restructure-opening': `STRATEGY THIS ITERATION: Restructure the construction order.
- Failures often happen when the model leads with the weakest part of its response first. Force it to lead with whatever the rubric weights most heavily.
- Specify a required output skeleton/order.
- Enumerate acceptable variations and require variety across responses.`,

  'targeted-surgical': `STRATEGY THIS ITERATION: Minimal surgical edit.
- Identify the SMALLEST change that kills the observed violations.
- Prefer adding one precise instruction line over rewriting the template.
- You are a scalpel, not a hammer.`,
};

/** Extract the sentence containing a match + 1 sentence before/after, so the
 *  mutator sees a failure in context rather than a bare matched string. */
function extractContext(text: string, match: string): string {
  const idx = text.toLowerCase().indexOf(match.toLowerCase());
  if (idx < 0) return `"${match}" (context not found)`;
  const start = Math.max(0, text.lastIndexOf('.', idx - 1) + 1);
  let end = text.indexOf('.', idx + match.length);
  if (end < 0) end = Math.min(text.length, idx + match.length + 120);
  const snippet = text.slice(start, end + 1).trim();
  const lower = snippet.toLowerCase();
  const mIdx = lower.indexOf(match.toLowerCase());
  if (mIdx < 0) return snippet;
  return (
    snippet.slice(0, mIdx) +
    '>>>' + snippet.slice(mIdx, mIdx + match.length).toUpperCase() + '<<<' +
    snippet.slice(mIdx + match.length)
  );
}

function buildFailureEvidence(worst: PerFixtureResult[]): string {
  return worst
    .map((w, i) => {
      if (w.score.hits.length === 0) {
        return `--- Example ${i + 1} (${w.fixture.id}, score=${w.score.total}) ---\n(No hits — passes rubric.)`;
      }
      const hitDetails = w.score.hits
        .map(h => {
          const ctx = extractContext(w.text, h.matched);
          return `  [${h.category}] MATCHED "${h.matched}"\n    IN CONTEXT: "${ctx}"`;
        })
        .join('\n');
      return `--- Example ${i + 1} (${w.fixture.id}, total=${w.score.total}) ---\n${hitDetails}`;
    })
    .join('\n\n');
}

function buildMetaPrompt(
  rubric: Rubric,
  currentTemplate: string,
  worst: PerFixtureResult[],
  placeholders: string[],
  strategy: Strategy,
): string {
  const failureEvidence = buildFailureEvidence(worst);
  const placeholderList = placeholders.map(p => `  {{${p}}}`).join('\n');
  const strategyBlock = STRATEGY_INSTRUCTIONS[strategy];

  return `You are a prompt engineer improving a template so the model's output satisfies a scoring rubric better.

${rubric.describe()}

MECHANICS:
1. The template contains placeholder tokens {{KIND}}. Preserve every placeholder EXACTLY. Do not add, remove, rename, or merge placeholders. The final template MUST still contain each required placeholder verbatim.
2. Output structure REQUIRED:

---DIAGNOSIS---
<2-4 sentences pinpointing which template sections/phrases likely caused the observed hits. Reference specific template lines when possible. If you cannot identify a cause, say so.>

---STRATEGY---
<1-2 sentences on your edit approach.>

---TEMPLATE---
<full rewritten template — nothing else in this section, no code fences, no preamble>

---RATIONALE---
<2-4 sentences summarizing the changes.>

${strategyBlock}

QUALITY BAR:
- Do not add generic advice ("be natural", "avoid clichés"). Models ignore vague adjectives.
- Prefer ENUMERATION of forbidden patterns over vague prohibitions.
- Prefer CONCRETE positive patterns over abstract ones.
- Keep the template's functional structure. Do not reorder flow sections unless the evidence demands it.

Required placeholders (must all appear verbatim):
${placeholderList}

Current template:

\`\`\`
${currentTemplate}
\`\`\`

---

Observed failures (worst scoring, with rubric hits highlighted in context):

${failureEvidence}

---

Rewrite the template following the output structure above.`;
}

export async function mutateTemplate(
  target: Target,
  rubric: Rubric,
  currentTemplate: string,
  worst: PerFixtureResult[],
  budget: BudgetTracker,
  options: MutatorOptions = {},
): Promise<MutationResult> {
  const strategy: Strategy = options.strategy ?? pickStrategy(options.iter ?? 0);
  const temperature = options.temperature ?? 0.7;
  const placeholders = detectPlaceholders(currentTemplate);

  const metaPrompt = buildMetaPrompt(rubric, currentTemplate, worst, placeholders, strategy);

  const gen = await target.generate(metaPrompt, { temperature });

  budget.record({
    target: target.id,
    phase: 'mutate',
    model: gen.model,
    inputTokens: gen.inputTokens,
    outputTokens: gen.outputTokens,
    cost: gen.cost,
  });

  const raw = gen.raw;
  const diagnosisMatch = raw.match(/---DIAGNOSIS---\s*([\s\S]*?)(?=---STRATEGY---|---TEMPLATE---|$)/i);
  const templateMatch = raw.match(/---TEMPLATE---\s*([\s\S]*?)(?=---RATIONALE---|$)/i);
  const rationaleMatch = raw.match(/---RATIONALE---\s*([\s\S]*?)$/i);

  let newTemplate = templateMatch ? templateMatch[1]!.trim() : '';
  newTemplate = newTemplate.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  const diagnosis = diagnosisMatch ? diagnosisMatch[1]!.trim() : '';
  const rationale = rationaleMatch ? rationaleMatch[1]!.trim() : '';

  // Fallback: if structured parsing failed, treat raw as template.
  if (!newTemplate && raw.trim()) {
    newTemplate = raw.trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }

  // Bidirectional check (FINDING #2): reject if the rewrite either DROPPED
  // any original placeholder, OR INTRODUCED a new one absent from the
  // original set (a hallucinated {{TOKEN}} that would leak as a literal
  // string into renderPrompt, or throw in plugin code that expects only
  // the known placeholder set).
  const newPlaceholders = detectPlaceholders(newTemplate);
  const noDroppedPlaceholders = placeholders.every(p => newTemplate.includes(`{{${p}}}`));
  const noAddedPlaceholders = newPlaceholders.every(p => placeholders.includes(p));
  const placeholdersPreserved = noDroppedPlaceholders && noAddedPlaceholders;

  return {
    newTemplate,
    rationale,
    diagnosis,
    strategy,
    cost: gen.cost,
    promptTokens: gen.inputTokens,
    placeholdersPreserved,
    modelUsed: gen.model,
  };
}
