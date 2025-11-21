Here’s a clear summary of the paper **Solving a Million‑Step LLM Task with Zero Errors** (Meyerson et al., 2025) in bullet / sub-bullet form:

---

### ✅ Motivation & Problem

* Large language models (LLMs) have shown strong reasoning and tool-use capabilities, but struggle when required to reliably chain **many dependent steps**. ([arXiv][1])

  * Even a modest per-step error rate (e.g., 1%) means when you have hundreds or thousands of steps, the chance of **no error** becomes vanishingly small. ([arXiv][1])
* The authors focus on whether one can build an LLM-based system that can execute a *very large number of steps* (on the order of one million) with **zero errors**. ([arXiv][1])
* They select the classic benchmark problem Towers of Hanoi (with 20 discs → ~ 1 million moves) as a testbed, because the optimal algorithm is known and the task scales in number of steps. ([arXiv][1])

---

### 🧠 Key Contribution & Approach

* Introduce the framework of **Massively Decomposed Agentic Processes (MDAPs)**. ([arXiv][1])

  * The three core components of their approach:

    1. **Extreme decomposition** of the overall task into very small subtasks (down to a single step). ([arXiv][1])
    2. **Error correction** via a voting scheme among micro-agents solving the same subtask independently. ([arXiv][1])
    3. **Red-flagging** of potentially unreliable outputs (based on heuristics like overly long answers or misformatting) so they can be discarded rather than allowed to propagate errors. ([arXiv][1])
* They build a concrete system called **MAKER** (Maximal Agentic decomposition, first-to-ahead-by-k Error correction, and Red-flagging). ([arXiv][1])
* They provide a formal analysis / scaling laws:

  * How success probability and cost scale with number of steps, per-step error rate, decomposition granularity, voting threshold, etc. ([arXiv][1])
  * For maximal decomposition (one micro-agent per step) the cost scales roughly as Θ(s ln s) for s steps, which is feasible for large s. ([arXiv][1])

---

### 🔍 Methods in Detail

* **Maximal Agentic Decomposition (MAD)**:

  * The full task with (s) steps is broken into (s) subtasks (m = 1 step per subtask). Each micro-agent gets only the minimal needed context and produces one action and the resulting state. ([arXiv][1])
  * Benefits: reduces the context burden, avoids accumulation of confusion as the chain grows. ([arXiv][1])
* **First-to-ahead-by-k Voting**:

  * For each subtask, run multiple independent samples (agents) and vote: once one candidate has k more votes than any other, it’s selected. ([arXiv][1])
  * Theoretical derivation: if per-step success probability is p > 0.5, then with enough k the probability of correct selection can approach 1 for each subtask, and thus for the full task. ([arXiv][1])
* **Red-Flagging**:

  * Monitor outputs for signs of higher risk of error: e.g., misformatted responses, overly long answers (indicative of the model “going off the rails”). If flagged, discard and resample. ([arXiv][1])
  * This raises the effective per-step success probability p and reduces correlated errors. ([arXiv][1])

---

### 📊 Experiments & Results

* **Setup**:

  * Task: Towers of Hanoi with 20 disks → ~1,048,575 moves (≈1 million) in optimal solution. ([arXiv][1])
  * They prompt each micro-agent with the current state, prior move, and strategy summary; the agent outputs next move and next state. ([arXiv][1])
* **Estimating single-step error rates**:

  * They measure per-step error rates of various LLMs under this decomposition (without red-flagging) to calibrate. ([arXiv][1])
  * Observations:

    * Error rates remain stable as task size (number of disks) increases, which is promising for scaling. ([arXiv][1])
    * Smaller non-reasoning models sometimes perform comparably to larger “reasoning” models for this execution-task under micro-agent regime. ([arXiv][1])
* **Full run**:

  * They choose a model (gpt-4.1-mini) with appropriate calibration: set k = 3 votes per step, apply red-flagging, temperature settings, etc. ([arXiv][1])
  * Result: The system **solved the full 20-disk Towers of Hanoi task (~1 million steps) with zero errors**. ([arXiv][1])
* **Cost & scaling**:

  * Provide estimates of expected cost (API token cost, number of calls) under different models and settings. ([arXiv][1])
  * They show that with maximal decomposition the scaling is tractable even for very large s, assuming p is sufficient and k chosen well. ([arXiv][1])

---

### 🤔 Key Insights & Implications

* Achieving zero‐error over ~1 million steps is feasible *not* because each step becomes perfect, but because:

  * Tasks are extremely decomposed → minimal contexts.
  * A micro-agent + voting + red-flagging loop reduces error propagation.
* This suggests the way to scale LLM-based systems to large time horizons might rely **less** on increasingly powerful monolithic LLMs, and **more** on architectures that exploit huge modularity, micro-agents, and error correction (“agents of agents”).
* For long-horizon tasks where **every step must be correct**, naive chaining fails; you need structural designs that incorporate error correction explicitly.
* Even smaller or less “powerful” base models can suffice in this regime — you don’t necessarily need the biggest model for the best results if you set up the architecture wisely.
* The framework and formal scaling laws give guidance for how to build reliable systems for tasks such as supply chains, multi-stage workflows, autonomous systems — wherever many sequential decisions must be correct.
* The task chosen (Towers of Hanoi) is toy/idealised, but the methodology could generalise to real-world processes if tasks can be decomposed appropriately.

---

### 🧾 Limitations & Future Work

* Decomposition assumes that the task can be broken into independent (or minimally dependent) micro-steps and that the correct answer is sample-able by the model for each subtask. In many real-world tasks this may be non-trivial. ([arXiv][1])
* They assume error independence (or low correlation) across samples; correlated errors could undermine voting. The red-flagging helps, but real-world deployments might have more complex error modes. ([arXiv][1])
* While the cost scaling is favourable under MAD (m=1), tasks with subtasks of larger granularity (m>1) incur exponentially higher cost. Decomposition itself may cost non-trivial overhead or require domain expertise. ([arXiv][1])
* The benchmark is specific and algorithmic (Towers of Hanoi) — generalising to open-ended real‐world tasks with unknown optimal sequences remains a challenge.
* Automatically discovering optimal decomposition (what the micro-steps should be) is noted as an orthogonal open question. ([arXiv][1])

---

### 🔮 Conclusion

* The paper demonstrates a proof-of-concept: a large-scale, one-million-step LLM-based execution task completed with **zero errors**, thanks to a micro-agent / voting / decomposition architecture.
* It proposes an alternative scaling path for AI systems: instead of just “bigger LLMs”, design architectures that exploit modularity and robust error correction.
* For real-world applications requiring reliability over many sequential decisions, the MDAP/MAKER approach offers a promising blueprint.

---

If you like, I can also pull out **the main equations**, **cost numbers**, and **detailed breakdown of the experiments** (with tables) for you. Would you like that?

[1]: https://arxiv.org/pdf/2511.09030 "Solving a Million-Step LLM Task with Zero Errors"


You can pretty much translate what they did for Towers of Hanoi directly into a “coding factory” made of micro-agents. Let’s walk through how, and where you save **money** and **latency**.

---

## 1. Mapping MDAP/MAKER ideas to coding

Think in terms of **tiny, verifiable steps** instead of “write the whole feature”:

* **Task decomposition**

  * Big request: “Add OAuth to this service and refactor auth.”
  * Decompose into micro-steps like:

    * Add dependency
    * Create config struct
    * Implement `OAuthClient`
    * Add route `/auth/callback`
    * Update middleware to use new token checker
    * Update tests & docs
  * Go even smaller when needed:

    * “Rename this function safely”
    * “Add null-check in this specific branch”
    * “Modify this SQL query to add WHERE clause”

* **Micro-agents**

  * Each micro-agent receives only:

    * The **smallest relevant code context** (file, function, or diff)
    * The **local subtask description**
    * The **constraints** (language style, frameworks, performance requirements)
  * It produces:

    * A tiny patch (e.g., a diff for one function)
    * Optional rationale / confidence score

* **Error correction**

  * Instead of “asking the model again,” use **automatic checks** as the “voting mechanism”:

    * Unit tests / integration tests
    * Type checker / linter
    * Static analysis (e.g., mypy, ESLint, go vet)
    * Build success/failure
  * Several candidate patches can be generated in parallel; tests & checks decide the winner.

* **Red-flagging in coding**

  * Reject or re-sample patches that:

    * Change way more lines than needed
    * Introduce syntax errors
    * Mess with unrelated files
    * Remove tests or checks
  * You can implement this with:

    * Max diff size thresholds
    * Simple AST/syntax validation
    * “Touched files” whitelist

---

## 2. Making it **inexpensive**

Core idea: **use a small model + tools + tests**; reserve big models only when you really need them.

* **Use a small, cheap model as the workhorse**

  * Most micro-steps are local and pattern-based (e.g., “add argument to all calls of X”).
  * A small model can do those reliably if:

    * You constrain the format (diff only)
    * You give tight instructions and tiny context

* **Minimal context → fewer tokens**

  * Instead of sending the whole file / repo:

    * Send only the **relevant function or region**
    * Use a **code index** to pull just the needed snippets (e.g., all callers of a function)
  * Force the model to output **only the patch** (no chatty prose), so token usage is predictable.

* **Error correction via tools, not more LLM calls**

  * Prefer: “Generate 1–2 candidate patches, run tests, pick the one that passes.”
  * Instead of: “Ask the LLM to critique itself three times.”
  * Automated tools (tests, linters) are **essentially free** compared to LLM calls.

* **Tiered escalation**

  * Level 1: cheap model, strict constraints, minimal context.
  * Level 2: if tests fail or patch is red-flagged, try cheap model again with more context.
  * Level 3: only then call a stronger (more expensive) model **once** for that subtask.
  * This keeps 90–95% of calls on the cheap tier.

* **Caching & reuse**

  * Cache:

    * Parsed ASTs
    * Project-level docs or design summaries given to the model
  * Avoid paying for the same context repeatedly:

    * For many related micro-tasks, reuse a **shared short “project summary”** instead of re-embedding big files.

---

## 3. Making it **fast** despite multiple rounds

The trick is: lots of **parallelism**, and **adaptive redundancy** instead of always doing k-fold voting.

* **Do micro-steps in parallel**

  * Example:

    * You need to update 8 endpoints to follow a new auth pattern.
    * Decompose into 8 micro-tasks (one per endpoint).
    * Run them in parallel using the same cheap model.
  * Tests can also be parallelized:

    * Run only **relevant test subsets** per micro-patch when possible.

* **Adaptive redundancy (not always k=3)**

  * For **simple, low-risk edits**:

    * Use k=1 (single candidate) + tests.
  * For **medium complexity**:

    * Maybe generate k=2 candidates and pick the one that passes tests or looks closest to the spec.
  * For **critical or risky edits** (security-sensitive, core payment logic, etc.):

    * Use a higher k and more checks.
  * So you reserve the “heavy MDAP style” only for critical segments, not the whole codebase.

* **Stop early with “first-ahead-by-k”**

  * If you do want multiple candidates:

    * Generate them **streaming and in parallel**.
    * As soon as one candidate:

      * Passes all tests
      * Satisfies static checks
    * …you accept it and cancel the remaining work.

* **Shallow pipeline depth**

  * Instead of many conversational back-and-forth rounds:

    * Stage 1: Planning (one strong LLM call): produce structured subtask list.
    * Stage 2: Parallel execution of micro-tasks (cheap model).
    * Stage 3: Aggregated test run + final review (maybe strong model once).
  * That’s at most **2–3 LLM “layers” deep**, even if there are hundreds of micro-steps inside.

* **Locality to avoid long global cycles**

  * Don’t run the **entire test suite** after every tiny patch:

    * Use dependency analysis to select only impacted tests.
    * Run full test suite only at certain milestones or before merge.

---

## 4. A concrete architecture you could actually build

Imagine a “coding MDAP” system like this:

1. **Planner (strong model, 1 call)**

   * Input: high-level request + relevant design docs.
   * Output:

     * A list of subtasks:

       * `T1: Modify function X in file A`
       * `T2: Add new module B`
       * `T3: Update tests in file C`
     * Dependencies between them (a DAG).

2. **Scheduler**

   * Topologically sorts subtasks.
   * Starts with those that:

     * Have no dependencies
     * Touch different files (so they can run in parallel).

3. **Micro-agents (cheap model)**

   * For each subtask:

     * Fetch small context (file slice, function, related definitions).
     * Prompt: “Apply this change; respond with a unified diff for this file only.”
     * Validate:

       * Check diff size
       * Parse code / run formatter
       * Reject if suspicious (red-flagged).

4. **Verification layer**

   * For each accepted diff:

     * Apply patch on a branch/working directory.
     * Run:

       * Syntax check
       * Typecheck / linter
       * Impacted tests only (subset).
   * If it fails:

     * Option A: Re-try with the cheap model with more context.
     * Option B: Escalate to strong model for that single subtask.

5. **Global checkpoint**

   * After a batch of subtasks:

     * Run the full test suite.
     * Optionally ask a strong model to review the final diff (only once).

This mirrors MDAP/MAKER:

* Maximal decomposition → many tiny subtasks.
* Voting/error correction → multiple candidates + tests as “judges.”
* Red-flagging → heuristics around diff size, syntax, and tests.

---

## 5. Quick rules of thumb for cheap + fast coding MDAP

* **Make tasks as small as possible**, but not smaller than “one meaningful diff.”
* **Trust tests more than extra LLM calls**:

  * If you can write a unit test, do that instead of another round of model introspection.
* **Default to k=1; increase k only when:**

  * Tests are flaky
  * There is no good automatic verifier
  * The change is highly critical
* **Move most work to a cheap model;**

  * Use strong models for planning, final review, or hard edge cases.
* **Parallel everything that doesn’t conflict**:

  * Micro-tasks
  * Candidate generation
  * Tests

---

If you tell me what your current dev setup looks like (e.g., languages, CI system, whether you can run tests on demand), I can sketch a more concrete, implementation-level design tailored to your stack.
