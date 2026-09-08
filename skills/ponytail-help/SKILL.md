---
name: ponytail-help
description: Display quick reference guide for ponytail intensity levels, sub-skills, and command flags. Use when asked for ponytail help, command cheat-sheets, or intensity mode options.
---

# ℹ Skill: `ponytail-help` (Quick Reference & Cheat-Sheet)

> **Focus**: Display a quick reference card covering ponytail modes, commands, resolution hierarchy, and deactivation flags.

---

## GOAL & CONSTRAINTS

### Core Goals
- Display ponytail intensity modes: `lite`, `full` (default), `ultra`, `off`.
- List ponytail sub-command suite: `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help`.
- Explain configuration resolution order: Environment Variable (`PONYTAIL_DEFAULT_MODE`) -> Config File (`~/.config/ponytail/config.json`) -> Default (`full`).

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No State Modifications**: Do NOT switch modes or persist configuration flags when invoking help. Report cheat-sheet only.
