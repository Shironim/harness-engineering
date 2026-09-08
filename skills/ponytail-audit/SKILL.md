---
name: ponytail-audit
description: Audit the entire repository tree for over-engineering and dead code. Use when asked to audit codebase complexity, find removable dependencies/dead code, or run repo-wide ponytail audits.
---

# Skill: `ponytail-audit` (Repository Complexity Auditor)

> **Focus**: Scan the entire repository tree strictly for over-engineering, dead code, and unnecessary abstractions. Focus on code removal, not correctness.

---

## GOAL & CONSTRAINTS

### Core Goals
- Scan the entire codebase tree (not diffs) to identify bloat and over-engineering.
- Output ranked findings formatted as one line per item: `<tag> <what to cut>. <replacement>. [path]`.
- Summarize net lines of code and dependencies that can be safely removed.

### Audit Tags
- `delete`: Dead code or speculative features.
- `stdlib`: Code reinventing standard library functionality.
- `native`: Third-party dependencies doing what the platform already provides.
- `yagni`: Premature abstractions with only one implementation.
- `shrink`: Over-complicated logic that can be written in fewer lines.

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Correctness Nitpicking**: Do NOT report code style, formatting, or lint warnings. Audit ONLY over-engineering and removable complexity.
- **No File Mutations**: Do NOT edit or delete files during audit. Report findings only.
- **No Diff-Only Scanning**: Do NOT restrict audit to git diffs; scan the whole tree.
