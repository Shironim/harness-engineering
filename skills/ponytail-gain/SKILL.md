---
name: ponytail-gain
description: Display the published benchmark impact scoreboard showing measured reductions in code lines, costs, and execution time. Use when asked to view ponytail benchmark gains or efficiency statistics.
---

# Skill: `ponytail-gain` (Measured Impact Scoreboard)

> **Focus**: Display published benchmark medians comparing standard LLM code generation vs ponytail minimal engineering.

---

## GOAL & CONSTRAINTS

### Core Goals
- Render published benchmark medians as plain ASCII progress bars:
  - **Lines of Code**: 80-94% reduction.
  - **Cost**: 47-77% reduction.
  - **Speed**: 3-6x faster execution.
- Direct users to `/ponytail-debt` and `/ponytail-audit` for live per-repository statistics.

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Fake Repo Numbers**: NEVER calculate or print a fake per-repository savings number for live code (the unbuilt baseline was never written).
- **No State Modifications**: Do NOT switch modes or persist flag files. Report benchmark data only.
