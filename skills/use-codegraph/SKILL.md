---
name: use-codegraph
description: Guidelines and exact MCP tool parameters for codegraph (codegraph_explore) to navigate symbol dependencies and code relations. Use when exploring symbol call graphs, mapping dependency relations, or using codegraph_explore.
version: 2.0.0
---

# `use-codegraph` — Symbol Dependency & Call Path Exploration Engine v2.0

> **Rationale**: Memahami alur fungsi lintas file, arsitektur modul, dan relasi simbol (*blast radius*) secara langsung menghemat puluhan *round-trip* `grep` + `view_file` berulang dengan 1 pemanggilan yang mengembalikan definisi simbol beserta relasi pemangilannya.

---

## 1. GOAL & CONSTRAINTS

### Core Goals
- Explore symbol dependency graphs and call hierarchies using `codegraph_explore`.
- Map incoming and outgoing call relations before performing major code refactoring.
- Require `.codegraph/` index presence before executing codegraph tool calls.

---

## 2. MCP TOOL PARAMETER GUARDRAILS & PAYLOAD SPECIFICATIONS

> [!CAUTION]
> **PRE-FLIGHT INDEX GATE (ATURAN HEMAT KUOTA INVESTIGASI)**:
> Sebelum memanggil `codegraph_explore`, agen WAJIB memastikan repositori memiliki direktori `.codegraph/`.
> - **Jika `.codegraph/` TIDAK ADA**: DILARANG KERAS memanggil `codegraph_explore` karena 100% pasti error (`No CodeGraph project is loaded for this session`) dan akan membuang 1 jatah kuota investigasi (dari kuota awal 2–3 call). Langsung lakukan fallback ke AST parser (`strata-mcp`), FTS sandbox (`ctx_search`), atau targeted `grep_search`.
> - **Parameter Tunggal `query`**: Tool ini **HANYA** menerima `query: string`. Dilarang mengoper argumen tak dikenal seperti `file_path`, `symbol`, atau `target`.

### `codegraph_explore` Parameter Requirements

| Argument | Type | Requirement | Description & Rules |
|---|---|---|---|
| `projectPath` | `string` | **REQUIRED** | Absolute path ke direktori project yang di-query (harus memiliki indeks `.codegraph/`). |
| `query` | `string` | **REQUIRED** | Nama simbol, nama file, atau query (contoh: `"AuthService loginUser"`, `"mutateElement"`). |
| `maxFiles` | `number` | Optional | Batas jumlah file source yang disertakan (default: `12`). |

### Standard MCP Tool Call Payload Example
```json
{
  "ServerName": "codegraph",
  "ToolName": "codegraph_explore",
  "Arguments": {
    "projectPath": "/home/shironim/Project/my-app",
    "query": "UserService authenticate",
    "maxFiles": 12
  }
}
```

---

## 3. ERROR RECOVERY & FALLBACK PLAYBOOK (Fail-Visible Mitigation)

| Error Trigger / Failure State | Root Cause | Immediate Fallback Action | Anti-Retry Rule |
|---|---|---|---|
| `No .codegraph/ index directory` | Repositori belum di-index oleh codegraph | Fallback LANGSUNG ke native `rg` atau `grep_search`. Dilarang mengulangi `codegraph_explore`. | DILARANG retry `codegraph_explore` jika `.codegraph/` tidak ada. |
| `Stale index / Newly created file missing` | Codebase dimodifikasi tapi belum di-update | Jalankan `codegraph update` via `run_command` atau fallback ke `grep_search`. | DILARANG berasumsi file tidak ada hanya karena tidak muncul di graf usang. |
| `Sandbox execSync failure in ctx_execute` | Buffer overflow (>10MB) atau CLI error | Jalankan per sub-batch (3-5 target) atau fallback ke pemanggilan MCP tool `codegraph_explore` individual. | DILARANG memanggil `execSync` dengan batch terlalu besar tanpa chunking. |
| `SQLite WAL lock / Database is locked` | Akses SQLite bersamaan dari subagent lain | 1. Tunggu 500ms.<br>2. Retry max 1x.<br>3. Jika tetap locked, fallback langsung ke `rg` atau `grep_search`. | DILARANG retry terus-menerus tanpa backoff 500ms. |
| `Symbol / query not found in graph` | Simbol baru belum ter-index atau typo nama simbol | 1. Coba query nama file atau simbol parsial.<br>2. Jika tidak ada hasil, fallback ke `grep_search` atau `rg`. | DILARANG mengulang query persis yang sama. |
| `Missing required argument: projectPath` | Path repositori tidak disertakan | Tambahkan `projectPath` absolute path ke repositori. | DILARANG memanggil `codegraph_explore` tanpa `projectPath`. |

---

## 4. SKILL COMPOSITION PIPELINE & INTER-TOOL RECIPES

### Inter-Tool Flow
`codegraph_explore` ──(Pass Symbol/Call Path)──> `ctx_execute` (use-context-mode) ──(Multi-Step Reasoning)──> `sequentialthinking` ──(Persist Architecture Fact)──> `write_note` (basic-memory)

* **Incoming Interface**: Menerima request eksplorasi relasi kode/simbol dari Orchestrator atau Subagent.
* **Outgoing Interface**: Mengalirkan path berkas & relasi pemanggilan ke `use-context-mode` (`ctx_execute_file` / `ctx_execute`) untuk analisis tanpa membaca ulang file via `view_file`.

### Multi-Tool Collaboration Recipes

1. **Sandbox Filtering for Large Call Graphs (`codegraph` + `use-context-mode`)**:
   Jalankan CLI `codegraph` di sandbox `ctx_execute` untuk memfilter output graf raksasa via grep/awk sebelum masuk ke konteks (>98% token savings):
   ```javascript
   ctx_execute({
     language: "shell",
     code: `codegraph explore "PaymentService" | grep -E "(Blast radius|callers|tests)" | head -n 30`
   })
   ```

2. **Smart Selective Test Runner Generator (`codegraph` + `use-context-mode`)**:
   Hasilkan test command hanya untuk unit/feature test yang meng-cover file yang disentuh:
   ```javascript
   const symbols = ["Product", "Laptop"];
   const tests = new Set();
   symbols.forEach(s => {
     const raw = execSync(`codegraph explore "${s}"`, { encoding: "utf-8" });
     (raw.match(/`tests\/[^`]+`/g) || []).forEach(t => tests.add(t.replace(/`/g, "")));
   });
   console.log(`./vendor/bin/sail test ${Array.from(tests).join(" ")}`);
   ```

3. **Architectural Boundary & Layering Linter (`codegraph` + `use-context-mode`)**:
   Scan *caller list* di sandbox untuk mendeteksi pemanggilan Blade view yang melanggar arsitektur bersih:
   ```javascript
   const raw = execSync('codegraph explore "ProductService"', { encoding: "utf-8" });
   const violations = raw.split("\n").filter(l => l.includes("resources/views"));
   console.log(violations.length === 0 ? " Boundary OK" : " Layer Violations:", violations);
   ```

4. **Circular Dependency & DFS Cycle Detector (`codegraph` + `use-context-mode`)**:
   Susun adjacency graph relasi antar-service dan telusuri siklus tertutup (A  B  C  A) menggunakan DFS di sandbox Bun.

5. **Database Transaction & Concurrency Auditor (`codegraph` + `use-context-mode`)**:
   Lacak seluruh caller dari method mutasi data finansial/stok untuk memverifikasi proteksi blok `DB::transaction()`.

6. **Multi-Symbol Matrix & Risk Gap Analysis (`codegraph` + `use-context-mode`)**:
   Scan banyak class/controller sekaligus di sandbox Bun untuk mendeteksi simbol berisiko tinggi tanpa unit test (` no covering tests found`).

7. **Git Diff PR Blast Radius Inspection (`codegraph` + `use-context-mode`)**:
   Ekstrak file yang berubah dari `git diff --name-only` di sandbox lalu petakan dampaknya secara otomatis sebelum merge atau commit:
   ```javascript
   const changed = execSync("git diff --name-only main...HEAD", { encoding: "utf-8" }).trim().split("\n");
   const report = changed.map(f => {
     const sym = f.split("/").pop().replace(".php", "");
     const raw = execSync(`codegraph explore "${sym}"`, { encoding: "utf-8" });
     return { file: f, impact: raw.match(/\*\*Blast radius[^\n]*\*\*([\s\S]*?)(?=\*\*Source Code\*\*|$)/)?.[1] || "No blast" };
   });
   console.log(report);
   ```

8. **Refactoring Impact Reasoning (`codegraph` + `use-sequential-thinking`)**:
   Gunakan CodeGraph untuk mendeteksi blast radius (caller list), lalu evaluasi hipotesis efek domino refactoring langkah demi langkah menggunakan `sequentialthinking`.

9. **Persistent Architectural Note (`codegraph` + `use-basic-memory`)**:
   Catat peta relasi modul penting hasil eksplorasi CodeGraph ke memory vault:
   ```yaml
   write_note:
     title: "Code Map: Order & Payment Flow"
     directory: "architecture"
     content: "... graph relation observations ..."
   ```

---

## 5. CONTEXT BUDGET & TRUNCATION LIMITS

- **Symbol Relevance Budget**: Batasi `maxFiles` default maksimal **12 file** untuk mencegah pembengkakan context window.
- **No Redundant Reading**: DILARANG memanggil `view_file` pada berkas/simbol yang sudah dikembalikan secara lengkap oleh `codegraph_explore`.

---

## 6. DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Omitted `projectPath`**: NEVER omit `projectPath`. Tool call without `projectPath` will fail.
- **No Execution Without Index**: Do NOT attempt `codegraph_explore` if the repository lacks a `.codegraph/` index directory. Fallback immediately to `rg` or `grep_search`.
- **No Repetitive Read Tool Calls**: Do NOT call `view_file` on symbols already returned in full source format by `codegraph_explore`.
