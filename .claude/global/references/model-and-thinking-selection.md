# Model and Thinking Selection

Which Claude model to run, and how much thinking to give it. Two independent dials: **model** picks
raw capability, **effort** picks how long it reasons before answering. Getting the pair wrong is the
single biggest source of wasted subscription budget and of slow answers to easy questions.

Written 2026-08-25. Grounded in Anthropic's own posts plus practitioner reports gathered with
`.claude/skills/x-search` (sources at the bottom).

## Dial 1: the model

| Model | Shape of work it fits | Reach for it when | Avoid it when |
|-------|----------------------|-------------------|---------------|
| **Haiku 4.5** | Fast, contained, mechanical. Near-frontier quality at a fraction of the cost. | Bulk edits across many files, log parsing, format conversion, lint fixes, test-name sweeps, fan-out subagents doing identical narrow jobs. | Anything requiring a judgment call, a design decision, or holding more than one file's worth of context in its head. |
| **Sonnet 5** | Everyday engineering. The default working model. | Feature implementation against a written plan, TDD loops, code review, research with a clear question, most subagent work. | The plan itself is the hard part, or the failure mode is subtle and architectural. |
| **Opus 5** | Hard reasoning, ambiguity, architecture. | Planning, debugging that survived three hypotheses, security and data-model decisions, anything where being wrong is expensive and invisible. Also the main-chat coordinator. | Mechanical work. It is slower and burns limit for no gain on a rename. |
| **Fable 5** | Long-horizon agentic runs where context must stay connected end to end. | One prompt that has to carry a whole multi-hour build, migration, or unattended loop without losing the thread. | Short interactive turns. It is overkill and drains usage limits far faster than Opus 5. |

Practical shorthand from practitioners: treat them as four different hires. Haiku is the intern you
give a checklist. Sonnet is the working engineer. Opus is the senior you bring to the design review.
Fable is the contractor you hand the whole project to and check on tomorrow.

**Decision rule, in order:**

1. Is the task mechanical, with the answer already decided? → **Haiku 4.5**.
2. Is there a written plan and the work is executing it? → **Sonnet 5**.
3. Is the hard part deciding *what* to do, or is the failure mode quiet? → **Opus 5**.
4. Does one run need to hold hours of connected state unattended? → **Fable 5**.

**Local convention that overrides the above:** implementation subagents run Sonnet with TDD
(CLAUDE.md Plan Mode Protocol). Main chat coordinates on Opus. Do not promote an implementer to Opus
to rescue a bad plan. Fix the plan.

## Dial 2: effort and thinking

Effort levels, lowest to highest: **low, medium, high, xhigh, max**. Anthropic's thinking is
*adaptive*: a higher setting is a ceiling on reasoning, not a quota it must spend. Setting high on a
trivial question mostly costs nothing extra, because the model stops early. That asymmetry matters:
the cost of setting effort too low (a wrong answer you then debug) is far worse than the cost of
setting it too high (a few seconds and some tokens).

Keywords in Claude Code:

- **`ultrathink`** in a prompt raises the thinking budget for that one turn. Turn-scoped, not sticky.
  Claude Code now shows in the input when a word you typed has moved the thinking budget.
- **`ultracode`** is a different thing and is widely confused with `ultrathink`. It is not "think
  longer": it opts into multi-agent orchestration, and runs agents at xhigh by default. Use it for
  breadth, not for depth on a single hard question.
- Older phrasing (`think`, `think harder`, `megathink`) still works and still escalates.

**Raise effort when:**

- The task is architectural, or touches shared state, RLS, auth, money, or anything that can be
  wrong quietly.
- You are three failed hypotheses deep on a bug. The 3-strike rule says escalate; escalating effort
  is the cheapest first escalation.
- The model just produced something plausible that you cannot immediately verify.
- You are writing a plan, spec, or migration that other agents will execute blindly.
- Opus is stuck. Practitioner consensus is that adding `ultrathink` to an Opus prompt unsticks a
  surprising share of stalls, more reliably than switching models.

**Lower effort when:**

- Bulk mechanical passes: renames, import fixes, formatting, generated-file updates.
- Fan-out subagents doing many identical narrow jobs, where the per-agent decision space is tiny.
- Interactive back-and-forth where you want a fast loop and you will catch errors yourself in
  seconds.

**Leave it alone when:** ordinary feature work against a plan. Default effort is tuned for that, and
fiddling per turn costs more attention than it returns.

## The pairs that actually come up

| Situation | Model | Effort |
|-----------|-------|--------|
| Writing a plan or spec | Opus 5 | high or xhigh |
| Reviewing a plan for blast radius | Opus 5 | xhigh |
| Implementing a planned feature, TDD | Sonnet 5 | default |
| Code review before commit | Sonnet 5 | high |
| Security or RLS review | Opus 5 | xhigh |
| Debugging, first two hypotheses | Sonnet 5 | default |
| Debugging, after three failures | Opus 5 | ultrathink / max |
| Bulk mechanical edit across 30 files | Haiku 4.5 | low |
| Parallel research fan-out, narrow questions each | Haiku 4.5 or Sonnet 5 | low to default |
| Unattended multi-hour build loop | Fable 5 | default |
| Large orchestrated sweep across a codebase | ultracode (xhigh agents) | n/a |

## Anti-patterns

- **Defaulting everything to the biggest model.** The most expensive model is often the wrong
  commercial choice, and on a subscription it is the thing that ends your day early. Match the hire
  to the job.
- **Confusing `ultracode` with `ultrathink`.** One fans out agents, the other thinks harder. Asking
  for the wrong one gets you a fleet when you wanted depth, or depth when you wanted coverage.
- **Always-max as a policy.** Max can overthink simple tasks with diminishing returns. High or xhigh
  is where the curve usually peaks.
- **Promoting the model instead of fixing the input.** A stronger model on a vague prompt is still
  working from a vague prompt. Effort and clarity beat model tier on ambiguity.
- **Trusting a model swap mid-run.** Reports of handing a Fable-built agent loop to Opus mid-flight
  and losing the thread are common. Finish a long horizon run on the model that started it.

## Sources

Citation URLs returned by the search do not reliably line up with the posts they came from, so these
are attributed by handle and date rather than by link. Re-find any of them with the skill.

Anthropic and Claude accounts:

- Sonnet builds multi-step plans, then orchestrates a team of Haikus in parallel: @claudeai, 2025-10-15
- Extended thinking shipped in Claude Code, "think" / "think more" / "think harder": @_catwu, 2025-03-13
- Hybrid models: near-instant responses and extended thinking in one model: @AnthropicAI, 2025-05-22
- Choose per turn between standard answers and extended thinking: @alexalbert__, 2025-02-24
- Haiku is the fastest and most cost-effective model in its intelligence class: @AnthropicAI, 2024-03-04
- Per-model character differences, Sonnet more affirming, Opus more likely to give candid critiques:
  @AnthropicAI, 2026-07-13

Practitioner reports, gathered 2026-08-25:

- `ultracode` is xhigh plus multi-agent fan-out, not longer thinking, and Anthropic thinking is
  adaptive: @crizcraig, 2026-08-19
- ultrathink is a one-turn keyword, ultracode is xhigh plus auto multi-agent, always-max overthinks
  simple tasks, high or xhigh usually peaks: @grok, 2026-08-20
- Budget escalation ladder `think` < `megathink` < `ultrathink`: @simonw, 2025-04-19
- ultrathink sets high effort, more costly and slower, use sparingly on genuinely complex tasks:
  @svpino, 2026-03-06
- Effort now matters as much as model choice, and ultrathink often unsticks a stuck Opus:
  @dani_avila7, 2026-03-13
- Claude Code surfaces which typed term moved the thinking budget: @PhilippSpiess, 2025-09-16
- Extended thinking earns its latency on architecture, weird edge cases and refactors, not on every
  prompt: @cryptojezuz, 2026-08-25
- The four models as four different hires, Haiku contained, Sonnet everyday, Opus hard reasoning,
  Fable end-to-end projects: @AhsanJaveriya, 2026-08-19
- Haiku for bulk, Sonnet for research, Opus only when it needs to think, roughly half the token
  usage for the same output: @DeRonin_, 2026-05-01
- Losing the thread after swapping models mid-run on a long agentic loop: @PremiumxTrades, 2026-08-24

Refresh with `.claude/skills/x-search/x-search.sh relevant --query "..."`. X posts are opinion and
marketing, so weight Anthropic's own statements above engagement counts.
