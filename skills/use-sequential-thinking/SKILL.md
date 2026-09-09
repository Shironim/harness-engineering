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

> [!CAUTION]
> **FATAL SCHEMA RULE**: Argumen `nextThoughtNeeded: boolean` bersifat **MANDATORI MUTLAK** dalam skema Zod `@modelcontextprotocol/server-sequential-thinking`. Jika dihilangkan atau bernilai `undefined`, pemanggilan tool akan **LANGSUNG GAGAL** dengan `MCP error -32602: Invalid input at nextThoughtNeeded`.
> - Gunakan `nextThoughtNeeded: true` untuk **seluruh** langkah penalaran, analisis, dan perumusan hipotesis berjalan.
> - Gunakan `nextThoughtNeeded: false` **HANYA** pada thought terakhir ketika kesimpulan arsitektur final telah terbukti dan terverifikasi.

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

2. **Optimasi Sinergi Sequential Thinking dengan `context-mode` (Batch-First Pre-Design):**
   - **Perencanaan di Thought**: Sebelum memanggil `ctx_execute`, `sequentialthinking` WAJIB merumuskan arsitektur script batch secara menyeluruh:
     - Daftar seluruh file target yang dibaca bersamaan (`fs.readFileSync` simultan).
     - Logika filter & reduksi data di dalam sandbox (regex, slice, aggregasi).
     - Format return summary JSON/tabel padat ($\le 30$ baris / $< 2$ KB) agar tidak terpotong ke disk (`.system_generated/.../output.txt`).
   - **Anti-Chaining Awareness**: Hook `pre-search-quota.cjs` membatasi pemanggilan `context-mode` maksimal 1–2 kali per turn (`[CONTEXT-MODE ANTI-CHAINING GUARD]`). Kegagalan merancang batch script akan memicu penolakan dini.

3. **ADR Persistence**:
   Setiap kali pemikiran bertahap mencapai kesimpulan arsitektur penting, simpan ke `basic-memory` (`write_note`) sebagai keputusan permanen proyek.

---

## 5. DON'T DO / ANTI-PATTERNS (Negative Cases)

- **Never Omit nextThoughtNeeded**: In `@modelcontextprotocol/server-sequential-thinking`, `nextThoughtNeeded` is STRICTLY REQUIRED by Zod schema. Omitting it causes `MCP error -32602: Invalid input at nextThoughtNeeded`. ALWAYS pass `nextThoughtNeeded: true` (or `false` when finished).
- **No Chained Context-Mode Looping**: DILARANG KERAS memanggil `ctx_execute` berkali-kali secara berurutan untuk membaca file satu per satu atau mengejar file output disk. Formulasikan 1 script batch komprehensif di dalam thought sebelum memanggil tool.
- **No Raw Byte Dumping in Sandbox**: Jangan pernah membiarkan script sandbox mencetak isi file mentah tanpa filter ke `console.log`.
- **No Premature Termination**: Do NOT set `nextThoughtNeeded: false` while unverified assumptions remain.
- **No Rigid Thought Total**: Do NOT force analysis to fit initial `totalThoughts` estimate if complexity increases.
- **No Skipping Verification Step**: Never jump directly from initial hypothesis to final conclusion without a dedicated verification thought step.

