---
name: ponytail-debt
description: Harvest ponytail inline comment markers into a tracked technical debt ledger. Use when asked to audit ponytail debt markers, check shortcut ceilings, or generate a debt ledger report.
---

# Skill: `ponytail-debt` (Technical Debt Ledger Harvester)

> **Focus**: Harvest all inline `ponytail:` comment markers across the repository into a single tracked ledger to prevent engineering shortcuts from rotting.

---

## GOAL & CONSTRAINTS

### Core Goals
- Grep the repository tree for `# ponytail:` and `// ponytail:` comment markers.
- Group findings by file: `<file>:<line> — <what was simplified>. ceiling: <limit>. upgrade: <trigger>`.
- Flag markers that lack explicit upgrade triggers as `no-trigger`.
- End with a summary count of markers and un-triggered shortcuts.

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Code Modifications**: Do NOT modify code or remove comments during debt harvesting.
- **No Scanning Output Directories**: Skip `node_modules`, `.git`, `dist`, and build output directories during search.
- **No Silent Rottings**: Never ignore markers lacking an upgrade trigger; explicitly tag them as `no-trigger`.
