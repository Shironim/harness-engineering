---
name: use-context-mode
description: Mandatory routing rules and precise MCP tool specs for context-mode (ctx_execute, ctx_execute_file, ctx_batch_execute, ctx_index, ctx_fetch_and_index, ctx_search, ctx_stats, ctx_purge, ctx_doctor). Use when asked to process large datasets, run sandbox code via ctx_execute, index/search files, or optimize conversation token memory.
version: 2.1.0
---

# `use-context-mode` — Sandbox Execution & Data Derivation Engine v2.1

> **Rationale ("Think-in-Code")**: Byte data berukuran besar (log, JSON response, scan direktori, docs HTML/markdown) yang diproses kode di sandbox **TIDAK BOLEH** masuk ke memori percakapan LLM. Hanya hasil `console.log()` / `print()`, rangkuman data, atau FTS5 smart snippets yang masuk ke konteks.

---

## 1. GOAL & CONSTRAINTS

### Core Goals
- Process massive files and directory scans inside a Bun/Python sandbox without flooding context memory.
- Leverage Bun native I/O optimization (`Bun.file()`) for 3–5x faster JS/TS execution on massive local files.
- Fetch and index web documentation using TTL caching and RRF BM25 FTS5 (`ctx_fetch_and_index` & `ctx_search`).
- Execute multi-command batches in a single round-trip using `ctx_batch_execute`.
- Maintain intent-driven indexing when output exceeds 5KB, triggering vocabulary suggestions for follow-up queries.
- Audit token savings and session efficiency via `ctx_stats`.

---

## 2. MCP TOOL PARAMETER GUARDRAILS & PAYLOAD SPECIFICATIONS

### Core Tools Parameter Specifications

| Tool Name | Required Arguments | Optional Arguments | Notes & Rules |
|---|---|---|---|
| `ctx_execute` | `language`, `code` (**STRICTLY REQUIRED**) | `intent`, `background`, `cwd`, `timeout` | Language enum: `"javascript"`, `"typescript"`, `"python"`, `"shell"`, `"go"`, `"rust"`. **NEVER pass `command`** (this is not a shell runner). Prefer Bun native `Bun.file()` for file reads. |
| `ctx_execute_file` | `path`, `language`, `code` (**STRICTLY REQUIRED**) | `intent`, `timeout` | Loads file into sandbox variable `FILE_CONTENT` without reading raw bytes into LLM memory. |
| `ctx_batch_execute` | `commands`, `queries` (**REQUIRED**) | `concurrency` (1-8), `query_scope` | `commands`: array of `{label, command}`. `queries`: array of search terms (**REQUIRED**). |
| `ctx_index` | `source`, (`content` OR `path`) | `include`, `exclude`, `maxDepth` | Indexes file/directory recursively into BM25 FTS5 database. |
| `ctx_fetch_and_index` | `requests` (array) OR `url` | `ttl` (ms), `force`, `contentType` ("code"\|"prose"), `concurrency` (1-8) | Fetches, converts HTML to Markdown, and indexes into FTS5. Reuses cached index within TTL window (default 24h). |
| `ctx_search` | `queries` (**REQUIRED**) | `contentType`, `limit` | Searches indexed FTS5 knowledge base using RRF & Porter Stemming. `queries` is an array of strings. |
| `ctx_stats` | None | None | Returns per-tool context savings, token metrics, and cache efficiency. Use for session auditing. |
| `ctx_purge` | `confirm: true` (**REQUIRED**) | `scope`, `sessionId` | Permanently deletes indexed session/project database. `confirm: true` is strictly required. |

### ⚠️ Strict Sandbox Runtime Constraints (CRITICAL)

#### 1. Anti-Bypass & Anti-Micro-Scripting Guardrail (Paling Kritis)
- ❌ **DILARANG KERAS (Bypass Quota Abuse)**: Menggunakan `ctx_execute` berulang kali hanya untuk membaca file baris-per-baris (`fs.readFileSync().slice()`) demi mengakali quota `view_file`. Jika kuota pembacaan file habis atau diblokir hook, agen **WAJIB HALT & ASK** ke user, bukan berselancar lewat sandbox!
- ❌ **DILARANG SERIAL SCRIPT LOOPING**: Dilarang memanggil `ctx_execute` berturut-turut untuk memeriksa file satu per satu. Hook global menerapkan `[CONTEXT-MODE ANTI-CHAINING GUARD]` dengan batas maksimal 1–2 pemanggilan per turn.
- ✅ **WAJIB PRE-DESIGN DI SEQUENTIAL-THINKING**: Sebelum memanggil `ctx_execute`, agen WAJIB merumuskan rencana script batch di dalam `sequentialthinking` (memetakan seluruh target file, logika komparasi/filter, dan memastikan skema output padat $\le 30$ baris / $< 2$ KB).
- ✅ **WAJIB BATCH-FIRST**: Jika perlu memeriksa atau membandingkan struktur antar-file ($\ge 2$ file), tulis **1 skrip agregasi tunggal** yang membaca seluruh target sekaligus dan kembalikan tabel/JSON ringkas (< 30 baris).

#### 2. Prohibition on Top-Level Static ESM Imports (`import ... from ...`)
Engine `context-mode` secara otomatis membungkus (*wrap*) kode JavaScript dan TypeScript ke dalam fungsi asinkron pelacak I/O/network:
```javascript
;(function(__cm_req){
  ...
  async function __cm_main(){
    // <--- KODE ANDA DISISIPKAN DI DALAM BODY FUNCTION INI!
  }
  __cm_main().catch(...);
})(...);
```
Dalam sintaks JavaScript & TypeScript (Node/Bun), deklarasi statis `import ... from ...` **HANYA VALID di level root modul**, dan **ILEGAL di dalam body function**.
- ❌ **DILARANG (Akan memicu `error: Unexpected <module>` pada baris 56+)**:
  ```typescript
  import fs from "fs";
  import path from "path";
  ```
- ✅ **WAJIB (Gunakan CommonJS require, dynamic import, atau Bun native)**:
  ```javascript
  const fs = require("node:fs");
  const path = require("node:path");
  // atau dynamic import:
  const fs = await import("node:fs");
  // atau Bun native API:
  const content = await Bun.file("path/to/file").text();
  ```

#### 3. Jebakan Resolusi Modul Proyek (`process.cwd()` vs `__dirname` di `/tmp/`)
Skrip `ctx_execute` disimpan dan dijalankan di direktori sementara (`/tmp/.ctx-mode-XXXX/script.ts`).
- Fungsi I/O bawaan seperti `fs.readFileSync('src/core/types.ts')` **berhasil** karena berbasis `process.cwd()`.
- Namun `require('./src/core/...')` **PASTI GAGAL** (`Cannot find module from /tmp/...`) karena `require()` menggunakan resolusi direktori relatif terhadap `/tmp/`!
- ✅ **WAJIB gunakan `path.resolve(process.cwd(), ...)` saat mengimpor modul proyek**:
  ```javascript
  const path = require('node:path');
  const rootDir = process.cwd();
  // Import modul codebase dengan path absolut aman:
  const { FingerprintNormalizer } = require(path.resolve(rootDir, 'src/core/fingerprint/normalizer'));
  ```

#### 4. Dilarang Menukar Parameter `code` dengan `command`
`ctx_execute` adalah engine sandbox polyglot, **bukan** terminal command runner:
- ❌ **SALAH**: `{"Arguments": {"command": "bun -e '...'"}}`
- ✅ **BENAR**: `{"Arguments": {"language": "javascript", "code": "const fs = require('node:fs'); ..."}}`

### Valid Payload Examples

#### `ctx_execute_file` Payload Example
```json
{
  "ServerName": "context-mode",
  "ToolName": "ctx_execute_file",
  "Arguments": {
    "path": "/var/log/app.log",
    "language": "javascript",
    "code": "const errors = FILE_CONTENT.split('\\n').filter(l => l.includes('ERROR')); console.log('Total errors:', errors.length);"
  }
}
```

#### `ctx_fetch_and_index` Payload Example
```json
{
  "ServerName": "context-mode",
  "ToolName": "ctx_fetch_and_index",
  "Arguments": {
    "requests": [
      { "url": "https://docs.example.com/api-ref", "source": "api-docs" }
    ],
    "ttl": 86400000,
    "contentType": "code"
  }
}
```

#### `ctx_batch_execute` Payload Example
```json
{
  "ServerName": "context-mode",
  "ToolName": "ctx_batch_execute",
  "Arguments": {
    "commands": [
      {"label": "git-status", "command": "git status -s"},
      {"label": "git-log", "command": "git log -n 5 --oneline"}
    ],
    "queries": ["modified", "commit"],
    "concurrency": 2
  }
}
```

---

## 3. ERROR RECOVERY & FALLBACK PLAYBOOK (Fail-Visible Mitigation)

| Error Trigger / Failure State | Root Cause | Immediate Fallback Action | Anti-Retry Rule |
|---|---|---|---|
| `Sandbox execution timeout / Process crash` | Script execution exceeded default timeout or Bun/Python runtime crashed | Fallback ke `run_command` dengan membelokkan stdout ke log file sementara: `command > /tmp/out.log 2>&1`, lalu baca rangkuman 40 baris via `head -n 40` atau `grep`. | DILARANG mengulang `ctx_execute` dengan kode dan timeout yang persis sama. |
| `codegraph CLI failure / not found inside sandbox` | Binary `codegraph` tidak ditemukan di PATH atau crashing | Fallback langsung ke pemanggilan MCP tool `codegraph_explore` individual atau gunakan native `grep_search`. | DILARANG loop retry `execSync("codegraph ...")` jika binary gagal. |
| `Stale index / Symbol not found in codegraph` | Codebase baru dimodifikasi dan belum ter-index | Jalankan `codegraph update` via `run_command` atau fallback ke `grep_search`. | DILARANG berasumsi file tidak ada hanya karena tidak muncul di graf usang. |
| `SQLite FTS5 Query Syntax Error` di `ctx_search` | Karakter spesial regex/FTS5 tidak di-escape pada array `queries` | 1. Sederhanakan query string (hapus karakter non-alphanumeric).<br>2. Jika tetap error, fallback ke `rg` atau `grep_search`. | DILARANG mengulang query string FTS5 yang bermasalah. |
| `SQLite WAL lock / Database is locked` | Akses basis data bersamaan dari subagent lain | 1. Tunggu jeda 500ms.<br>2. Retry max 1x.<br>3. Jika masih terkunci, fallback langsung ke `run_command` atau `grep_search`. | DILARANG retry terus-menerus tanpa backoff 500ms. |
| `Missing required argument: queries` | `ctx_batch_execute` dipanggil tanpa array `queries` | Tambahkan array `queries: ["search_term"]` yang relevan ke dalam payload JSON. | DILARANG memanggil `ctx_batch_execute` tanpa parameter `queries`. |
| `SyntaxError: Unexpected <identifier> (e.g. Unexpected fs)` | Menggunakan statis ESM `import ... from ...` di dalam `ctx_execute` (terhalang wrapper function `__cm_main`) | Ganti statis import dengan `const fs = require("fs");` atau dynamic `await import(...)` atau `Bun.file()`. | DILARANG mengulang eksekusi dengan ESM `import` statis. |
| `Input validation error: Required "language" / "code"` | Mengirim parameter `command` alih-alih `language` & `code` | Format ulang payload menjadi `{"language": "javascript"|"python"|"shell", "code": "..."}`. | DILARANG mengirim parameter `command` ke `ctx_execute`. |


---

## 4. SKILL COMPOSITION PIPELINE & INTER-TOOL RECIPES

### Inter-Tool Flow
`codegraph` / `git log` / `web docs` ──(Batch / Sandbox / Indexing)──> `ctx_fetch_and_index` / `ctx_batch_execute` ──(Synthesized Metric / Smart Snippet)──> `sequentialthinking` ──(Persist Log Pattern)──> `write_note` (basic-memory)

* **Incoming Interface**: Menerima path berkas log/data besar dari `grep_search`, `run_command`, `codegraph`, atau URL dokumentasi eksternal.
* **Outgoing Interface**: Mengirimkan rangkuman data terkompresi (< 40 baris) ke `sequentialthinking` untuk analisis hipotesis atau ke `basic-memory` (`write_note`).

### Multi-Tool Collaboration Recipes

1. **Batch Blast Radius Matrix Parser (`ctx_execute` + `codegraph`)**:
   Eksekusi `codegraph explore` multi-simbol di dalam Bun/Node sandbox untuk mengekstrak hanya baris pemanggil & coverage, menghemat hingga >98% token:
   ```javascript
   const { execSync } = require("child_process");
   const targets = ["ProductController", "KeuanganController", "LaptopController"];
   const results = targets.map(t => {
     const raw = execSync(`codegraph explore "${t}"`, { encoding: "utf-8" });
     const match = raw.match(/\*\*Blast radius[^\n]*\*\*([\s\S]*?)(?=\*\*Source Code\*\*|$)/);
     return { target: t, blast: match ? match[1].trim().split("\n").slice(0, 3) : [] };
   });
   console.log(results);
   ```

2. **Smart Selective Test Runner Generator (`ctx_execute` + `codegraph`)**:
   Ekstrak test files penanggung jawab simbol yang disentuh secara presisi:
   ```javascript
   const { execSync } = require("child_process");
   const symbols = ["Product", "Laptop", "Keuangan"];
   const testFiles = new Set();
   symbols.forEach(s => {
     const raw = execSync(`codegraph explore "${s}"`, { encoding: "utf-8" });
     (raw.match(/`tests\/[^`]+`/g) || []).forEach(t => testFiles.add(t.replace(/`/g, "")));
   });
   console.log(`./vendor/bin/sail test ${Array.from(testFiles).join(" ")}`);
   ```

3. **Architectural Boundary & Layering Linter (`ctx_execute` + `codegraph`)**:
   Validasi kepatuhan layer agar tidak ada bypass arsitektur:
   ```javascript
   const { execSync } = require("child_process");
   const services = ["KeuanganService", "LaptopService", "StokService", "ProductService"];
   services.forEach(s => {
     const raw = execSync(`codegraph explore "${s}"`, { encoding: "utf-8" });
     raw.split("\n").forEach(l => {
       if (l.includes("resources/views")) console.log(` Violation in [${s}]: direct Blade view caller -> ${l.trim()}`);
     });
   });
   ```

4. **Circular Dependency & Coupling Cycle Detector (`ctx_execute` + `codegraph`)**:
   Bangun adjacency graph dan telusuri siklus tertutup (A  B  C  A):
   ```javascript
   const { execSync } = require("child_process");
   const modules = ["StokService", "KeuanganService", "LaptopService"];
   const graph = {};
   modules.forEach(m => {
     const raw = execSync(`codegraph explore "${m}"`, { encoding: "utf-8" });
     graph[m] = modules.filter(other => other !== m && raw.includes(other));
   });
   console.log("Service Dependency Adjacency Graph:", graph);
   ```

5. **Database Transaction & Concurrency Auditor (`ctx_execute` + `codegraph`)**:
   Validasi pembungkus transaksi pada method mutasi data kritis:
   ```javascript
   const { execSync } = require("child_process");
   const raw = execSync('codegraph explore "StokService"', { encoding: "utf-8" });
   const callerFiles = (raw.match(/`app\/[^`]+`/g) || []).map(f => f.replace(/`/g, ""));
   console.log("Mutation callers to verify for DB::transaction:", callerFiles);
   ```

6. **Automated Risk & Uncovered Test Auditor (`ctx_execute` + `codegraph`)**:
   Scan simbol berketergantungan tinggi tanpa unit test:
   ```javascript
   const { execSync } = require("child_process");
   const targets = ["PricelistController", "KeuanganController", "StokController"];
   targets.forEach(t => {
     const raw = execSync(`codegraph explore "${t}"`, { encoding: "utf-8" });
     const uncovered = raw.split("\n").filter(l => l.includes(" no covering tests found") && l.includes("callers in"));
     if (uncovered.length > 0) console.log(` Untested [${t}]:\n  ${uncovered.join("\n  ")}`);
   });
   ```

7. **Service Centrality & Module Topography (`ctx_execute` + `codegraph`)**:
   Urutkan service berdasarkan coupling caller tertinggi:
   ```javascript
   const { execSync } = require("child_process");
   const services = execSync('find app/Services -name "*.php"', { encoding: "utf-8" }).trim().split("\n");
   const ranking = services.map(f => {
     const name = f.split("/").pop().replace(".php", "");
     const raw = execSync(`codegraph explore "${name}"`, { encoding: "utf-8" });
     const callers = (raw.match(/\d+\s+callers in/g) || []).reduce((acc, c) => acc + parseInt(c), 0);
     return { service: name, callers };
   }).sort((a, b) => b.callers - a.callers);
   console.log(ranking.slice(0, 5));
   ```

8. **Multi-Angle Batch Exploration (`ctx_batch_execute` + `codegraph`)**:
   ```json
   {
     "commands": [
       { "label": "Call Graph", "command": "codegraph explore 'UserRegistration'" },
       { "label": "Git Log", "command": "git log -n 5 --oneline app/Services/UserService.php" },
       { "label": "Log Errors", "command": "tail -n 50 storage/logs/laravel.log" }
     ],
     "queries": ["validation error handling", "transaction rollback"]
   }
   ```

9. **Web Docs Fetch & Search (`ctx_fetch_and_index` + `ctx_search`)**:
   - Ambil dokumentasi eksternal via `ctx_fetch_and_index` dengan `ttl: 86400000`.
   - Query poin yang dibutuhkan via `ctx_search` tanpa menuangkan seluruh isi web ke context window.

10. **Empirical Log Parsing for Debugging (`ctx_execute_file` + `use-sequential-thinking`)**:
    Gunakan script sandbox (dengan Bun `Bun.file()` jika JS) untuk memfilter log 50MB+ menjadi < 20 baris anomali data, lalu masukkan anomali tersebut sebagai bukti empiris ke dalam langkah `sequentialthinking`.

11. **End-of-Session Audit (`ctx_stats`)**:
    Panggil `ctx_stats` di akhir percakapan atau sesi kerja panjang untuk menyajikan ringkasan token yang berhasil dihemat kepada pengguna.

---

## 5. CONTEXT BUDGET & TRUNCATION LIMITS

- **Maximum Stdout Threshold**: Output `console.log()` / `print()` maksimal **40 baris** (atau < 5KB).
- **Auto-Indexing & Intent Enforcement**: Jika output skrip berpotensi > 5KB, **SELALU** berikan argumen `intent` (misal: `intent: "Mencari failure trace pada database migration"`). `context-mode` akan meng-index output ke FTS5, mengembalikan snippet relevan, dan memberikan daftar istilah pencarian (*vocabulary terms*) untuk query lanjutan.

---

## 6. DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No File Reader Bypass**: NEVER use `ctx_execute` merely as a loop of `fs.readFileSync` to evade `view_file` quota limits. If reading quota is exhausted, stop and ask the user directly.
- **No Serial Micro-Scripting**: NEVER invoke `ctx_execute` repeatedly in a row to inspect files one by one. Use a single batch-first script for $\ge 2$ files.
- **No Relative `require('./...')` for Project Modules**: In `ctx_execute`, NEVER write `require('./src/...')` because script runs in `/tmp/`. Always use `require(path.resolve(process.cwd(), 'src/...'))`.
- **No Static ESM Imports in JS/TS**: NEVER write `import ... from "..."` inside `code` for `ctx_execute` or `ctx_execute_file`. `context-mode` wraps code in `async function __cm_main()`, which forbids top-level ESM imports and causes `error: Unexpected <module>`. Always use CommonJS `require(...)`, dynamic `await import(...)`, or `Bun.file(...)`.
- **No `command` Parameter in `ctx_execute`**: NEVER pass `{"command": "..."}` to `ctx_execute`. `ctx_execute` requires `{"language": "...", "code": "..."}`.
- **No Omitted `queries` on Batch Execution**: NEVER omit `queries` in `ctx_batch_execute`. It is a **REQUIRED** parameter.
- **No Raw Byte Dumping**: Do NOT read raw files (> 50KB) directly into conversation context when filtering/aggregating data. Use `ctx_execute_file`.
- **No Web Fetch Token Flood**: Do NOT fetch large web pages directly into context. Use `ctx_fetch_and_index` and query snippets via `ctx_search`.
- **No File Code Edits in Sandbox**: Do NOT use `ctx_execute` to modify code files. Use native file editing tools instead.
- **No Missing `intent` on Big Outputs**: If script output exceeds 5KB, always supply the `intent` string parameter to enable auto-indexing.


