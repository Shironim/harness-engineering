---
name: performance-audit
description: Performance bottleneck identification and optimization auditing protocol. Analyzes algorithmic complexity, database queries, reactivity churn, and rendering loops using empirical metrics and impact vs effort prioritization.
---

# `performance-audit` — Performance Bottleneck & Efficiency Audit Protocol

> **Prinsip Utama:** *Measure Before Optimizing.* Hindari optimasi prematur (*premature optimization*). Setiap bottleneck wajib dibuktikan dengan jejak kode konkret, pola query, atau data beban kerja nyata. Prioritaskan perbaikan berdasarkan rasio *Impact vs Effort* dan definisikan metrik verifikasi terukur.

---

## Kapan Wajib Menggunakan (Trigger Moments)

Gunakan skill ini saat:
1. Menemukan latensi tinggi pada API endpoint, respon UI yang lambat/lag, atau konsumsi memori/CPU yang membengkak.
2. Diminta melakukan profiling dan audit performa pada modul frontend atau alur data backend tertentu.
3. Mengidentifikasi pola inefisiensi seperti N+1 queries, missing database indexes, atau operasi I/O pemblokir (*blocking synchronous operations*).
4. Menganalisis *rendering churn*, kebocoran reaktivitas, atau alokasi memori berlebih di perulangan template UI.

---

## Guardrails & Batasan Keras

- **JANGAN LANGSUNG EKSEKUSI PERBAIKAN:** Dilarang mengubah kode sebelum temuan performa dan rekomendasi disetujui. Laporkan temuan dan rencana perbaikan terlebih dahulu.
- **Anti-Optimasi Prematur:** Dilarang mengoptimasi kode hanya demi estetika mikro-optimasi jika tidak terbukti menjadi bottleneck nyata dalam profil beban kerja.
- **Metrik Verifikasi Wajib:** Setiap kandidat bottleneck wajib menyertakan cara mengukur dan memverifikasi performa sebelum vs sesudah perbaikan.
- **Precision Slicing:** DILARANG membaca file utuh (> 50 baris) dengan `view_file`. Gunakan pinset AST (`inspect_component` / `codegraph_explore`).

---

## MCP Suite Routing

| Target Audit Performa | Tool Utama | Metode Penyelidikan |
|---|---|---|
| **Frontend & UI Rendering** | `strata-mcp` | Gunakan `audit_frontend(type: "similar-templates")` untuk menemukan duplikasi struktur DOM yang berat; audit reactivity smells, computed dependencies, dan alokasi inline di dalam perulangan render via `inspect_component`. |
| **Backend & Call Depth** | `codegraph` | Gunakan `codegraph_explore` untuk memetakan rantai pemanggilan service/query yang terlalu dalam, perulangan pemanggilan fungsi sinkron, dan alur data antar layer. |
| **Sandbox Profiling & Log Analysis** | `context-mode` | Jalankan kalkulasi profil komputasi, simulasi beban, atau penyaringan log query lambat (*slow query logs*) di dalam sandbox `ctx_execute` (Bun). |
| **Trade-Off & Matrix Ranking** | `sequential-thinking` | Gunakan `sequentialthinking` untuk menyusun matriks kuadran *Impact vs Effort* dan merumuskan arsitektur optimasi yang paling minim risiko regresi. |

---

## Langkah Audit Sistematis (Protocol Workflow)

1. **Analisis Berdasarkan Bukti (Empirical Root Cause):**
   - Telusuri alur eksekusi dari input sampai output.
   - Periksa titik-titik rawan inefisiensi:
     - **Database / I/O:** N+1 query problem, query tanpa index, query mengambil seluruh kolom yang tidak perlu (`SELECT *`), nested transactions.
     - **CPU / Algoritmik:** Kompleksitas $O(n^2)$ atau lebih tinggi pada dataset besar, sorting/filtering berulang tanpa caching, JSON parsing berukuran raksasa.
     - **Frontend / Reactivity:** Kebocoran reactive watcher, re-rendering komponen induk yang tidak perlu, alokasi objek baru di dalam props loop virtual scroll.
     - **Concurrency:** Operasi I/O sinkron atau serial yang sebenarnya dapat dijalankan secara paralel (`Promise.all`).

2. **Penyusunan Matriks Prioritas (Impact vs Effort):**
   - **Quick Wins (High Impact, Low Effort):** Missing index pada query sering, penggantian loop serial menjadi paralel, pencegahan render loop ganda.
   - **Major Projects (High Impact, High Effort):** Perombakan skema tabel, implementasi caching terdistribusi, refactor arsitektur state global.
   - **Fill-ins (Low Impact, Low Effort):** Mikro-optimasi minor yang mudah diterapkan namun dampaknya terbatas.
   - **Deprioritize (Low Impact, High Effort):** Refactoring radikal yang memakan banyak waktu tanpa peningkatan latensi yang signifikan.

3. **Definisikan Metrik & Rencana Verifikasi:**
   - Metrik acuan: e.g. p95 response time, waktu eksekusi query (ms), jumlah DOM nodes, bundle size (KB), atau throughput (RPS).
   - Cara memverifikasi sebelum vs sesudah diterapkan.

---

## Format Output Laporan Audit Performa

Sajikan temuan performa dengan format berikut:

```markdown
### 1. Ringkasan Diagnostik Performa
- Gejala performa dan area sistem yang menjadi bottleneck utama.

### 2. Matriks Kandidat Bottleneck (Diurutkan Impact vs Effort)

#### [P1 - High Impact / Low Effort] Nama Bottleneck
- **Lokasi Kode:** [file.ts:L15-30](file:///path/to/file.ts#L15-L30)
- **Akar Masalah:** Penjelasan teknis mengapa kode ini menjadi bottleneck (sertakan estimasi kompleksitas atau query overhead).
- **Rekomendasi Perbaikan:** Solusi teknis konkret (e.g. eager loading, pembuatan index, debouncing, memoization).
- **Metrik Verifikasi:**
  - *Metrik:* e.g. Durasi eksekusi query / Frame render time.
  - *Cara Ukur:* e.g. Log timing sebelum vs sesudah perbaikan.

### 3. Rencana Tindak Lanjut
- Rekomendasi urutan implementasi untuk disetujui pengguna sebelum kode disentuh.
```
