# Harness Engineering for Autonomous AI Agents

Deterministic two-layer runtime guardrails and active memory hygiene for LLM coding agents.

---

## Executive Summary

Autonomous coding agents (such as Google Antigravity, Claude Code, Cursor, and Aider) degrade rapidly when governed solely by system prompts and soft rules. Relying exclusively on markdown guidelines (`GEMINI.md`, `CLAUDE.md`, `.cursorrules`) introduces three systemic failure modes:

1. **Instruction Drift**: As context windows expand, attention distribution flattens, causing compliance with initial instructions to degrade exponentially.
2. **Tool Evasion**: Goal-directed agents blocked by text responses instinctively seek alternative execution paths, using shell pipelines (`awk`, `sed`, base64 streams) or helper scripts to bypass intended restrictions.
3. **Context Degradation and Token Waste**: Storing full file dumps, long grep outputs, and error traces in working memory triggers retrieval failure ("Lost in the Middle"), amplifies reasoning errors, and multiplies operational costs.

This project implements a **deterministic two-layer harness** enforced at the runtime lifecycle boundary, ensuring model compute remains strictly separated from execution governance.

---

## Architecture

The harness intercepts agent tool calls before and after execution via deterministic lifecycle hooks:

```
                          [Agent Invocation Intent]
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                 LAYER 1: DEFENSIVE CONTAINMENT (PreToolUse)               │
│                        Runtime Execution Boundary                         │
├──────────────────────────┬──────────────────────────┬─────────────────────┤
│ Hook Module              │ Target Tools             │ Enforced Constraint │
├──────────────────────────┼──────────────────────────┼─────────────────────┤
│ pre-view-file.cjs        │ view_file                │ Slicing bounds,     │
│                          │                          │ anti-chunking loops │
├──────────────────────────┼──────────────────────────┼─────────────────────┤
│ pre-search-quota.cjs     │ grep_search,             │ Turn call ceiling,  │
│                          │ find_by_name,            │ wildcard blockers,  │
│                          │ call_mcp_tool (sandbox)  │ context-mode quota  │
├──────────────────────────┼──────────────────────────┼─────────────────────┤
│ pre-run-command.cjs      │ run_command              │ Command inspection, │
│                          │                          │ affirmative consent │
└──────────────────────────┴──────────────────────────┴─────────────────────┘
                                      │
                                      │ Decision: ALLOW
                                      ▼
                          [Tool Executes on System]
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                 LAYER 2: ACTIVE MEMORY HYGIENE (PostToolUse)              │
│                        Context Management Boundary                        │
├──────────────────────────┬──────────────────────────┬─────────────────────┤
│ post-transcript-gc.cjs   │ * (All Tools)            │ Disk GC, ephemeral  │
│                          │                          │ payload compaction  │
└──────────────────────────┴──────────────────────────┴─────────────────────┘
```

### Layer 1: Defensive Containment (PreToolUse)
Operates as a deterministic policy firewall before any tool executes:
- **Precision Slicing**: Rejects raw, unbounded file views. Requires line bounds (`StartLine`/`EndLine`) and blocks serial chunking attempts on the same file.
- **Investigation Quotas & Circuit Breaker**: Caps search and discovery calls per interaction turn. Halts trial-and-error loops upon repeated denials to enforce early user escalation.
- **Command Gatekeeping**: Detects evasion patterns (such as streaming large files via shell commands) and gates destructive operations behind affirmative user consent.
- **Actionable Off-Ramps**: Denials always provide alternative tool suggestions (such as AST inspectors or targeted symbol search) to prevent workaround loops.

### Layer 2: Active Memory Hygiene (PostToolUse)
Treats LLM context as ephemeral working memory rather than a permanent ledger:
- **Transcript Garbage Collection**: Condenses verbose tool outputs from prior turns while preserving the active turn and structural findings.
- **Anti-Bloat Compaction**: Prevents context saturation across extended sessions, maintaining reasoning precision and reducing token consumption by up to 85%.

---

## Core Engineering Principles

1. **Separation of Compute and Control**: The LLM provides reasoning and synthesis (compute). Execution boundaries, security policies, and workflow governance belong exclusively to the runtime harness (control).
2. **Ephemeral Working Memory**: Raw inputs, extensive diffs, and intermediate outputs must be pruned once processed. Working memory must prioritize signal over volume.
3. **Bounded Exploration with Affordance**: Constraints must not lead to dead ends. Every rejection must provide explicit, valid alternative paths.

---

## Empirical Benchmark

| Metric / Scenario | Unharnessed Agent | Harnessed Agent | Impact |
|---|---|---|:---:|
| Discovery Token Footprint | 4-6 full files (~18,000 tokens) | Targeted AST queries (~600 tokens) | ~96% reduction |
| Denial Recovery Behavior | 3-5 command evasion retries | Circuit breaker halt at threshold | ~85% token savings |
| Long-Session Input Load (30 turns) | Continuous accumulation (>120,000 tokens) | Compacted working memory (<15,000 tokens) | ~87% cost reduction |
| Command Safety | Dependent on prompt adherence | Enforced via pre-execution parser | Deterministic |

---

## Repository Structure

```
harness-engineering/
├── README.md                          # Project documentation and specifications
├── AGENTS.md                          # Engineering mindset and agent protocol standards
├── GEMINI.md                          # Runtime operational rules and discovery limits
├── hooks.json                         # Hook definitions and tool event matchers
├── hooks/
│   ├── lib/
│   │   └── session-state.cjs          # Transcript parser and turn state tracking
│   ├── pre-view-file.cjs              # File view guard and slice boundary enforcement
│   ├── pre-search-quota.cjs           # Discovery call limits and anti-chaining guards
│   ├── pre-run-command.cjs            # Shell command gatekeeper and consent validation
│   └── post-transcript-gc.cjs         # Context garbage collection and log compactor
├── skills/                            # Modular domain skills and execution protocols
└── docs/
    ├── architecture-and-science.md    # Theoretical foundations and academic citations
    └── hooks-and-runtime-guardrails.md# Detailed specifications and security threat model
```

---

## Modular Skill Suite

The `skills/` directory provides operational protocols for standardized agent workflows:

| Domain | Skills | Objective |
|---|---|---|
| Navigation & Discovery | `understanding-context`, `use-strata`, `use-codegraph`, `use-context-mode` | Structural exploration using AST models, call graphs, and sandboxed batch execution. |
| Reasoning & Strategy | `use-sequential-thinking`, `to-brief`, `to-ui-spec`, `session-handover` | Dynamic hypothesis validation, task specification, and state handover across sessions. |
| Audit & Quality | `audit-codebase`, `security-audit`, `performance-audit`, `code-review`, `bug-trace` | Deep static analysis, threat modeling, bottleneck tracing, and empirical bug reproduction. |
| Delivery & Standards | `ui-anti-slop`, `define-testing`, `atomic-commit`, `pencil-dev`, `ponytail*` | Code hygiene, automated test coverage, atomic git workflows, and anti-complexity modes. |

---

## Quickstart

### Requirements
- Node.js 18.0.0 or higher.
- An agent runtime supporting lifecycle hooks (e.g., Google Antigravity CLI, Antigravity 2.0).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/harness-engineering.git
   cd harness-engineering
   ```

2. Link or copy `hooks.json` to your agent configuration directory (e.g., `~/.gemini/config/hooks.json` or `.agents/hooks.json`).

3. Verify hook paths in `hooks.json` to ensure they reference your absolute installation directory:
   ```json
   {
     "precision-slicing-guard": {
       "enabled": true,
       "PreToolUse": [
         {
           "matcher": "view_file",
           "hooks": [
             {
               "type": "command",
               "command": "node /path/to/harness-engineering/hooks/pre-view-file.cjs",
               "timeout": 5
             }
           ]
         }
       ]
     }
   }
   ```

---

## Academic References

The architectural model draws from principles established in recent AI systems literature:

- **MemGPT: Towards LLMs as Operating Systems** (Packer et al., UC Berkeley, 2023): Context management through active paging and external memory tiering.
- **Lost in the Middle: How Language Models Use Long Contexts** (Liu et al., Stanford / UC Berkeley, 2023): Mitigating attention degradation in extended context windows.
- **Reflexion: Language Agents with Verbal Reinforcement Learning** (Shinn et al., Princeton / MIT, 2023): Preventing catastrophic error cascades in iterative execution.

---

## License

Distributed under the MIT License. See `LICENSE` for details.
