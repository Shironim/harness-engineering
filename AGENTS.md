# AGENTS.md — Universal Engineering Mindset & Principles

> Fundamental way of thinking for all AI Agents in analyzing, designing, and executing code. High-density, zero fluff.
---

## 1. Meta-Thinking & Problem Solving

- **Root Cause Over Symptom:** The initial request or visual symptom is rarely the actual problem. Uncover the root cause (*5-Whys*) and articulate your understanding of the root cause before execution.
- **Deduce from Fundamentals:** Test every assumption, dogma, or "best practice". Question *"What is this at its core?"* and *"Best for what context?"* before adopting patterns.
- **Essential vs Accidental Complexity:** Every layer, abstraction, or new piece of logic must be justified by business domain requirements—not by code aesthetics or technical trends.
- **Volatility-Driven Structure:** Separate modules based on what is *volatile* (likely to change) vs what is *stable*, rather than current execution sequence.
- **Reversibility Assessment:**
  - *Two-Way Door (Cheap to reverse):* Execute quickly with measured experimentation.
  - *One-Way Door (Expensive/Permanent - e.g. Schema/Data):* Perform deep analysis, state assumptions, and map risks explicitly prior to execution.
- **Bottleneck Focus:** Identify and focus optimization ONLY on the true constraint/bottleneck (Theory of Constraints).

---

## 2. Architecture & Self-Explanatory Code

- **Self-Explanatory Code (Code as Truth):** Code must be readable and understandable on its own without relying on line-by-line technical documentation. Naming of functions, variables, and code structure must make intent explicit and unambiguous.
- **High-Level Documentation Boundary (WHY > HOW):** Technical documentation / `.md` files should ONLY focus on high-level project context, business feature descriptions, and architectural rationales (*WHY*) — not reiterating technical mechanics already readable from the code (*WHAT/HOW*).
- **Simplicity First:** Explicit, readable, and decoupled code is far superior to premature optimization or over-abstraction.
- **Business Domain Centric:** Module boundaries and directory structure must reflect the business domain, not merely the framework hierarchy.
- **Single Source of Truth (SSOT):** State or business rules must never be duplicated across layers. Every module/API must have a clear contract owner (*Boundary Ownership*).
- **Server as Absolute Trust:** Client-side validation and authorization are UX; server-side validation and authorization are Security. Never bypass server validation.
- **Secure by Default:** Every new endpoint or resource must explicitly define access rules (*default-deny*) from the moment it is created.

---

## 3. Strict Token Economy & Zero Raw Byte Dumping Protocol

- **Absolute Prohibition on Raw Log Dumping:** STRICTLY FORBIDDEN to flood LLM context with raw terminal logs, massive build output (`bun build`, `tsc`), or exhaustive test log dumps (`bun test`).
- **Precision Output Filtering:** Any terminal command execution that could potentially produce massive output MUST be filtered at the execution boundary. Report ONLY concise summaries:
  - Final status (*Success / Failed*).
  - Metric summary (*e.g.*, `45 passed, 0 failures`).
  - Specific error lines and stack traces ONLY when failures occur (*unhappy path*).
- **Hard Quota & Anti-Looping Discovery:** Chained manual probing (such as repeatedly calling `grep_search` followed by `view_file` across multiple files) is STRICTLY PROHIBITED. Initial investigation MUST be capped at **a maximum of 2–3 planned tool calls** via the 3-Code Discovery + 1-Reasoning MCP Suite. This quota applies to the cumulative TOTAL of tools, including sandbox invocations.

- **The MCP Suite (3-Code Discovery + 1-Reasoning):**
  These tools operate as a cohesive, mutually reinforcing investigation and reasoning system:
  1. **`strata-mcp` (Frontend AST & Component Slicing):** Purpose-built mental model for understanding frontend codebases (primarily Vue.js, Nuxt.js, React.js, Next.js, and Astro). Extracts props/emits/hooks contracts, event handlers, route topology, and component hierarchies without dumping raw files.
  2. **`codegraph` (`codegraph_explore`):** Cross-file symbol and dependency relation mapping (caller/callee graphs, backend/frontend call-chains, and refactor blast radiuses). Use to identify target files and symbols.
  3. **`context-mode` (`ctx_execute`):** In-memory sandbox processing, batch comparison, and aggregation of large datasets/logs in an isolated Bun/Node runtime, distilling thousands of lines into concise summaries before entering LLM context.
  4. **`sequential-thinking` (`sequentialthinking` — Dynamic Reasoning Engine):** Formulate and systematically test hypotheses step-by-step before altering code or making architectural shifts. Never take destructive actions based on one-shot assumptions.

- **On-Demand Skill Context Loading (Mandatory Reading Protocol):**
  When a skill is triggered via user commands or becomes relevant to a task, the Agent **MUST read the relevant `SKILL.md` file on-demand** using `view_file` before execution. Do not assume or rely solely on brief descriptions; absorb constraints, workflows, and specific recipes directly from the source document.

- **Anti-Micro-Scripting & Batch-First Aggregation (Strict `ctx_execute` Guardrail):**
  1. *No Serial Script Looping:* STRICTLY PROHIBITED to call `ctx_execute` serially just to inspect file by file or small snippets of code per invocation.
  2. *Batch-First Policy:* If a task involves investigation, comparison, or standardization across $\ge 2$ files, you MUST write **a single batch aggregation script** that reads and compares all target files simultaneously, returning a concise comparative summary matrix.
  3. *Zero Large Output Tolerance:* Sandbox scripts are strictly forbidden from printing raw dumps (full `readFileSync`) that trigger *truncated output*. Output must be filtered inside the script to produce structured concise summaries (JSON/compact table $\le 30$ lines).

- **Mechanical Slicing & Anti-Browsing Protocol (STRICT):**
  1. *Line-Zero Tolerance:* STRICTLY PROHIBITED to call `view_file` without specific target line numbers from `codegraph_explore` (CodeGraph), `find_code` (strata-mcp), or targeted grep.
  2. *Single-Slice Rule:* Calling `view_file` is limited to **at most 1 time per file** in an editing sequence, with a narrow range ($\pm 20$ lines) immediately before calling `replace_file_content`.
  3. *Prohibition on Paging Loops:* STRICTLY PROHIBITED to perform sequential reading loops (e.g., reading lines 1–60, then 61–120, then 121–180) to circumvent line limits. Use AST parsers, CodeGraph symbol index, or targeted search to pinpoint target blocks.

- **The Bookends Protocol & Batch Verification Gate (Frontend Lifecycle):**
  When working on frontend components (Vue, Nuxt, React, Next, Astro):
  1. *Pre-Flight Discovery:* Use `strata-mcp` (`inspect_component` / `get_component_tree`) before writing code to understand public contracts and blast radius without reading raw template/component files.
  2. *Batch-First Editing (No Micro-Verification Looping):* Complete the entire planned sequence of code edits on the target file/batch thoroughly (`replace_file_content`). STRICTLY PROHIBITED to invoke post-flight checks repeatedly between small intermediate edits.
  3. *Single Post-Flight Gate:* ONLY after all changes on the target file are complete, run exactly **1** invocation of `inspect_component(path: "...", audit_events: true)` as a semantic quality gate to verify 0 broken handlers and 0 reactivity/state smells before reporting back to the user.

---

## 4. Senior Engineer Coding Patterns (Pragmatic Engineering)

- **Return Early (Kill the Bad Path):** Terminate *unhappy paths* and guard conditions early before entering core logic. Avoid the arrow anti-pattern (deeply nested ifs).
- **Name the Meaning (Domain Over Container):** Name variables and functions after their business domain concept, not their data type or storage container (avoid `$data`, `$arr`, `$list`, `handle()`).
- **Own the Boundary (Anti-Corruption Layer):** Do not let vendors, SDKs, or third-party libraries dictate internal codebase architecture. Encapsulate them inside internal adapters/wrappers.
- **Model the State (Eliminate Impossible States):** Design data structures and state machines such that impossible or invalid states cannot logically occur.
- **Split the Decision (Pure Logic vs Side-Effects):** Separate pure business logic and computations from side-effect execution (I/O, Database, Network), ensuring rules can be tested in isolation without excessive mocking (*Functional Core, Imperative Shell*).
- **Useful Errors (Text for Humans, Codes for Systems):** Provide clear, actionable messages for humans, alongside structured error codes and precise HTTP statuses for systems.
- **Ship Small Diffs (Optimize for Review):** Break work down into small, self-contained, and verified changes (*atomic diffs*). Optimize code for readability, ease of review (*code review*), and safe reverts, rather than one-off demonstrations.
