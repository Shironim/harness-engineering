---
name: to-brief
description: Generate standardized Task Briefs in docs/brief/[category]-[slug].md as a Single Source of Truth (SSOT). Use when asked to write task briefs, document feature specifications, or scope bugfixes/refactoring before coding.
---

# Skill: Task Brief Generator (`to-brief`)

> **Rationale**: Mendokumentasikan spesifikasi, batasan teknis, serta panduan pelaksanaan pekerjaan ke dalam berkas **Single Source of Truth (SSOT)** sebelum dan selama pekerjaan dilakukan. Brief ini mencegah *scope creep*, memastikan kejelasan kriteria penerimaan di seluruh kategori pekerjaan (`feature`, `bugfix`, `refactor`, `testing`), dan terintegrasi langsung dengan **Verity** untuk menjaga integritas dokumen berbasis Git Provenance.

---

## GOAL & CONSTRAINTS

### Core Goals
- Formulate clear, structured Task Briefs across 4 categories (`feature`, `bugfix`, `refactor`, `testing`).
- Act as Product Owner & Lead Architect by clarifying Goals, Existing vs Expected Behavior, and Out-of-Scope boundaries.
- Enforce empirical Acceptance Criteria formatted as **Given-When-Then** and Definition of Done (DoD).
- **Provenance Sealing via Verity (Wajib):** Menghubungkan brief yang selesai secara deterministik ke commit SHA kode implementasi.

### Rencana harus mencakup:
1. Daftar file yang akan diubah/dibuat, dan apa yang berubah di tiap file.
2. **Line Range Mapping (Presisi Target):** Wajib cantumkan perkiraan nomor baris target yang akan diedit (misal: `path/file.vue:L190-L240`) agar eksekusi bebas dari pembacaan ulang (zero probing).
3. Urutan pengerjaan yang logis.
4. Dampak terhadap bagian lain: apakah ada fungsi/endpoint/test lain yang bergantung pada bagian yang akan diubah?
5. Potensi breaking change atau resiko crash — tandai bagian yang beresiko (misal: dipakai di banyak tempat, ada logic kompleks, tidak ada test).
6. Alternatif pendekatan jika ada lebih dari satu cara yang masuk akal.

> [!IMPORTANT]
> **Otomasi Penyegelan Provenance & Boundary Ownership (Wajib):**
> Begitu status brief berubah menjadi `Completed`, Agent **WAJIB** mengeksekusi perintah Verity:
> ```bash
> bun run verity link <brief-path> <target-anchor-1> [target-anchor-2 ...]
> ```
> **Aturan Emas Penentuan Anchor:**
> - **Core Domain Anchors (Wajib di-link):** Hanya berkas/simbol yang secara eksklusif diciptakan atau dimiliki oleh fitur ini (misal: `src/core/parser/ruby.ts`).
> - **Shared Integration Hubs (Dilarang di-link whole-file):** Berkas sentral bersama seperti `routes/index.ts`, `dispatcher.ts`, `app.ts`, atau barrel export `index.ts` **TIDAK BOLEH** dijadikan whole-file anchor di feature brief individual. Jika integrasi wajib diuji, cukup cantumkan di checklist *Definition of Done (DoD)* atau gunakan *symbol-level anchor* (`file.ts#symbol`).
> Agent dilarang menutup brief sebagai `Completed` tanpa stempel provenance pada Core Domain Anchors.

---

## STATUS ENUM & LIFECYCLE

| Status | Makna & Pemicu Perubahan |
|---|---|
| `Draft` | Brief baru dirumuskan, menunggu review dan persetujuan user. |
| `In Progress` | Rencana telah disetujui dan proses implementasi sedang berjalan. |
| `Completed` | Implementasi selesai, seluruh Acceptance Criteria lulus, dan telah disegel via `verity link`. |
| `Needs Reconciliation` | **Diset otomatis oleh `verity check`** saat kode implementasi bergeser sejak commit baseline. |
| `Superseded` | Brief ini telah digantikan oleh task brief baru yang lebih mutakhir. |
| `Archived` | Brief selesai dan sudah tidak aktif dibaca ulang (dipindahkan ke `docs/brief/_archive/`). |

---

## MANIFEST INDEX: `docs/brief/INDEX.md`

Berkas `docs/brief/INDEX.md` berfungsi sebagai manifest ringan yang mencantumkan status seluruh brief aktif.
- **Derived-Only Artifact:** Manifest ini tidak boleh diedit manual, melainkan disinkronkan otomatis oleh Verity:
  ```bash
  bun run verity index
  ```
- **Session Wakeup Protocol:** AI Agent di sesi baru wajib membaca `docs/brief/INDEX.md` terlebih dahulu untuk melihat kesehatan spec sebelum membuka detail dokumen individual.

---

## CATEGORY SLUG MATRIX & HIERARCHY

Struktur folder brief menggunakan format hibrida waktu dan kategori: `docs/brief/YYYY-MM/[category]/[slug].md` (misal: `docs/brief/2026-09/feature/auth-login.md`).

> [!TIP]
> **Discovery Sebelum Membuat Brief:**
> Jalankan `verity find <kata-kunci>` atau `verity find --target <file>` terlebih dahulu untuk memastikan tidak ada spesifikasi aktif yang tumpang-tindih dengan pekerjaan yang akan dirumuskan.

| Category | Path Format | Primary Document Focus |
|---|---|---|
| `feature` | `docs/brief/YYYY-MM/feature/[slug].md` | User Stories, UI Flow, API Specs, Data Model & Access Control. |
| `bugfix` | `docs/brief/YYYY-MM/bugfix/[slug].md` | Root Cause Log Evidence, Stack Traces, Expected vs Actual Behavior. |
| `refactor` | `docs/brief/YYYY-MM/refactor/[slug].md` | Bottleneck Evidence, Architecture Changes, Impact Radius Check. |
| `testing` | `docs/brief/YYYY-MM/testing/[slug].md` | Coverage Targets, Testing Pyramid Matrix (Unit, API, E2E). |

---

## OUTPUT DOCUMENT CONTRACT (`docs/brief/YYYY-MM/[category]/[slug].md`)

Setiap kali skill ini dipanggil:
1. Dapatkan tahun dan bulan saat ini dalam format `YYYY-MM` (contoh: `2026-09`).
2. Pastikan direktori `docs/brief/YYYY-MM/[category]/` telah dibuat (`mkdir -p`).
3. Buat file baru di `docs/brief/YYYY-MM/[category]/[slug].md` menggunakan templat SSOT berikut:

```markdown
# Brief: [Judul Pekerjaan]

> **Kategori**: [feature | bugfix | refactor | testing]  
> **Status**: [Draft | In Progress | Completed | Needs Reconciliation | Superseded | Archived]  
> **Tanggal**: YYYY-MM-DD  

---

## Overview & Problem Statement
- **Konteks & Alasan**: Mengapa pekerjaan ini dilakukan?
- **Tujuan Utama**: Hasil konkret terukur yang ingin dicapai.

---

## Scope & Boundaries
### In-Scope
- [ ] [Pekerjaan / modul 1 yang disentuh]
- [ ] [Pekerjaan / modul 2 yang disentuh]

### Out-of-Scope
- [Hal yang sengaja ditunda / tidak dikerjakan agar scope tidak melebar]

---

## Spesifikasi Detail Pekerjaan
- **Core Domain Anchors**: `path/to/core-file.ext` (File utama yang dimiliki eksklusif oleh fitur ini dan disegel via `verity link`)
- **Integration Touchpoints**: `path/to/shared-hub.ext` (File sentral yang disentuh untuk registrasi — Dilarang di-link whole-file)
- **Data Model & API Impact**: [Skema DB / Endpoint API]

---

## Acceptance Criteria (Given-When-Then)
- [ ] **Scenario 1**:
  - **Given**: [Kondisi awal / state sistem]
  - **When**: [Aksi yang dilakukan user / sistem]
  - **Then**: [Hasil akhir yang diharapkan]

---

## Definition of Done (DoD) Checklist
- [ ] Kode terimplementasi sesuai spesifikasi.
- [ ] Unit / Integration test ditambahkan dan PASS.
- [ ] Tidak ada regresi pada modul terkait.
- [ ] Provenance disegel via `verity link`.

---

## Provenance
- **Completion Commit**: (diisi otomatis via `verity link`)
- **Anchors**: (daftar file/symbol yang di-link ke Verity)
```

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Whole-File Anchoring on Shared Hubs / Central Index**: Dilarang keras menautkan modul sentral bersama (`dispatcher.ts`, `routes/index.ts`, `app.ts`, `manifest.json`) sebagai anchor tingkat file pada feature brief individual. Tindakan ini memicu *Cascading STALE* palsu setiap kali fitur lain mendaftarkan modul baru. Tempatkan pendaftaran modul cukup di checklist DoD atau gunakan symbol-level anchor jika mutlak perlu.
- **No Scope Creep**: Dilarang melebarkan pengerjaan ke fitur out-of-scope tanpa memperbarui dokumen brief terlebih dahulu.
- **No Unverified Root Cause in Bugfixes**: Never write a `bugfix` brief without explicitly citing actual error logs or stack trace evidence.
- **No Vague Acceptance Criteria**: Dilarang menulis kriteria penerimaan samar seperti "Aplikasi harus cepat". Gunakan format **Given-When-Then**.
- **No Unsealed Completed Briefs**: Dilarang menandai status `Completed` tanpa mengeksekusi `verity link` untuk mencatat commit SHA.
