---
name: code-review
description: Senior engineer code review protocol for pull requests, git diffs, and staged changes. Evaluates correctness, edge cases, pattern consistency, regressions, security, and performance using 4-MCP routing with strict non-destructive reporting.
---

# `code-review` — Senior Engineer Precision Code Review Protocol

> **Prinsip Utama:** Bersikap teliti, objektif, dan konstruktif layaknya Tech Lead / Senior Engineer. Tinjau perubahan kode dengan fokus pada kebenaran logika, penanganan edge cases, konsistensi konvensi, dan mitigasi risiko regresi tanpa langsung memodifikasi kode.

---

## Kapan Wajib Menggunakan (Trigger Moments)

Gunakan skill ini saat:
1. Diminta meninjau perubahan kode (*git diff*, branch, pull request, atau kumpulan file yang dimodifikasi).
2. Mengevaluasi hasil refactoring atau penambahan fitur baru sebelum digabungkan (*merge*).
3. Melakukan pemeriksaan kelayakan arsitektural dan konsistensi pola terhadap codebase yang sudah ada.
4. Mengidentifikasi *unintended side effects* atau *breaking changes* pada pemanggil upstream/downstream.

---

## Guardrails & Batasan Keras

- **Read-Only / Jangan Ubah Kode:** Reviewer memberikan evaluasi, temuan, dan rekomendasi perbaikan. Dilarang langsung mengubah kode target.
- **Investigasi Terencana (Maksimal 2–3 Tool Call):** Jangan menjelajah file sembarangan. Gunakan MCP untuk memeriksa konteks perubahan secara terarah.
- **Precision Slicing:** Dilarang membaca file utuh (> 50 baris) dengan `view_file`. Iris fungsi atau komponen target menggunakan AST pinset.
- **Tingkat Keparahan Eksplisit:** Setiap temuan wajib diberi label severity yang jelas (*blocking*, *nice-to-have*, atau *pertanyaan*).

---

## MCP Suite Routing

| Kebutuhan Konteks Review | Tool Utama | Tujuan & Cara Kerja |
|---|---|---|
| **Frontend & UI Slicing** | `strata-mcp` | Gunakan `inspect_component` untuk memeriksa perubahan props/emits/metode yang disentuh; gunakan `get_component_tree` untuk mengecek dampak pada komponen induk di atasnya. |
| **Backend & Dependency Flow** | `codegraph` | Gunakan `codegraph_explore` untuk memeriksa *incoming callers* dari fungsi yang dimodifikasi dan memetakan *blast radius* perubahan tanpa membuka banyak file. |
| **Diff Analisis & Skrip Massal** | `context-mode` | Gunakan `ctx_execute` (Bun sandbox) untuk menyaring git diff masif atau membandingkan token perubahan tanpa membanjiri konteks LLM. |
| **Penalaran & Dampak Sistem** | `sequential-thinking` | Gunakan `sequentialthinking` untuk menimbang konsekuensi perubahan logika terhadap edge cases dan invariansi arsitektur. |

---

## Fokus Penilaian (Review Dimensions)

1. **Correctness & Intent:**
   - Apakah perubahan logika benar-benar memenuhi tujuan fungsional yang dimaksud?
   - Apakah terdapat *off-by-one errors*, race conditions, atau asumsi kondisi yang keliru?
2. **Edge Cases & Error Handling:**
   - Bagaimana penanganan terhadap input kosong/null, payload tak terduga, atau kegagalan network/database?
   - Apakah error handling memberikan konteks yang bermanfaat dan tidak menelan exception secara diam-diam?
3. **Consistency & Conventions:**
   - Apakah kode mengikuti pola penamaan, struktur arsitektur, dan konvensi yang sudah ada di codebase ini?
   - Apakah abstraksi yang dibuat selaras dengan *Single Source of Truth (SSOT)*?
4. **Side Effects & Blast Radius:**
   - Apakah perubahan tanda tangan fungsi (*signature*) atau return type merusak modul lain yang memanggilnya?
   - Apakah state mutasi global/store berisiko menimbulkan *render cascade* atau kebocoran reaktivitas?
5. **Security & Performance:**
   - Apakah ada celah keamanan baru (injeksi, unvalidated input, credential leak)?
   - Apakah ada inefisiensi nyata (query loop N+1, re-render berlebihan, blocking operations)?

---

## Format Output Review

Sajikan review dengan format standar berikut:

### 1. Ringkasan Perubahan
Ringkasan singkat mengenai scope yang ditinjau dan impresi umum terhadap perubahan.

### 2. Daftar Temuan Terstruktur
Bagi setiap temuan berdasarkan label severity:

- **BLOCKING**: Masalah kritis yang wajib diperbaiki sebelum kode layak digabungkan (bug fungsional, breaking change tanpa migrasi, celah keamanan).
- **NICE-TO-HAVE**: Saran peningkatan kualitas, kebersihan kode, optimasi minor, atau penyederhanaan refactoring.
- **PERTANYAAN**: Pertanyaan klarifikasi untuk mengonfirmasi niat (*intent*) di balik desain kode tertentu (bukan cacat kode).

Untuk setiap poin temuan, sertakan:
- **Lokasi:** Link file clickable dengan baris kode, misal: [`userService.ts:L45-L52`](file:///path/to/userService.ts#L45-L52)
- **Penjelasan Masalah:** Mengapa bagian ini berisiko atau bermasalah.
- **Saran Solusi:** Contoh potongan kode atau langkah konkret untuk memperbaikinya.
