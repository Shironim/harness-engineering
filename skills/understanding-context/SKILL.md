---
name: understanding-context
description: Structured codebase comprehension and exploration protocol using the 4-MCP architecture. Enforces a strict 2-3 tool call quota, eliminates blind browsing loops, performs precision AST slicing, and synthesizes architectural blast radius before coding.
---

# `understanding-context` — Structured Codebase Exploration & Comprehension Protocol

> **Prinsip Utama:** *Understand Before Executing.* Dilarang langsung melakukan perubahan kode atau menjelajah codebase secara serampangan. Kuasai konteks, arsitektur, konvensi, dan *blast radius* melalui protokol investigasi 4-MCP terencana (maksimal 2–3 tool call) sebelum menulis baris kode pertama.

---

## Kapan Wajib Menggunakan (Trigger Moments)

Gunakan skill ini saat:
1. Memulai tugas baru pada repositori yang belum dipahami atau fitur dengan keterkaitan multi-file.
2. Diminta mempelajari alur kerja, domain model, atau arsitektur tertentu sebelum merancang implementasi.
3. Menilai kelayakan teknis (*technical feasibility*) dan memetakan dependensi sistem sebelum refactoring besar.
4. Pengguna menginstruksikan untuk memahami codebase terlebih dahulu dan menunggu konfirmasi sebelum implementasi.

---

## STRICT INVESTIGATION PROTOCOL (HARD ENFORCEMENT)

### 1. Tool Call Quota & Negative Constraints (Anti-Looping)
- **Tool Call Quota:** Fase investigasi DIBATASI maksimal **2–3 tool call** terencana. Dilarang trial-and-error membabi-buta!
- **Pantangan Keras (Banned Native Loops):** DILARANG KERAS melakukan manual browsing atau looping berturut-turut menggunakan `view_file`, `grep_search`, atau `find_by_name` untuk discovery!
- **Precision Slicing:** DILARANG membaca file utuh (> 50 baris) dengan `view_file`. Gunakan pinset AST (`inspect_component` / `codegraph_explore`). Tool `view_file` hanya diizinkan untuk rentang sempit (±20 baris) sesaat sebelum edit kode.
- **Wajib Sandbox untuk Data Besar:** Pemindaian banyak file atau pembacaan log besar WAJIB diproses di dalam sandbox `ctx_execute` (Bun) dan kembalikan intisari $\le$ 40 baris.

---

## 4-MCP Investigation Protocol (3-Phase Execution)

### Mental Model: Cognitive Division of Labor (Why Choose Which Tool)

Memahami alasan fundamental di balik pemilihan tool mencegah agen dari salah arah (*misdirection*) dan pembakaran token sia-sia.

> [!IMPORTANT]
> **Pemanfaatan 4-MCP Suite:**
> Sesuai protokol di `GEMINI.md`, agen wajib memanfaatkan 4 MCP suite sesuai domain tugas tanpa browsing liar:
> - `sequential-thinking` (`sequentialthinking`) — Dynamic iterative reasoning & hypothesis mapping.
> - `strata-mcp` (`inspect_component`, `trace_state`, `get_component_tree`) — Slicing AST frontend, component tree, dan trace state.
> - `codegraph` (`codegraph_explore`) — Call graph, caller/callee, dan multi-file symbol dependency.
> - `context-mode` (`ctx_execute`, `ctx_search`, skill `context-mode`) — Sandbox batch processing, FTS5 search, dan mitigasi context bloat.

| Tool MCP | Tool Call Utama | Karakteristik Utama & "The WHY" | Kapan WAJIB Dipilih | Titik Lemah / Kapan JANGAN Dipilih |
|---|---|---|---|---|
| `sequential-thinking` | `sequentialthinking` | **Meta-Kognisi & Arsitek Strategi.** Mengapa: Tanpa hipotesis terstruktur, agen mudah terjebak trial-and-error acak. Mengunci kuota tool call dan mengevaluasi Two-Way Door vs One-Way Door. | Awal setiap tugas kompleks, sebelum merombak arsitektur, atau saat menghadapi bukti anomali baru. | Jangan gunakan untuk membaca isi kode atau mengambil data mentah. |
| `strata-mcp` | `inspect_component`, `trace_state` | **Mata Bedah Dokumen Campuran (Mixed-Document / SFC / AST).** Mengapa: String search dan flat parser buta terhadap batas antara template HTML/JSX dan script. Strata menghubungkan event binding, hierarki upward/downward, dan props/emits tanpa polusi HTML. | Memahami komponen UI (Vue, Astro, React/TSX), audit event handlers, trace state composables/stores, dan mendeteksi dead UI code. | Jangan gunakan untuk melacak query database backend, ORM, atau controller murni non-UI. |
| `codegraph` | `codegraph_explore` | **Teropong Lintas-Batas Simbol & Call Graph.** Mengapa: Memetakan relasi simbol multi-file secara horizontal dan vertikal di lapisan backend/service/logic. | Melacak incoming callers, call hierarchy backend (Controller -> Service -> Repository -> Model), dan blast radius fungsi internal. | Jangan gunakan untuk membedah event template UI atau struktur reaktivitas komponen frontend. |
| `context-mode` | `ctx_execute`, `ctx_search` | **Tameng Token & Sandbox Komputasi Lokal.** Mengapa: Pembacaan banyak file atau log besar di prompt LLM menyebabkan context bloat dan halusinasi. `ctx_execute` menyaring data di memori runtime Bun/Node dan mengembalikan intisari ringkas (<= 40 baris). | Membandingkan pola di belasan file sekaligus, memfilter git diff raksasa, parsing log ukuran megabyte, atau audit regex massal. | Jangan gunakan jika data yang dibutuhkan sudah presisi dan bisa didapat dari 1 pemanggilan AST/graph. |

### Rantai Sinergi Lintas-Lapisan (Cross-Layer Feedback Loop)
Alur investigasi ideal untuk tugas fitur atau refactoring multi-layer:
1. **Call 1 (`sequential-thinking`):** Rumuskan hipotesis, identifikasi apakah perubahan adalah One-Way Door, dan pisahkan boundary UI vs Backend vs Data.
2. **Call 2 (`strata-mcp`):** Bedah kontrak UI, temukan rute/endpoint yang dipanggil komponen, dan petakan upward component tree.
3. **Call 3 (`codegraph`):** Lanjutkan dari endpoint UI langsung ke controller/service backend dan telusuri dampak ke database query.
4. **Opsional (`context-mode`):** Jika ditemukan belasan file konsumen sejenis, validasi keseragaman pola di sandbox tanpa dump file.
5. **Sintesis Akhir (`sequential-thinking`):** Rumuskan rencana defensif terverifikasi sebelum menyentuh kode.

---

### Fase 1: Cognitive Planning via `sequential-thinking` (Call 1)
- Baca skill `use-sequential-thinking` untuk memahami parameter wajib (`thought`, `thoughtNumber`, `totalThoughts`, `nextThoughtNeeded`).
- Rumuskan hipotesis & identifikasi kebutuhan konteks yang dicari.
- Tentukan domain target:
  - **Frontend UI / Komponen:** Template, props, events, reaktivitas.
  - **Backend / Service:** Model data, business logic, call hierarchy, database query.
  - **Cross-Layer / Integrasi:** Kontrak API, format payload DTO, store-to-service mapping.
- Rencanakan rute investigasi terukur yang tuntas dalam 1–2 tool call berikutnya.

### Fase 2: Architectural Routing & Deep Discovery (Call 2–3)
Pilih tool MCP yang tepat sesuai domain target tanpa melakukan browsing acak. **Wajib baca skill panduannya terlebih dahulu:**

| Domain Sasaran | Tool Utama | Tool Call Utama | Metode Penyelidikan |
|---|---|---|---|
| **Frontend, Vue/Astro/TS AST, Props, Komponen** | `strata-mcp` | `inspect_component`, `trace_state` | Gunakan `inspect_component` untuk kontrak props/emits/slicing fungsi spesifik; gunakan `get_component_tree` untuk hirarki rute/komponen; gunakan `trace_state` untuk dampak store/composable. |
| **Backend, Simbol Multi-File, Call Graph** | `codegraph` | `codegraph_explore` | Gunakan `codegraph_explore` untuk memetakan incoming/outgoing callers, blast radius, dan alur relasi antar-file dalam satu pemanggilan. |
| **Bulk Scan, Agregasi Multi-File, Audit Data** | `context-mode` | `ctx_execute`, `ctx_search` | Gunakan `ctx_execute` (Bun/Node sandbox) untuk menyaring ribuan baris data/file menjadi intisari ringkas tanpa mencemari token memori. |

### Fase 3: Sintesis Pemahaman & Tunggu Konfirmasi (Read-Only)
- Evaluasi temuan dari tool MCP.
- Jangan implementasi dulu! Tunggu pengguna mengonfirmasi pemahaman sudah tepat.

---

## Format Output Sintesis Pemahaman

Sajikan hasil pemahaman konteks dengan format standar berikut:

```markdown
### 1. Pemetaan File & Modul Relevan
- Daftar file, komponen, atau service yang terlibat langsung dalam permintaan ini:
  - [`TargetComponent.vue`](file:///path/to/TargetComponent.vue): Peran dan tanggung jawabnya.
  - [`targetService.ts`](file:///path/to/targetService.ts): Method yang menjadi entry point.
- **Konvensi yang Berlaku:** Gaya penamaan (*naming convention*), struktur error handling, dan pola state yang digunakan di codebase ini.

### 2. Analisis Blast Radius & Dependensi
- Komponen upstream atau pemanggil downstream yang akan terdampak jika perubahan diterapkan.
- Potensi breaking changes atau efek samping pada alur data yang ada.

### 3. Ringkasan Pemahaman & Rencana Pendekatan Teknis
- Intisari logika yang perlu ditambahkan atau dimodifikasi.
- Langkah-langkah teknis terencana yang akan diambil setelah dikonfirmasi.

---
> **Menunggu Konfirmasi:** Pemahaman dan rencana di atas bersifat read-only. Implementasi kode akan dijalankan setelah Anda mengonfirmasi rencana ini.
```
