---
name: bug-trace
description: Systematic root cause investigation and diagnosis protocol for bugs. Formulates empirical hypotheses, traces code paths and blast radius via 4-MCP routing, and prohibits code fixes until diagnosis is confirmed by the user.
---

# `bug-trace` — Root Cause Bug Investigation & Diagnostic Protocol

> **Prinsip Utama:** *Diagnosis Before Prescription.* Dilarang berasumsi atau menebak-nebak penyebab bug. Setiap hipotesis wajib divalidasi dengan bukti baris kode empiris. Jangan mengeksekusi perbaikan kode sebelum diagnosis dikonfirmasi oleh pengguna.

---

## Kapan Wajib Menggunakan (Trigger Moments)

Gunakan skill ini saat:
1. Menghadapi laporan bug, runtime error, exception, atau perilaku sistem yang tidak diharapkan.
2. Diminta menginvestigasi penyebab perilaku anomali (*unexpected behavior*) pada alur kerja aplikasi.
3. Melacak regresi fungsional setelah perubahan kode atau pembaruan dependency.
4. Membutuhkan analisis *blast radius* untuk mengetahui dampak perbaikan bug pada bagian sistem yang lain.

---

## Guardrails & Batasan Keras

- **TIDAK BOLEH MEMPERBAIKI KODE LANGSUNG:** Dilarang keras melakukan code fix sebelum pengguna mengonfirmasi diagnosis akar masalah benar.
- **Investigasi Terencana (Maksimal 2–3 Tool Call):** Investigasi awal wajib selesai dalam 2–3 pemanggilan tool terarah. Dilarang melakukan looping discovery manual dengan `grep_search` atau `view_file`.
- **Precision Slicing Over Whole-File Dumping:** Dilarang membaca file utuh (> 50 baris) dengan `view_file`. Gunakan pinset AST (`inspect_component` / `codegraph_explore`).
- **Bukti Empiris:** Setiap klaim penyebab bug wajib menyertakan bukti spesifik (baris kode, state mutation, atau call flow), bukan tebakan teoretis semata.

---

## MCP Suite Routing

| Target Penyelidikan | Tool Utama | Metode Investigasi |
|---|---|---|
| **Penalaran & Hipotesis Bertahap** | `sequential-thinking` | Gunakan `sequentialthinking` untuk merumuskan hipotesis awal $\rightarrow$ uji silang dengan bukti kode $\rightarrow$ eliminasi hipotesis salah $\rightarrow$ simpulkan diagnosis definitif. |
| **Frontend, UI, & Reactivity Bugs** | `strata-mcp` | Gunakan `inspect_component(audit_events: true)` untuk tombol macet / handler rusak; periksa reaktivitas state via `trace_state`; periksa anomali props/emits tanpa dump template. |
| **Backend, Services, & Call Graph** | `codegraph` | Gunakan `codegraph_explore` untuk melacak hirarki pemanggilan (*call hierarchy*), menelusuri incoming callers, dan menghitung blast radius perubahan simbol. |
| **Log Analisis & Agregasi State** | `context-mode` | Jalankan pemfilteran log raksasa atau inspeksi data state di sandbox `ctx_execute` (Bun) tanpa mencemari konteks percakapan. |

---

## Langkah Investigasi Sistematis (Protocol Workflow)

1. **Pahami Gejala & Ekspektasi:**
   - Apa input/kondisi pemicunya?
   - Apa perilaku aktual (*actual outcome*) vs perilaku yang diharapkan (*expected outcome*)?

2. **Formulasi Hipotesis & Bukti Kode:**
   - Identifikasi titik kegagalan (*failure point*) pada alur eksekusi.
   - Cantumkan potongan bukti kode konkret yang menunjukkan di mana logika melenceng.
   - Jika terdapat lebih dari satu kemungkinan penyebab, daftarkan semua hipotesis alternatif beserta metode verifikasinya (misal: penambahan log titik spesifik atau cek nilai parameter).

3. **Petakan Dampak & Blast Radius:**
   - Apakah fungsi, modul, atau state yang bermasalah ini dipakai di tempat lain?
   - Apakah perbaikan berpotensi menimbulkan *breaking change* atau regresi di modul lain?

4. **Sajikan Laporan Diagnosis & Tunggu Konfirmasi:**
   - Paparkan hasil diagnosis secara ringkas dan solutif.
   - **Tunggu konfirmasi pengguna sebelum menulis atau mengedit kode apapun.**

---

## Format Output Diagnosis

Sajikan hasil diagnosis dengan struktur:

```markdown
### 1. Ringkasan Root Cause
- Penjelasan ringkas mengenai akar masalah yang sebenarnya (bukan sekadar gejalanya).

### 2. Bukti Empiris dari Kode
- [nama_file.ext:L12-25](file:///path/to/file#L12-L25)
- Penjelasan alur eksekusi yang memicu kegagalan pada baris tersebut.

### 3. Kemungkinan Penyebab Alternatif & Cara Verifikasi (Jika Ada)
- **Hipotesis A:** Bukti / Cara verifikasi.
- **Hipotesis B:** Bukti / Cara verifikasi.

### 4. Analisis Blast Radius
- Modul/komponen lain yang mengonsumsi fungsi ini dan potensi dampaknya jika diperbaiki.

### 5. Rencana Perbaikan (Menunggu Konfirmasi)
- Langkah teknis perbaikan yang diusulkan (hanya usulan, belum dieksekusi).
```
