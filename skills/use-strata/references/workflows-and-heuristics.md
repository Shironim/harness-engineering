# Workflows, Multi-Tool Pipelines & Decision Heuristics

Dokumen ini memuat panduan alur kerja investigasi praktis, pola kolaborasi lintas-MCP (pipelining), serta heuristik pengambilan keputusan rekayasa berbasis data AST yang dihasilkan oleh `strata-mcp`.

---

## 1. Workflow Recipes (Resep Investigasi Praktis)

### Resep 1: Investigasi Bug Fungsi Tanpa Membaca Seluruh Berkas (Zero-Hop)
Saat menemukan bug pada kalkulasi diskon, submit data, atau fungsi spesifik:
1. Panggil `inspect_component` dengan menyertakan argumen `symbol`:
   ```json
   {
     "ServerName": "strata-mcp",
     "ToolName": "inspect_component",
     "Arguments": {
       "path": "resources/js/Composables/useOrder.ts",
       "symbol": "calculateDiscount"
     }
   }
   ```
2. Engine mengekstrak badan fungsi tersebut beserta nomor baris aktual (`startLine` - `endLine`) dan micro blast-radius tanpa me-load ratusan baris kode template/HTML.

---

### Resep 2: Audit Event & Tombol Error Sebelum Rilis
Untuk mencegah runtime error tombol klik di template Vue/React:
1. Panggil `inspect_component` dengan `audit_events: true`:
   ```json
   {
     "ServerName": "strata-mcp",
     "ToolName": "inspect_component",
     "Arguments": {
       "path": "resources/js/Pages/Checkout/Index.vue",
       "audit_events": true
     }
   }
   ```
2. Tool akan langsung memvalidasi apakah ada handler template (misal `@click="processPayment"`) yang fungsinya belum dideklarasikan di `<script setup>`.

---

### Resep 3: Audit Menyeluruh Sebelum Refactoring Besar
Sebelum merombak layout atau komponen pondasi:
1. Panggil `audit_frontend(target: "all")` untuk mendapatkan lanskap topologi rute dan deteksi dead components.
2. Panggil `get_component_tree(entry_path: "...", direction: "upward")` untuk memetakan blast radius seluruh konsumen yang berisiko regresi.

---

## 2. Multi-Tool Collaboration & Pipeline Recipes

### Alur Kerja Lintas-Tool:
```
strata-mcp (AST Contract / Graph)
       │
       ▼ (Payload JSON besar)
context-mode (ctx_execute sandbox filter)
       │
       ▼ (Intisari fakta & anomali < 30 baris)
sequential-thinking (Analisis risiko & hipotesis)
       │
       ▼ (Target baris presisi)
replace_file_content (Surgical edit)
```

### Pola Sinergi Utama:

#### 1. Penyaringan Pohon Komponen Besar (`strata-mcp` + `context-mode`)
Jika `get_component_tree` menghasilkan JSON yang sangat dalam, jangan biarkan mencemari konteks LLM. Salurkan output ke sandbox Bun melalui `ctx_execute`:
```javascript
// Di dalam ctx_execute
const tree = JSON.parse(OUTPUT_FROM_STRATA);
const drilled = tree.filter(node => node.propsDrilling && node.propsDrilling.length > 0);
console.log("Components requiring refactor:", drilled.map(d => ({ component: d.name, props: d.propsDrilling })));
```

#### 2. Pelacakan Dampak Lintas Layer Frontend-ke-Backend (`strata-mcp` + `codegraph`)
1. Gunakan `strata-mcp:inspect_component` untuk menemukan endpoint API yang dipanggil oleh frontend Vue/Astro (misal: `axios.post("/api/checkout")`).
2. Gunakan `codegraph:codegraph_explore` untuk langsung menelusuri controller backend penerima endpoint tersebut tanpa perlu mencari file secara manual.

#### 3. Audit Refactoring Multi-Hipotesis (`strata-mcp` + `sequential-thinking`)
1. Dapatkan temuan *reactivity smells* atau *broken handlers* via `inspect_component(audit_events: true)`.
2. Salurkan temuan anomali tersebut ke `sequentialthinking` untuk memetakan hipotesis dan menguji risiko regresi sebelum mengubah kode.

#### 4. Kueri Analitik Graf Ad-Hoc (`.strata/graph.db` + `ctx_execute`)
Untuk kueri analitik relasional kustom (seperti mendeteksi *God Components*, *High Fan-In*, atau *Orphan Components*), jalankan kueri SQL langsung ke `.strata/graph.db` via `bun:sqlite` di dalam `ctx_execute`. Lihat panduan lengkap di [references/graph-database.md](file:///F:/Veritas/strata-mcp/.agents/skills/use-strata/references/graph-database.md).

---

## 3. Actionable Decision Heuristics

Data dari `strata-mcp` bukan sekadar teks pasif, melainkan sinyal aktif untuk memandu keputusan rekayasa secara defensif:

### 1. Testing Debt Guardrail (High Consumer Count + Zero Covering Tests)
- **Sinyal:** `inspect_component` melaporkan fungsi/composable/util dipakai oleh banyak konsumen (misal: > 10 modul), namun memiliki status `no covering tests found`.
- **Keputusan:** JANGAN langsung mengubah implementasi fungsi target. Prioritaskan pembuatan unit test terlebih dahulu sebagai jaring pengaman (*regression guardrail*) sebelum memodifikasi kode.

### 2. Architectural DRY Consolidation (Identical Consumer Pattern)
- **Sinyal:** `trace_state` menemukan sebuah state/composable dikonsumsi oleh belasan komponen sejenis (misal: multiple list items atau table actions).
- **Keputusan:** Hindari mengedit belasan file secara manual dan terpisah. Verifikasi keseragaman payload di sandbox `context-mode`, lalu rancang komponen pembungkus bersama (*Single Source of Truth / Reusable Wrapper*) untuk mengeliminasi duplikasi secara struktural.

### 3. Safe Dead-Code Deletion (Zero Incoming References)
- **Sinyal:** `audit_frontend` menandai komponen atau composable sebagai orphan (tidak terhubung ke rute maupun komponen lain).
- **Keputusan:** Verifikasi apakah ada pemanggilan dinamis via router atau dynamic import. Jika terbukti 0 referensi, rekomendasikan penghapusan aman (*safe deletion*) untuk memangkas bundle size secara nyata.
