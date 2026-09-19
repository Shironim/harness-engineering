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

## 2. Architecture & Software Craftsmanship

- **Self-Explanatory Code (Code as Truth):** Code must be readable and understandable on its own without relying on line-by-line technical documentation. Naming of functions, variables, and code structure must make intent explicit and unambiguous.
- **High-Level Documentation Boundary (WHY > HOW):** Technical documentation / `.md` files should ONLY focus on high-level project context, business feature descriptions, and architectural rationales (*WHY*) — not reiterating technical mechanics already readable from the code (*WHAT/HOW*).
- **Simplicity First:** Explicit, readable, and decoupled code is far superior to premature optimization or over-abstraction.
- **Business Domain Centric:** Module boundaries and directory structure must reflect the business domain, not merely the framework hierarchy.
- **Single Source of Truth (SSOT):** State or business rules must never be duplicated across layers. Every module/API must have a clear contract owner (*Boundary Ownership*).
- **Functional Core, Imperative Shell:** Separate pure business logic and computations from side-effect execution (I/O, Database, Network), ensuring domain rules can be tested deterministically in isolation.
- **API & Boundary Integrity:** Every external input or payload must pass strict boundary validation (e.g. Zod, FormRequest, DTO) before entering domain services.

---

## 3. Pragmatic Senior Engineer Coding Patterns

- **Return Early (Kill the Bad Path):** Terminate *unhappy paths* and guard conditions early before entering core logic. Avoid the arrow anti-pattern (deeply nested ifs).
- **Name the Meaning (Domain Over Container):** Name variables and functions after their business domain concept, not their data type or storage container (avoid `$data`, `$arr`, `$list`, `handle()`).
- **Own the Boundary (Anti-Corruption Layer):** Do not let vendors, SDKs, or third-party libraries dictate internal codebase architecture. Encapsulate them inside internal adapters or wrappers.
- **Model the State (Eliminate Impossible States):** Design data structures and state machines such that impossible or invalid states cannot logically occur.
- **Useful Errors (Text for Humans, Codes for Systems):** Provide clear, actionable messages for humans, alongside structured error codes and precise HTTP statuses for systems.
- **Ship Small Diffs (Optimize for Review):** Break work down into small, self-contained, and verified changes (*atomic diffs*). Optimize code for readability, ease of review, and safe reverts.