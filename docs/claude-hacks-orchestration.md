15 prompts that cut my Coding bill from $7,800 to $129
A team running AI workflows was spending $62,000/month on Claude Opus alone.
They weren't doing anything wrong. Opus 4.8 is exceptional. It reasons through complex problems, manages ambiguity, produces outputs that hold up under scrutiny. They used it for everything: research, drafting, analysis, summarization, batch processing.
Then they found out that Claude Opus 4.8's new Dynamic Workflows feature was designed for something specific: orchestrating complex tasks across hundreds of parallel subagents.
Not executing those tasks. Orchestrating them.
They moved the execution layer to Kimi K2.6 Agent Swarm. Same output quality. Same scale. $7,800/month.
The difference is $54,200/month. That's $650,400/year.
Here is the exact system.
Dynamic Workflow
The setup most teams missed
Claude Opus 4.8 and Kimi K2.6 are not competing tools. They are not interchangeable.
Opus 4.8 is a strategist. It plans, reasons, makes judgment calls, synthesizes complex information, and maintains quality standards across long tasks. Anthropic built Dynamic Workflows specifically so Opus can manage hundreds of parallel subagents without losing coherence.
Kimi K2.6 is an executor. It runs 300 specialized sub-agents in parallel, coordinates 4,000 steps, processes large batches, and produces real files. It scored 58.6% on SWE-Bench Pro. It costs $0.60 per million tokens.
The expensive mistake: routing everything through Opus 4.8 when Opus is built to direct, not to do.
The right setup: Opus 4.8 as the brain. Kimi K2.6 Agent Swarm as the hands.
Three sections. Fifteen prompts. The workflow that saves $54,000/month.
1 / 3 | ORCHESTRATION: what Opus 4.8 is actually built for
Claude Opus 4.8 ships with three things most teams haven't touched.
Dynamic Workflows: Opus manages complex task execution across hundreds of parallel subagents. It routes work, tracks dependencies, surfaces blockers, and adjusts the plan when outputs don't match expectations.
Effort Controls: Opus 4.8 decides how much compute to spend per task. For simple routing decisions, it uses minimal effort. For quality judgment calls that could cascade through 300 downstream agents, it uses maximum reasoning. Same session. Automatic.
Extended Independence: Opus 4.8 works longer without needing check-ins. It flags uncertainty proactively. A 13-hour autonomous workflow no longer requires you to babysit the first two hours.
None of this requires Opus to execute the actual work. It requires Opus to think clearly about what should happen and make sure it does.
Five prompts. Opus 4.8 running as the orchestration layer.
workflow orchestration diagram
→ Prompt 1 : Opus 4.8 as project planner:
I need to execute the following project using multiple AI agents:

Project: [describe the full outcome you need]
Scale: [number of items / files / tasks]
Quality standard: [what good output looks like]
Constraints: [deadline, format, restrictions]

Your job is to build the execution plan, not execute it.

Produce:
1. The breakdown of work into parallel streams
2. The dependencies between streams (what must happen before what)
3. The quality checkpoints where output must be reviewed before continuing
4. The exact brief for each execution stream (what each agent needs to know to do its part)
5. The final assembly instructions (how the outputs combine into the finished deliverable)

Do not write any of the actual content. Only the plan.
→ Prompt 2: Dynamic Workflow task routing:
I have the following tasks to complete this week:

[list your tasks]

Sort them into two groups:

Group A — Opus handles (reasoning-heavy, judgment calls, ambiguous, high-stakes):
[Opus-level criteria: architecture decisions, quality reviews, strategic analysis, anything where being wrong has downstream consequences]

Group B — Kimi Agent Swarm handles (execution-heavy, batch processing, repetitive at scale, clear output spec):
[Kimi-level criteria: researching N sources, producing N files, transforming N inputs, any task where the output spec is clear and the work is parallel]

For each Group B task, write the exact project brief that Kimi Agent Swarm will receive.
For each Group A task, work through it directly.
→ Prompt 3: Quality standard definition before execution:
Kimi Agent Swarm is about to execute the following project:

[describe the project]

Before it runs, I need a quality rubric.

Define:
1. What a passing output looks like for each deliverable type
2. What a failing output looks like (be specific — not "low quality" but "missing citations," "under 500 words," "wrong format")
3. The 3 most common failure modes for this type of task
4. How to catch each failure mode in the output before it reaches the final assembly stage

This rubric will be used to review Agent Swarm outputs before they are accepted.
→ Prompt 4: Opus reviews Kimi output:
Kimi Agent Swarm completed the following project:

Project brief: [what was asked]
Output: [paste or summarize the output]

Review against the quality rubric:
[paste the rubric from Prompt 3]

For each deliverable:
- Pass or fail against each rubric criterion
- Specific issues that need to be fixed (quote the exact problem)
- Whether the issue requires a full re-run or a targeted fix

Produce a revision brief: exactly what Kimi needs to fix, in the same project brief format, so it can be sent directly without re-explanation.
→ Prompt 5: Opus assembles final output from Kimi's parts:
Kimi Agent Swarm produced the following outputs:

[list or paste the outputs]

These are the components of: [describe the final deliverable]

Your job is to assemble them into a coherent final output.

Rules:
- Do not rewrite what works. Connect and integrate.
- Identify and fix inconsistencies between sections
- Ensure the final output reads as one unified piece, not a compilation
- Flag anything that requires my review before finalizing

Final format: [describe exactly what the assembled output should look like]
Opus 4.8 at $15/1M tokens, orchestration-only (30% of workflow): $18,600/month Kimi K2.6 at $0.60/1M tokens, execution (70% of workflow): $1,240/month versus all Opus 4.8: $62,000/month monthly saving: $42,160
2 / 3 | EXECUTION: what Kimi K2.6 Agent Swarm does while Opus plans
Kimi K2.6 Agent Swarm runs 300 domain-specialized sub-agents in parallel. Each one handles a piece of the project brief. They coordinate across up to 4,000 steps. Output arrives as real files: PDFs, spreadsheets, websites, datasets, code.
The financial reality of what this replaces, when Opus hands off the brief:
A research brief for 50 competitor landing pages: $25,000 in agency fees. Kimi executes it for $4-6 in tokens.
A batch of 100 tailored outreach emails from a prospect list: $2,000-5,000 from a copywriter. Kimi executes the Opus-defined brief in one sitting.
A technical audit across 30 codebases: $15,000-40,000 in consultant time. Kimi Agent Swarm runs the spec Opus defined. Opus reviews the summary.
The combination: Opus defines the quality bar. Kimi executes at scale. Opus reviews. Kimi revises. Opus approves.
Five prompts for running the execution layer.
→ Prompt 6: Translate Opus plan into Kimi project brief:
Take the following execution plan produced by Claude Opus:

[paste Opus plan from Prompt 1]

Rewrite it as a Kimi Agent Swarm project brief.

Format:
Project: [one line summary]
Input: [files, URLs, data attached]
Output: [file type / count / naming convention / format]
Phase 1: [first execution stream — what agents do, what they produce]
Phase 2: [second stream — dependencies noted]
Phase 3: [assembly — how outputs combine]
Quality note: [the minimum standard each output must meet]

The brief should be complete enough that Agent Swarm can execute without clarification.
→ Prompt 7: Batch execution with output spec:
Project: [describe the batch task]
Input: [N items — attach files or list them]
Output spec: [exact format, file type, naming convention, one output per input]

For each input:
- [step 1 of what to do]
- [step 2]
- [step 3]
- Output: [exact format of the deliverable]

Quality standard: [minimum requirement — word count, citation format, structure, etc.]

Run all [N] inputs in parallel. Deliver as [file format] named [convention].
→ Prompt 8: Research-to-deliverable in one pass:
Research phase:
Search for [topic / competitor / subject] across [N] sources.
For each source extract: [list of specific data points]
Output: structured dataset with one row per source.

Analysis phase:
Using the research dataset, identify: [patterns / gaps / opportunities / rankings]
Flag any source where the data is unclear or contradictory.

Deliverable phase:
Produce [final output format] using the research and analysis.
Format: [exact specification]
Length: [word count or page count]
Citations: [style]

Total output: one [file type], one supporting dataset.
→ Prompt 9: Save workflow as reusable Skill:
We just completed the following workflow:

Opus defined: [what Opus planned]
Kimi executed: [what Kimi ran]
Output: [what was produced]

Save this as a reusable Skill called [name].

Document:
- The trigger (what kind of request activates this skill)
- The Opus orchestration prompt (what to send Opus to generate the brief)
- The Kimi execution brief template (what gets sent to Agent Swarm)
- The Opus review checklist (what Opus checks before accepting output)
- Expected inputs and outputs

Next time we run this workflow, I want to start from the Skill, not from scratch.
→ Prompt 10: Cost tracking per workflow run:
This workflow just ran:

Opus 4.8 tasks:
[list each task Opus handled, estimated token count]

Kimi K2.6 tasks:
[list each task Kimi handled, estimated token count]

Calculate:
- Opus cost: [tokens] × $0.015 per 1K tokens
- Kimi cost: [tokens] × $0.0006 per 1K tokens
- Total actual cost
- What this workflow would have cost running entirely on Opus
- Savings this run

Log this to WORKFLOW_COSTS.md with date, workflow name, and breakdown.
50 competitor landing pages (manual research): $25,000 100 tailored outreach emails (copywriter): $2,000-5,000 30-codebase technical audit (consultant): $15,000-40,000 Kimi execution with Opus quality brief: $12-40 in tokens per workflow
3 / 3 | THE SYSTEM: routing decisions that cut the bill by 88%
The teams reaching $7,800/month from $62,000 are not using Kimi instead of Opus.
They built a routing layer.
Every task that enters the workflow gets classified: does this require judgment, or does this require execution? The answer determines which model handles it.
Judgment: ambiguous briefs, quality decisions, architecture calls, synthesis of conflicting information, anything where being wrong compounds downstream. Claude Opus 4.8.
Execution: clear output spec, repeatable at scale, high volume, deterministic quality criteria, anything where the brief fully defines what good looks like. Kimi K2.6 Agent Swarm.
The routing rule: if you can write a rubric that a machine could grade, Kimi executes it. If you cannot write that rubric, Opus handles it.
Five prompts. The full routing system.
→ Prompt 11: Weekly workflow audit:
Review the following workflows we ran this week:

[list workflows]

For each workflow, classify every task:
- Opus-only: judgment-heavy, no clear rubric
- Kimi-only: execution-heavy, clear output spec, parallel-friendly
- Hybrid: Opus plans + Kimi executes + Opus reviews

For each Hybrid workflow, write the handoff points:
- What Opus produces before handoff (the brief)
- What Kimi receives (the execution spec)
- What Opus reviews after (the quality rubric)

Flag any task currently on Opus that should move to Kimi.
→ Prompt 12: Build a routing decision tree:
I need a routing framework for our recurring workflow types.

For each workflow type below, define:
1. Which model handles each stage (Opus / Kimi / both)
2. The trigger that routes it to the right model
3. The handoff format between models
4. The cost estimate per run

Workflow types:
- [type 1, e.g. content research + production]
- [type 2, e.g. competitor analysis]
- [type 3, e.g. outreach personalization]
- [type 4, e.g. code review + refactor]

Output: a routing table I can use to classify any incoming request in 30 seconds.
→ Prompt 13: Monthly cost optimization review:
Last month we ran the following volume through our AI workflow:

[describe volume — e.g. 200 research briefs, 500 outreach emails, 30 code audits]

Current setup: [describe what goes to Opus vs Kimi currently]
Current monthly cost: [amount]

Analyze:
1. Which workflows are over-allocated to Opus that Kimi could handle
2. Which workflows are currently on Kimi that Opus should be handling for quality
3. What the optimal split would look like
4. Projected cost at the optimal split

Produce a routing change recommendation with estimated monthly savings.
→ Prompt 14: Handoff prompt template:
Create a standard handoff template for the following workflow:

When Opus completes [task type], it produces [output format].
Kimi Agent Swarm receives this and executes [execution task].
Opus then reviews [review criteria].

Write:
1. The Opus output format that serves as the Kimi brief (structured, no ambiguity)
2. The Kimi execution brief template (slots for Opus to fill in)
3. The Opus review checklist (5 criteria Kimi's output is graded against)
4. The revision loop: if Kimi output fails, what gets sent back and in what format

This template becomes the permanent interface between the two models for this workflow type.
→ Prompt 15: ROI report for stakeholders:
Produce a monthly ROI report for our Opus 4.8 + Kimi K2.6 workflow setup.

Include:
1. Total workflows run this month: [N]
2. Volume processed: [N items / files / tasks]
3. Cost breakdown:
   - Opus 4.8 spend: $[amount]
   - Kimi K2.6 spend: $[amount]
   - Total: $[amount]
4. Equivalent cost running all workflows on Opus 4.8 alone: $[calculated amount]
5. Monthly saving: $[amount]
6. Annualized saving: $[amount × 12]
7. Quality incidents (workflows that failed review and required re-run): [N]
8. Quality incident rate: [%]

Format as an executive summary. One page. Numbers first.
$62,000/month running all workflows on Opus 4.8 $7,800/month with Opus orchestrating and Kimi executing monthly saving: $54,200 annual saving: $650,400 quality incidents with this setup: same or lower (Opus reviews all final output)
CONCLUSION
Here is what changed on May 28, 2026.
Anthropic shipped Claude Opus 4.8 with Dynamic Workflows. It is designed to manage complex task execution across hundreds of parallel subagents. Not to be those subagents. To manage them.
Kimi K2.6 ships with Agent Swarm. 300 specialized sub-agents. 4,000 coordinated steps. $0.60 per million tokens.
These are not competing models. They were built for different layers of the same system.
Opus 4.8 orchestration layer (30% of workflow): $18,600/month Kimi K2.6 execution layer (70% of workflow): $1,240/month total: $19,840/month versus all Opus 4.8: $62,000/month annual saving: $650,400
The teams that figured this out in April and May are now running AI infrastructure that costs $7,800/month and produces what used to cost $62,000. The teams that haven't are still routing everything through the most expensive model on the market for tasks that don't require it.
15 prompts. Two models. The workflow that 88% cheaper is not slower or lower quality.
It is the same output. At the price it should have always been.
