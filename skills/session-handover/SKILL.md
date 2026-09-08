---
name: session-handover
description: Updates handover documentation when ending or switching a work session using context-compression and Verity staleness verification. Use when ending a coding session, generating handover notes, or passing conversation context to a new session.
---

# Session Handover

> **Rationale**: Memadatkan riwayat percakapan panjang ke dalam berkas `handover/YYYY-MM-DD-[slug].md` saat akan berpindah ke sesi percakapan baru. Menggunakan arsitektur multi-file per sesi untuk mencegah hilangnya konteks historis (*Context Collapse / ACE*) dan terintegrasi langsung dengan **Verity** untuk memverifikasi keabsahan brief yang dirujuk.

---

## GOAL & CONSTRAINTS

### Core Goals
- Summarize session accomplishments, active status, modified files, and remaining unresolved tasks.
- Compress completed research/implementation phases while preserving individual architectural decision rationales ("WHY").
- **Verity Staleness Verification:** Menjalankan pengecekan Verity terhadap brief yang disentuh pada sesi ini sebelum mencatat handover.
- **Multi-File Persistence:** Menuliskan ringkasan ke file baru `handover/YYYY-MM-DD-[slug].md` dan memperbarui `handover/INDEX.md`.

---

## CONTEXT COMPRESSION & WORKFLOW STEPS

1. **Jalankan Verity Pre-Handover Check:**
   Sebelum menulis dokumen handover, Agent mengeksekusi pemeriksaan status brief:
   ```bash
   bun run verity check --json
   ```
   Catat apakah brief yang disentuh dalam sesi ini berstatus `OK` atau `STALE`.
2. **Compress phases, not facts:** Keputusan individual dan akar masalah teknis dipertahankan; raw dump log terminal dihilangkan.
3. **Preserve "why" over "what":** Alasan mengapa suatu pola/arsitektur dipilih jauh lebih bernilai dibanding perintah shell yang dijalankan.
4. **Notify on handover:** Selalu beri tahu pengguna: *"Merekam status dan keputusan sesi ini ke dalam handover/YYYY-MM-DD-[slug].md..."*.
5. **Keep file references with line numbers:** Selalu sertakan clickable links dengan nomor baris (`[file.ext#L10-L25](file:///...)`).
6. **Update Manifest Index:** Perbarui `handover/INDEX.md` dengan menambahkan 1 baris ringkasan sesi terbaru di urutan teratas.

---

## OUTPUT DOCUMENT CONTRACT (`handover/YYYY-MM-DD-[slug].md`)

Tulis berkas sesi baru di `handover/YYYY-MM-DD-[slug].md` menggunakan templat berikut:

```markdown
# Handover: [Nama Fitur / Scope Pekerjaan]

> **Tanggal:** YYYY-MM-DD HH:MM WIB  
> **Sesi Slug:** YYYY-MM-DD-[slug]  
> **Status:** [Fase Riset Selesai | In Progress | Ready for Verification | Completed]  
> **Brief Acuan:** [`docs/brief/feature-[slug].md`](file:///docs/brief/feature-[slug].md)  

---

## Status Verity (Otomatis)
- [ ] Status integritas brief yang direferensikan pada sesi ini:
  - ✅ `docs/brief/feature-[slug].md` — Masih valid (Git SHA: `abc1234`)
  - *(atau jika ada perubahan tak terencana)*:
  - ⚠️ `docs/brief/other-spec.md` — STALE (kode berubah oleh commit `def5678`)

---

## Ringkasan Sesi Ini (Hasil Kompresi)
- **Modifikasi Kode**:
  - [`src/components/Header.tsx`](file:///path/to/file#L10-L40): Mengubah nav links menjadi single-line flex row.
- **Keputusan Arsitektur (Why)**:
  - Dipilih `Zustand` menggantikan `React Context` untuk menghindari re-render massal pada komponen anak.

---

## Langkah Selanjutnya (Sesi Baru)
1. [ ] Jalankan E2E test suite via `bun test`.
2. [ ] Selesaikan integrasi API pada modal form.
```

---

## MANIFEST INDEX CONTRACT (`handover/INDEX.md`)

File `handover/INDEX.md` mencatat kronologi seluruh sesi kerja agar sesi baru dapat memilih riwayat yang relevan tanpa membaca seluruh file arsip:

```markdown
# Handover Manifest Index

| Tanggal | Sesi | Brief Terkait | Status Verity | Ringkasan 1-Baris |
|---|---|---|---|---|
| YYYY-MM-DD | [`YYYY-MM-DD-slug.md`](file:///handover/YYYY-MM-DD-slug.md) | `feature-[slug].md` | ✅ Valid | Menyelesaikan modul AST normalizer dan Git client. |
```

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Single-File Overwrite**: Dilarang menimpa file `handover.md` tunggal yang merusak jejak riwayat sesi sebelumnya.
- **No Omitting Decision Rationale**: Dilarang menghapus penjelasan "why" di balik keputusan arsitektur kunci.
- **No Stripping File Links**: Wajib mencantumkan file path lengkap dan line numbers.
- **No Skipping Verity Status**: Dilarang membuat dokumen handover tanpa mencatat status verifikasi Verity dari brief acuan.
