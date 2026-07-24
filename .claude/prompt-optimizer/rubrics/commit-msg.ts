/**
 * commit-msg rubric: implements the engine `Rubric` contract (see
 * .claude/skills/prompt-optimizer/engine/types.ts). Lower score = better
 * (engine convention, confirmed in engine/rubric-core.ts -- `isImprovement`
 * accepts a candidate only when its total is <= the previous total with no
 * per-category regression). Zero is the gold standard: a conventional-commit
 * subject line in imperative mood, a body that explains WHY (not just what
 * files changed), no em dashes, no filler words.
 *
 * All checks are deterministic regex/string matching -- no LLM-as-judge.
 */
import type { Rubric, RubricScore, Hit, Fixture } from '../../skills/prompt-optimizer/engine/types.js';

/** Shape of the project data this rubric (and the matching target) expect on
 *  each fixture, beyond the engine's generic `Fixture` (id + split). */
export interface CommitMsgFixture extends Fixture {
  /** Changed file paths, used by the target to render the prompt and by the
   *  whatNotWhy check to recognize "body just repeats the file paths". */
  files: string[];
  /** Plain-language description of what changed (and, for a good example,
   *  hints at why) -- fed into {{DIFF_SUMMARY}}. */
  diffSummary: string;
  /** Metadata label for fixture-diversity bookkeeping only; not scored. */
  changeType: string;
}

const CONVENTIONAL_TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'build', 'ci', 'style', 'revert'];
const TYPE_PREFIX_RE = new RegExp(`^(${CONVENTIONAL_TYPES.join('|')})(\\([a-z0-9.-]+\\))?:\\s*`);

const NOT_IMPERATIVE_RE =
  /\b(added|adding|updated|updating|fixed|fixing|removed|removing|created|creating|changed|changing|deleted|deleting|refactored|refactoring|improved|improving|implemented|implementing|renamed|renaming|moved|moving|wrote|writing|resolved|resolving)\b/i;

const EM_DASH_RE = /—|&mdash;/g;

const FILLER_RE = /\b(just|simply|basically|really|various|actually)\b|some stuff/gi;

const MAX_SUBJECT_LENGTH = 72;

/** Generic connective/verb noise that carries no "why" information on its
 *  own -- excluded before judging whether a body has any real substance. */
const GENERIC_BODY_WORDS = new Set([
  'modified', 'modify', 'modifies', 'update', 'updated', 'updates', 'change',
  'changed', 'changes', 'file', 'files', 'in', 'the', 'and', 'to', 'added',
  'add', 'a', 'an', 'of', 'on', 'for', 'this', 'that', 'is', 'was', 'with',
]);

function splitSubjectBody(text: string): { subject: string; body: string } {
  const lines = text.split(/\r?\n/);
  const subject = (lines[0] ?? '').trim();
  let i = 1;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  const body = lines.slice(i).join('\n').trim();
  return { subject, body };
}

/** Tokenizes changed-file paths into their component parts (directories,
 *  basenames, extensions) so "Modified bar.ts" can be recognized as a
 *  restatement of the file list rather than a real explanation. */
function fileTokenSet(files: string[]): Set<string> {
  const set = new Set<string>();
  for (const f of files) {
    for (const part of f.toLowerCase().split(/[/.\-_]+/)) {
      if (part) set.add(part);
    }
  }
  return set;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** whatNotWhy fires when: the body is absent, OR the body -- once file-path
 *  tokens and generic connective words are stripped out -- has fewer than 4
 *  meaningful words left (i.e. it only restates which files changed), OR the
 *  body is just the subject repeated verbatim. */
function isWhatNotWhy(subject: string, body: string, files: string[]): boolean {
  if (!body) return true;

  const tokens = fileTokenSet(files);
  const bodyWords = normalize(body).split(' ').filter(Boolean);
  if (bodyWords.length === 0) return true;

  const meaningful = bodyWords.filter(w => w.length > 2 && !tokens.has(w) && !GENERIC_BODY_WORDS.has(w));
  if (meaningful.length < 4) return true;

  const normSubject = normalize(subject.replace(TYPE_PREFIX_RE, ''));
  const normBody = normalize(body);
  if (normBody.length > 0 && normBody === normSubject) return true;

  return false;
}

/** Pure scoring function (unit-testable without the Rubric wrapper). */
export function scoreCommitMessage(text: string, fixture: CommitMsgFixture): RubricScore {
  const hits: Hit[] = [];
  const { subject, body } = splitSubjectBody(text);

  let badType = 0;
  const typeMatch = subject.match(TYPE_PREFIX_RE);
  if (!typeMatch) {
    badType = 1;
    hits.push({ category: 'badType', matched: subject.slice(0, 60) });
  }

  let subjectTooLong = 0;
  if (subject.length > MAX_SUBJECT_LENGTH) {
    subjectTooLong = 1;
    hits.push({ category: 'subjectTooLong', matched: `${subject.length} chars (max ${MAX_SUBJECT_LENGTH})` });
  }

  const description = typeMatch ? subject.slice(typeMatch[0].length) : subject;
  let notImperative = 0;
  const impMatch = description.match(NOT_IMPERATIVE_RE);
  if (impMatch) {
    notImperative = 1;
    hits.push({ category: 'notImperative', matched: impMatch[0] });
  }

  let emDash = 0;
  const emMatches = text.match(EM_DASH_RE);
  if (emMatches) {
    emDash = emMatches.length;
    for (const m of emMatches) hits.push({ category: 'emDash', matched: m });
  }

  let whatNotWhy = 0;
  if (isWhatNotWhy(subject, body, fixture.files ?? [])) {
    whatNotWhy = 1;
    hits.push({ category: 'whatNotWhy', matched: body ? 'body restates files/subject, no why' : 'body absent' });
  }

  let filler = 0;
  const fillerMatches = text.match(FILLER_RE);
  if (fillerMatches) {
    filler = fillerMatches.length;
    for (const m of fillerMatches) hits.push({ category: 'filler', matched: m });
  }

  const categories: Record<string, number> = {
    badType,
    subjectTooLong,
    notImperative,
    emDash,
    whatNotWhy,
    filler,
  };
  const total = Object.values(categories).reduce((sum, v) => sum + v, 0);

  return {
    categories,
    total,
    hits,
    ran: true,
    metrics: { subjectLength: subject.length, hasBody: body.length > 0 },
  };
}

const DESCRIBE_TEXT = `SCORING RUBRIC (lower is better; zero is the gold standard):
Gold standard: a conventional-commit subject line "type(scope): imperative
summary" (type is one of ${CONVENTIONAL_TYPES.join('/')}), <=72 chars, in the
imperative mood ("add", not "added"/"adding"), followed by a blank line and a
body that explains WHY the change was needed -- not just which files changed
or a restatement of the subject. No em dashes anywhere. No filler words.

Categories (each occurrence = +1 violation):
- badType: the subject line does not start with a conventional-commit type
  prefix ("type:" or "type(scope):").
- subjectTooLong: the subject line exceeds 72 characters.
- notImperative: the subject's description uses a past-tense or gerund verb
  (added/adding, updated/updating, fixed/fixing, removed/removing, etc.)
  instead of the imperative mood.
- emDash: an em dash character (—) or the literal "&mdash;" appears
  anywhere in the message (hard project rule -- never allowed).
- whatNotWhy: the body is absent, OR the body -- once file names and generic
  connective words are stripped -- has no real substance (it just restates
  which files changed), OR the body is just the subject repeated.
- filler: banned filler words appear (just, simply, basically, really,
  various, actually, "some stuff").`;

export const commitMsgRubric: Rubric = {
  categories: ['badType', 'subjectTooLong', 'notImperative', 'emDash', 'whatNotWhy', 'filler'],

  describe(): string {
    return DESCRIBE_TEXT;
  },

  score(text: string, ctx: Fixture): RubricScore {
    return scoreCommitMessage(text, ctx as CommitMsgFixture);
  },

  // badType and emDash are the two violations worth a single corrective
  // retry: badType often means the model ignored the format instruction
  // entirely (worth one nudge-and-retry), and emDash is a hard CFN rule.
  regenerateOn: ['badType', 'emDash'],
};

export default commitMsgRubric;
