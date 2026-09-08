---
name: audit-codebase
description: Comprehensive codebase audit across code quality, architecture coupling, potential bugs, test coverage, security, and performance. Enforces the 4-MCP investigation protocol, priority categorization, and non-destructive recommendation reporting.
---

# `audit-codebase` — Comprehensive Codebase Audit & Architectural Health

> **Prinsip Utama:** Lakukan audit menyeluruh tanpa mengubah kode secara prematur. Setiap temuan harus didukung bukti empiris, diurutkan berdasarkan prioritas dampak nyata, dan memisahkan keputusan teknis dari keputusan bisnis.

---

## Kapan Wajib Menggunakan (Trigger Moments)

Gunakan skill ini saat:
1. Diminta melakukan audit arsitektur, kesehatan, atau kualitas kode pada scope tertentu.
2. Mengevaluasi tingkat keterikatan (*coupling*), konsistensi layer (*controller / service / repository*), atau dead code.
3. Mencari potensi bug laten (*unhandled edge cases*, *missing error handling*, *reactivity smells*).
4. Menilai kelayakan test coverage dan kesenjangan pengujian pada modul kritis.

---

## Guardrails & Batasan Keras

- **Read-Only / Non-Destructive:** DILARANG langsung mengedit/memperbaiki kode selama proses audit. Laporkan temuan dan rekomendasi terlebih dahulu.
- **Investigasi Terencana (Maksimal 2–3 Tool Call):** Selesaikan investigasi dalam 2–3 tool call terencana via MCP. DILARANG melakukan manual browsing berulang-ulang menggunakan `view_file`, `grep_search`, atau `find_by_name`.
- **Precision Slicing:** DILARANG membaca file utuh (> 50 baris) dengan `view_file`. Gunakan pinset AST (`inspect_component` / `codegraph_explore`).
- **Pemisahan Keputusan Bisnis:** Temuan yang memerlukan trade-off atau keputusan bisnis wajib ditandai terpisah untuk didiskusikan dengan pengguna.

---

## MCP Suite Routing

| Domain Audit | Tool Utama | Tujuan & Cara Kerja |
|---|---|---|
| **Frontend & UI Components** | `strata-mcp` | Jalankan `audit_frontend` untuk mendeteksi rute, dead components, duplikasi template (`similar-templates`), dan reactivity smells. Gunakan `inspect_component` untuk memeriksa kontrak props/emits publik. |
| **Backend & Call Graph** | `codegraph` | Jalankan `codegraph_explore` untuk audit ketergantungan layer, circular dependencies, blast radius, dan coupling antar class/modul. |
| **Bulk Scan & Audit Skrip** | `context-mode` | Jalankan skrip audit massal di sandbox `ctx_execute` (Bun) untuk memfilter log atau kode besar dan kembalikan intisari ≤ 40 baris. |
| **Evaluasi & Sintesis** | `sequential-thinking` | Gunakan `sequentialthinking` untuk menganalisis akar masalah, memvalidasi trade-off arsitektur, dan menyusun urutan rekomendasi perbaikan. |

---

## Dimensi Audit

1. **Code Quality:**
   - Konsistensi gaya penulisan dan konvensi penamaan (*domain-driven naming*).
   - Duplikasi logika (*DRY violations*) dan boilerplate berlebih.
   - Kompleksitas siklomatis fungsi (*arrow anti-pattern*, nested branching).
2. **Architecture & Coupling:**
   - Pemisahan tanggung jawab layer (misal: UI $\rightarrow$ Store/Composable $\rightarrow$ API Service $\rightarrow$ DB/Repository).
   - *Single Source of Truth (SSOT)* dan *Anti-Corruption Layer*.
   - Keterikatan erat (*tight coupling*) dan *circular dependencies*.
3. **Potential Bugs & Resilience:**
   - Unhandled edge cases (nilai null/undefined, array kosong, concurrency).
   - Error handling yang hilang atau menelan error (*empty catch blocks*).
   - State reactivity bugs (mutasi state langsung, memory leaks pada watcher/listener).
4. **Test Coverage & Quality:**
   - Area kritis yang belum tersentuh pengujian (happy path vs failure path).
   - Tes rapuh yang bergantung pada implementasi internal (*mocking overuse*).
5. **Security & Performance (Opsional / Konteks Terkait):**
   - Celah injeksi, exposed secrets, N+1 query, atau alokasi memori berlebih di render loop.

---

## Format Output Laporan

Sajikan hasil audit dengan format terstruktur berikut:

### 1. Ringkasan Eksekutif
- Scope yang diaudit dan metrik kesehatan umum.

### 2. Temuan Berdasarkan Prioritas
Kelompokkan setiap temuan ke dalam tingkat keparahan:
- **CRITICAL**: Mengakibatkan sistem crash, celah keamanan aktif, kehilangan data, atau pelanggaran arsitektur fatal.
- **MEDIUM**: Mengurangi maintainability, potensi bug pada edge cases, atau inefisiensi performa yang terukur.
- **LOW**: Perbaikan kosmetik, inkonsistensi minor, atau optimasi refactoring kecil.

Untuk setiap temuan sertakan:
- **Lokasi:** Link markdown clickable ke baris kode (`file:///path/to/file#L10-L25`).
- **Deskripsi Masalah:** Penjelasan akar masalah secara teknis (*root cause*).
- **Rekomendasi Perbaikan:** Solusi langkah demi langkah tanpa mengubah kode langsung.

### 3. Catatan Keputusan Bisnis (Jika Ada)
Tandai secara terpisah setiap temuan yang memerlukan keputusan produk/bisnis sebelum tindakan teknis diambil.
