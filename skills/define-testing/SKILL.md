---
name: define-testing
description: Comprehensive testing strategy and implementation protocol covering unit and integration tests. Follows existing testing frameworks, extracts contracts via strata-mcp, maps test dependencies via codegraph, and ensures strict edge case coverage without testing sprawl.
---

# `define-testing` — Test Strategy & Implementation Protocol

> **Prinsip Utama:** Buat pengujian yang presisi, andal, dan merefleksikan spesifikasi domain. Manfaatkan framework dan konvensi pengujian yang sudah ada di proyek tanpa menambahkan dependency pengujian baru. Uji kontrak fungsional dan *edge cases* kritis tanpa melebar ke luar scope.

---

## Kapan Wajib Menggunakan (Trigger Moments)

Gunakan skill ini saat:
1. Diminta membuat *unit test* atau *feature/integration test* untuk modul, handler, composable, atau service tertentu.
2. Melengkapi pengujian yang kurang (*test coverage gaps*) pada fitur atau endpoint yang sudah ada.
3. Menerapkan TDD (*Test-Driven Development*) sebelum refactoring atau penulisan kode fitur baru.
4. Menambahkan *regression test* untuk memastikan bug yang telah diperbaiki tidak berulang.

---

## Guardrails & Batasan Keras

- **Testing Debt Guardrail (Blast Radius vs Safety Net):** Jika modul, composable, utilitas, atau service target memiliki banyak pemanggil downstream namun belum memiliki tes pelindung (`no covering tests found`), pembuatan *safety-net unit test* WAJIB didahulukan sebelum melakukan modifikasi kode atau penambahan fitur baru untuk mencegah regresi masif.
- **Gunakan Dependency yang Sudah Ada:** DILARANG menginstal framework pengujian atau library assertion baru kecuali diminta eksplisit. Selalu ikuti pola tes yang sudah ada di codebase (misal: Bun test, Vitest, Jest, PHPUnit, PyTest, Go test).
- **Cek Test yang Ada Terlebih Dahulu:** Hindari duplikasi pengujian. Periksa apakah test file untuk target tersebut sudah tersedia, lalu lengkapi skenarionya.
- **Batasi Scope Pengujian:** Fokus HANYA pada target dan kontrak modul yang diminta. Dilarang menulis tes untuk fungsi/endpoint di luar target.
- **Precision Slicing:** DILARANG membaca file utuh (> 50 baris) dengan `view_file`. Ekstrak kontrak props, method, atau interface menggunakan MCP tools.

---

## MCP Suite Routing

| Kebutuhan Pengujian | Tool Utama | Tujuan & Cara Kerja |
|---|---|---|
| **Frontend & Komponen** | `strata-mcp` | Gunakan `inspect_component` untuk mengekstrak kontrak publik (`props`, `emits`, `slots`) dan memetakan state yang wajib diuji. |
| **Backend & Dependency Tree** | `codegraph` | Gunakan `codegraph_explore` untuk menemukan file test yang sudah ada (`tests covering ...`) dan memetakan dependency tree class/fungsi target untuk mocking. |
| **Generasi & Sandbox Eksekusi** | `context-mode` | Jalankan eksekusi uji terisolasi di sandbox `ctx_execute` (Bun) untuk memverifikasi sintaks tes tanpa mencemari terminal log. |
| **Desain Skenario Uji** | `sequential-thinking` | Gunakan `sequentialthinking` untuk merinci matriks permutasi input, skenario kegagalan, dan batasan batas (*boundary conditions*). |

---

## Cakupan Pengujian yang Wajib Di-cover

### 1. Scope Lapisan Uji
- **Unit Test:**
  - Uji fungsi murni, helpers, utils, dan logika bisnis di dalam service/composable secara terisolasi.
  - Mock dependensi eksternal (Database, HTTP API calls, Message Queues, Filesystem).
- **Feature / Integration Test:**
  - Uji alur menyeluruh untuk endpoint atau handler target.
  - Verifikasi *request-response cycle*, HTTP status code, format payload respons, validasi input, dan middleware otentikasi.

### 2. Matriks Skenario Wajib
- **Happy Path:** Input dan request valid menghasilkan output, status code, dan state yang sesuai ekspektasi.
- **Validation & Invalid Input:** Input kosong, tipe data salah, format payload cacat, atau field wajib yang hilang memicu pesan error terstruktur.
- **Auth & Authorization:** Kasus tanpa token (*unauthenticated / 401*) atau peran tidak memiliki hak akses (*forbidden / 403*).
- **Edge Cases & Boundaries:** Nilai batas (*boundary values*), collection kosong, pagination limit, dan kondisi timeout atau error downstream.

---

## Langkah Eksekusi (Workflow Protocol)

1. **Inspeksi Pola Existing:**
   - Telusuri direktori `tests/` atau `__tests__/` untuk melihat struktur file, library mocking, dan gaya assertion yang digunakan.
2. **Ekstrak Kontrak Target:**
   - Gunakan `inspect_component` (Frontend) atau `codegraph_explore` (Backend) untuk memahami input, return type, dan exception yang dilempar.
3. **Rancang Test Suite:**
   - Strukturkan tes dengan blok `describe` dan `test`/`it` yang deskriptif dan mencerminkan *behavior*.
4. **Implementasi & Verifikasi:**
   - Tulis kode pengujian mengikuti konvensi penamaan file proyek (misal: `[target].test.ts` atau `[target].spec.ts`).
   - Sertakan mock yang bersih dan pastikan tidak ada kebocoran state antar pengujian.
