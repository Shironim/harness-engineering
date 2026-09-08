---
name: ponytail-review
description: Review current git diff / pending code changes strictly for over-engineering and removable complexity. Use when asked to review diffs for over-engineering or cut unnecessary lines before committing.
---

# Skill: `ponytail-review` (Diff Over-Engineering Reviewer)

> **Focus**: Review current pending changes (git diff) strictly for over-engineering, dead code, and unnecessary abstractions. Focus on line reduction, not correctness.

---

## GOAL & CONSTRAINTS

### Core Goals
- Review current code changes and output one line per finding: `L<line>: <tag> <what to cut>. <replacement>.`
- Tags: `delete`, `stdlib`, `native`, `yagni`, `shrink`.
- End review with summary of net removable lines. If lean, output `'Lean already. Ship.'`.

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Correctness Auditing**: Do NOT report syntax style or logic correctness issues. Review ONLY for over-engineering and bloat.
- **No File Edits**: Do NOT auto-delete lines during review. Report findings for developer review.
