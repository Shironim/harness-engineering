---
name: ponytail
description: Switch ponytail intensity mode (lite, full, ultra, off). Use when asked to switch ponytail engineering mode, enforce YAGNI principles, or apply minimal lazy-senior-dev coding.
---

# Skill: `ponytail` (Minimalist Engineering Mode)

> **Rationale**: Lazy senior developer mindset. Software maintenance cost is proportional to the lines of code written. Before writing code, ask: *Does it need to exist at all (YAGNI)? Does the standard library do it? Can it be one line? Build the minimum that works.*

---

## GOAL & CONSTRAINTS

### Core Goals
- Eliminate unnecessary boilerplate, unrequested abstractions, and third-party dependencies.
- Build the absolute minimum working code that satisfies the requirement.
- Mark deliberate simplifications using inline `ponytail:` comments specifying the known ceiling and upgrade path.

---

## INTENSITY LEVELS & LADDER

### Intensity Modes
- **lite**: Build what is asked, but note the lazier alternative in a one-line comment.
- **full** (Default): YAGNI $\rightarrow$ stdlib $\rightarrow$ native platform features $\rightarrow$ minimum code.
- **ultra**: Challenge requirements and enforce deletion before addition.
- **off**: Deactivate ponytail mode.

### Ponytail Sub-Command Suite
- `/ponytail-review`: Review current git diff for over-engineering and removable lines.
- `/ponytail-audit`: Scan whole repository tree for dead code and unnecessary abstractions.
- `/ponytail-debt`: Harvest inline `ponytail:` comment markers into a tracked ledger.
- `/ponytail-gain`: Display published benchmark impact scoreboard (less code, cost, time).
- `/ponytail-help`: Display ponytail reference card.

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Speculative Abstractions**: Do NOT create interfaces, factories, or abstract classes for components with only one implementation.
- **No Unnecessary Dependencies**: Do NOT install npm/pip packages for tasks solvable via standard library or native platform features.
- **No Boilerplate Wrapping**: Do NOT wrap clean native functions in custom helper classes unless requested.
- **No Unlabeled Debt**: Do NOT skip `ponytail:` comments when taking a deliberate engineering shortcut.
