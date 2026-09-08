---
name: use-strata
description: Guidelines, exact MCP tool parameters, and search patterns for strata-mcp (find_code, inspect_component, get_component_tree, trace_state, audit_frontend). Use when performing structural AST code searches, component inspection & slicing, reactivity event audits, route topology discovery, blast radius analysis, or state dependency inspection across Vue, Astro, and React codebases.
version: 2.2.0
---

# `use-strata` — Frontend Structural AST Search & Intelligence Engine

> **Rationale**: Pencarian teks regex biasa sering menghasilkan *false positive* dan tidak memahami sintaks dokumen campuran (`<template>` / `<script>` di Vue atau frontmatter `---` di Astro). `strata-mcp` memisahkan blok kode, memetakan nomor baris asli (*line remapping*), memelihara graf dependensi persisten di SQLite (`.strata/graph.db`), dan mengeksekusi pencarian struktural presisi tinggi menggunakan AST (ast-grep, compiler-dom, dan SQL Recursive CTE).

---

## 1. Dual-Phase Protocol (The Bookends Architecture)

Gunakan `strata-mcp` pada dua titik krusial siklus hidup pemrograman:

1. **Fase 1: Pre-Flight Discovery (Sebelum Menulis Kode)**
   - Pahami kontrak komponen (`props`, `emits`, `slots`, `models`) via `inspect_component` tanpa membuka file mentah.
   - Iris fungsi target dengan koordinat baris presisi & pemanggilnya via `inspect_component(symbol: "...")`.
   - Petakan blast radius ke atas via `get_component_tree(direction: "upward")` sebelum merombak komponen pondasi.

2. **Fase 2: Post-Flight Verification Gate (Hanya Sekali Pasca Seluruh Edit Selesai)**
   - Selesaikan SELURUH rangkaian modifikasi kode yang direncanakan pada file/batch target terlebih dahulu.
   - DILARANG melakukan verifikasi berulang-ulang di sela-sela setiap potongan kecil perubahan.
   - Tepat setelah seluruh edit tuntas (`replace_file_content`), jalankan **1 kali** pemanggilan `inspect_component(path: "...", audit_events: true)` untuk memvalidasi:
     - **Broken Handlers**: Event template (`@click="handleSave"`) yang fungsinya lupa dideklarasikan di `<script setup>`.
     - **Dead Handlers**: Fungsi usang yang tertinggal pasca-refactoring.
     - **Reactivity Smells**: Destrukturisasi props tanpa `toRefs`, mutasi props langsung, atau alokasi inline trap.
   - *Keunggulan*: Verifikasi semantik instan (< 50ms, < 20 baris intisari) tanpa perlu membanjiri konteks percakapan dengan log terminal/build yang boros token.

---

## 2. Trigger Moments & Quick Tool Selector

| Kebutuhan Konteks | Tool Pilihan | Parameter Kunci | Hasil yang Didapat |
|---|---|---|---|
| **Cek Kontrak Komponen** (Props, Emits, Slots, Variants) | `inspect_component` | `path: "..."` | Kontrak antarmuka publik tanpa membaca template/HTML. |
| **Iris Fungsi Spesifik** (Zero-Hop Slicing) | `inspect_component` | `path: "...", symbol: "..."` | Potongan badan fungsi target, nomor baris aktual & micro blast-radius. |
| **Audit Event & Reactivity Smells** | `inspect_component` | `path: "...", audit_events: true` | Deteksi broken/dead handler dan anti-pattern reaktivitas. |
| **Pohon Komponen Turun** (Downwards) | `get_component_tree` | `entry_path` ATAU `route`, `direction: "downward"` | Hierarki komponen anak & deteksi props drilling. |
| **Dampak Perubahan ke Atas** (Blast Radius) | `get_component_tree` | `entry_path: "...", direction: "upward"` | Rantai komponen induk/halaman yang terdampak. |
| **Lacak Konsumen State / Composable** | `trace_state` | `identifier: "...", depth: 1\|2+` | Daftar file pengonsumsi store/composable & call chain. |
| **Audit Arsitektur / Dead Code / Rute** | `audit_frontend` | `target: "routes"\|"dead-components"\|"all"` | Manifes rute URL, komponen yatim piatu, atau audit total. |
| **Pencarian Pola AST / Pemakaian Komponen** | `find_code` | `pattern: "..."` ATAU `component: "..."` | Match lokasi baris ast-grep di seluruh proyek. |

---

## 3. Ringkasan 5 Core Tools

1. **`find_code`**: Mesin pencarian struktural AST ast-grep berbasis pola (`pattern`), nama komponen (`component`), atau aturan relasional YAML.
2. **`inspect_component`**: Precision zero-hop slicer untuk membaca kontrak publik (`props`/`emits`), mengiris fungsi spesifik (`symbol`), atau mengaudit event handler template-to-script.
3. **`get_component_tree`**: Pemetapohon hirarki komponen dua arah (`downward` / `upward`) dari file root atau rute URL, lengkap dengan diagnostik *props drilling*.
4. **`trace_state`**: Pelacak dampak konsumsi state store (Pinia/Zustand), React context, atau composables hingga kedalaman multi-hop.
5. **`audit_frontend`**: Pemindai topologi rute URL, deteksi kode mati (*dead components* / *dead state*), kesamaan template (DRY), dan konsistensi token Tailwind.

---

## 4. Strict Guardrails & Anti-Patterns

- **Zero Raw Byte Dumping**: DILARANG KERAS membuka seluruh file komponen via `view_file` hanya untuk memahami props, emits, atau fungsi. Gunakan `inspect_component`.
- **No Manual Grep Looping**: DILARANG melakukan `grep_search` berulang-ulang untuk mencari pemakaian komponen. Gunakan `find_code(component: "...")` atau `get_component_tree`.
- **No Unfiltered Tree Dumps**: Batasi kedalaman penelusuran pohon (`max_depth: 3`). Jika payload pohon besar, salurkan ke sandbox `ctx_execute`.
- **Output Format Protocol**:
  - Gunakan `output_format: "text"` (default) untuk ringkasan cepat siap baca bagi LLM.
  - Gunakan `output_format: "json"` HANYA jika output akan diproses atau disaring lanjut di sandbox `ctx_execute`.
- **No Micro-Verification Looping**: DILARANG memanggil post-flight check di sela-sela setiap potongan kecil perubahan. Selesaikan seluruh modifikasi yang direncanakan pada komponen/batch terlebih dahulu, baru jalankan verifikasi tepat 1 kali di akhir.

---

## 5. Dokumentasi Referensi Mendalam (On-Demand)

Untuk detail parameter lengkap, arsitektur database, dan resep alur kerja, rujuk dokumen spesifik berikut:

- [references/tool-specs.md]— Spesifikasi parameter lengkap, tipe data, dan contoh payload JSON untuk ke-5 core tools.
- [references/graph-database.md] — Arsitektur SQLite `.strata/graph.db`, skema 5 tabel (`files`, `components`, `edges`, `state_deps`, `routes`), dan resep kueri SQL analitik via `ctx_execute`.
- [references/workflows-and-heuristics.md] — Resep alur kerja investigasi, pola kolaborasi pipeline lintas-MCP (`context-mode`, `codegraph`, `sequential-thinking`), dan decision heuristics.
