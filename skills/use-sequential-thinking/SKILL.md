---
name: use-sequential-thinking
description: Dynamic iterative reasoning engine for breaking down complex problems, architectural decisions, and multi-hypothesis debugging. Use when asked to solve multi-step architectural problems or execute sequential reasoning via sequentialthinking MCP tool.
---

# `use-sequential-thinking` — Dynamic Iterative Reasoning Engine

> **Rationale**: Permasalahan arsitektur yang kompleks, refactoring multi-step, atau debugging terisolasi tidak bisa diselesaikan dengan tebakan sekali jalan. Sequential thinking memungkinkan pembentukan hipotesis bertahap, revisi pemikiran saat bukti baru ditemukan, dan percabangan analisis (*branching*).

---

## GOAL & CONSTRAINTS

### Core Goals
- Execute dynamic multi-step problem solving using the `sequentialthinking` MCP tool.
- Adjust total thought estimates (`totalThoughts`) upward or downward as problem complexity unfolds.
- Re-evaluate hypotheses explicitly before arriving at a final action plan (`nextThoughtNeeded: false`).

---

## MCP TOOL PARAMETER SPECIFICATIONS & PAYLOAD EXAMPLE

### Parameter Guardrails

| Argument | Type | Requirement | Description & Rules |
|---|---|---|---|
| `thought` | `string` | **REQUIRED** | Current reasoning thought text. |
| `thoughtNumber` | `integer` | **REQUIRED** | 1-indexed current thought step number. |
| `totalThoughts` | `integer` | **REQUIRED** | Estimated total thoughts (adjustable dynamically). |
| `nextThoughtNeeded` | `boolean` | **REQUIRED** | Set `true` if further steps/hypotheses are needed. Set `false` ONLY when the final verified conclusion is reached. **STRICTLY REQUIRED** by Zod schema (cannot be omitted or undefined). |
| `isRevision` | `boolean` | Optional | Set `true` if revising an earlier thought step. |
| `revisesThought` | `integer` | Optional | The specific `thoughtNumber` being revised. |
| `branchFromThought` | `integer` | Optional | Target `thoughtNumber` serving as the branching point. |
| `branchId` | `string` | Optional | Unique identifier string for the reasoning branch. |

### Payload Example
```json
{
  "ServerName": "sequential-thinking",
  "ToolName": "sequentialthinking",
  "Arguments": {
    "thought": "Analyzing database schema migration impact from 1-to-many to many-to-many relationship",
    "thoughtNumber": 1,
    "totalThoughts": 3,
    "nextThoughtNeeded": true
  }
}
```

---

## 4. SKILL COMPOSITION PIPELINE & MULTI-TOOL COLLABORATION

### Inter-Tool Flow
`sequentialthinking` (Hypothesis Generation) ──(Structural Verification)──> `codegraph` ──(Empirical Testing di Sandbox)──> `use-context-mode` ──(Persist Verified Conclusion)──> `use-basic-memory`

### Multi-Tool Collaboration Recipes

1. **Empirical Hypothesis Testing Cycle**:
   - **Step 1 (Thought 1)**: Formulasikan hipotesis penyebab bug/masalah arsitektur.
   - **Step 2 (Verification)**: Jalankan `codegraph_explore` atau `ctx_execute` untuk menguji hipotesis secara empiris.
   - **Step 3 (Thought 2 - Revision)**: Revisi hipotesis berdasarkan bukti nyata dari sandbox/codegraph (`isRevision: true`).
   - **Step 4 (Final Thought)**: Kunci kesimpulan akhir (`nextThoughtNeeded: false`).

2. **ADR Persistence**:
   Setiap kali pemikiran bertahap mencapai kesimpulan arsitektur penting, simpan ke `basic-memory` (`write_note`) sebagai keputusan permanen proyek.

---

## 5. DON'T DO / ANTI-PATTERNS (Negative Cases)

- **Never Omit nextThoughtNeeded**: In `@modelcontextprotocol/server-sequential-thinking`, `nextThoughtNeeded` is STRICTLY REQUIRED by Zod schema. Omitting it causes `MCP error -32602: Invalid input at nextThoughtNeeded`. ALWAYS pass `nextThoughtNeeded: true` (or `false` when finished).
- **No Premature Termination**: Do NOT set `nextThoughtNeeded: false` while unverified assumptions remain.
- **No Rigid Thought Total**: Do NOT force analysis to fit initial `totalThoughts` estimate if complexity increases.
- **No Skipping Verification Step**: Never jump directly from initial hypothesis to final conclusion without a dedicated verification thought step.

