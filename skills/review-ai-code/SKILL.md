---
name: review-ai-code
description: Deep inspection protocol to audit AI-generated code against the 12 critical software engineering principles. Prevents vibe-coding, over-abstraction, control/error flow blind spots, and unintended side effects.
---

# `review-ai-code` — Critical Inspection & Anti-Vibe-Coding Protocol

> **Prinsip Utama:** *AI can write syntax fast, but humans and gatekeeper agents ensure architectural integrity.* Jangan menerima kode hasil generasi AI hanya karena kode tersebut "terlihat rapi" atau "bisa jalan sekali run". Verifikasi alur logika, boundary modularitas, penanganan kegagalan (*failure path*), dan efek samping sebelum kode digabungkan ke codebase.

---

## Kapan Wajib Menggunakan (Trigger Moments)

Gunakan skill ini saat:
1. Mereview kode yang baru saja di-generate oleh AI/LLM sebelum di-commit atau diajukan sebagai solusi final.
2. Melakukan audit sanity check terhadap refactoring atau penambahan fitur baru multi-file.
3. Mencari penyebab bug laten akibat asumsi *happy-path-only* dari generasi AI sebelumnya.
4. Menilai apakah AI melakukan duplikasi logic atau membuat layer abstraksi berlebih (*over-abstraction*).

---

## Guardrails & Batasan Analisis

- **Zero Tolerance on Swallowed Errors:** DILARANG meloloskan blok `try-catch` kosong atau exception yang hanya di-`console.log` tanpa re-throw / structured response.
- **Pure vs Impure Separation:** Fungsi kalkulasi bisnis atau utility harus murni (*pure function*) tanpa *hidden side effects* (seperti mutasi database atau write to disk mendadak).
- **Anti Over-Abstraction:** Tolak helper/service baru jika tugas tersebut cukup diselesaikan dengan fungsi standar yang sudah ada di codebase.
- **Investigasi Non-Destruktif:** Audit terlebih dahulu dan paparkan poin kelemahan kode sebelum melakukan perbaikan.

---

## The 12-Point Inspection Checklist

Setiap file/fitur yang diaudit wajib diuji terhadap matriks berikut:

### 1. Flow Triad (Control, Data, Error)
- **Control Flow:** Apakah ada *early return* prematur? Apakah urutan validasi dijalankan sebelum operasi mutasi data?
- **Data Flow:** Telusuri data dari input awal (UI/HTTP) $\rightarrow$ DTO/Payload $\rightarrow$ DB $\rightarrow$ Response. Apakah ada transformasi data yang hilang atau mutasi state yang tidak sengaja?
- **Error Flow (Beyond Happy Path):** Apa yang terjadi saat DB timeout, third-party down, atau payload bernilai `null`/kosong? Apakah user/klien mendapatkan error status dan pesan yang bermakna?

### 2. State, Scope & Contracts
- **Scope Isolation:** Apakah variabel dideklarasikan pada scope terkecil yang diperlukan? Apakah ada kebocoran variabel atau *variable shadowing*?
- **State Integrity:** Di mana state disimpan? Apakah terjadi duplikasi state antar modul? Apakah update state reaktif secara benar?
- **Input/Output (I/O) Contracts:** Apakah tipe parameter dan nilai balikan konsisten? Apakah ada validasi boundary (Zod/FormRequest/Schema)?

### 3. Architecture & Modularity
- **Modularity & Layering:** Apakah logika bisnis bocor ke Controller atau Komponen UI? Apakah layer Controller $\rightarrow$ Service $\rightarrow$ Model dihormati?
- **Abstraction Balance:** Apakah AI membuat class/helper wrapper yang tidak perlu (indirection berlebih)?
- **Architecture & Duplication:** Apakah fitur ini memanfaatkan modul/utilitas internal yang sudah ada, atau justru membuat duplikat baru karena AI tidak membaca context?

### 4. Runtime Realities
- **Side Effects Transparency:** Apakah fungsi yang memicu I/O (email, queue, audit log) terisolasi dan mudah di-mock dalam testing?
- **Request-Response Semantics:** Apakah HTTP method (GET/POST/PUT/DELETE) dan status code (200, 201, 400, 404, 422, 500) digunakan sesuai standar REST?
- **Concurrency & Race Conditions:** Apakah ada operasi async paralel yang berpotensi menimpa data satu sama lain (*race condition*) atau deadlock?

---

## Format Laporan Review

Sajikan hasil review menggunakan format terstruktur berikut:

```markdown
### 1. Verdict & Health Score
- **Status:** [APPROVED / CHANGES REQUIRED / CRITICAL REFACTOR NEEDED]
- **Vibe-Coding Smells Detected:** [Ya/Tidak — sebutkan jika ada over-abstraction atau happy-path bias]

### 2. Breakdown Temuan (12-Point Pillars)
- **Flow & Logic (Control/Data/Error):** [Temuan atau lolos]
- **Scope & State Management:** [Temuan atau lolos]
- **Modular Architecture & Abstraction:** [Temuan atau lolos]
- **Side Effects & Concurrency:** [Temuan atau lolos]

### 3. Critical Recommendations (Actionable Steps)
- **[File & Baris]:** Masalah spesifik (misal: *Missing validation before DB insert* atau *Swallowed exception*).
  - **Dampak:** Mengapa ini berbahaya di production.
  - **Koreksi Terarah:** Solusi perbaikan konseptual atau refactor target.