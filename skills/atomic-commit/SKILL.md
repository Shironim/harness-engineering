---
name: atomic-commit
description: Workflow for creating small, self-contained atomic git commits by staging changes logically. Use when staging git commits, writing Conventional Commit messages, or organizing atomic git changes.
---

# Atomic Commit Mindset

> **Rationale**: Memperlakukan setiap commit sebagai **satu unit riwayat perubahan yang independen, fokus, dan aman di-revert**. Jika sebuah commit di-`git revert`, sistem harus tetap berjalan dan fitur lain tidak boleh ikut rusak. Riwayat commit yang bersih menjadi dokumentasi tim yang memudahkan *code review* dan *git bisect*.

---

## GOAL & CONSTRAINTS

### Core Goals
- Enforce "One Commit, One Intent" (each commit answers one clear question: *"What does this change do?"*).
- Stage files intentionally (`git add <file1> <file2>`) instead of running blanket `git add .`.
- Format commit messages using Conventional Commits (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`).

---

## CORE MINDSET & REVERSIBILITY PROTOCOL

1. **One Commit, One Intent**: 1 fix, 1 feature, or 1 refactor per commit. Never combine unrelated goals into a single commit.
2. **Reversibility is Safety**: If revoking a commit breaks an unrelated feature, the commit is **not atomic**.
3. **Intentional Staging**: Always inspect `git status` and `git diff` before staging specific files explicitly.
4. **Conventional Commits Standard**:
   - `feat(scope): add new capability`
   - `fix(scope): resolve bug behavior`
   - `refactor(scope): restructure code without changing behavior`
   - `test(scope): add unit or E2E assertions`

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Blanket Staging (`git add .`)**: NEVER run `git add .` or `git add -A` blindly without verifying modified file groups.
- **No Generic Vague Commit Messages**: Do NOT write non-descriptive messages like `"update code"`, `"fix bug"`, or `"wip"`.
- **No Broken Build Commits**: Never commit failing tests or half-written broken code into git history.
- **No Mixed Concerns in Single Commit**: Do NOT mix refactoring, feature additions, and unrelated bug fixes into one commit.
