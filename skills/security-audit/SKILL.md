---
name: security-audit
description: Security vulnerability assessment and threat modeling protocol covering OWASP Top 10, IDOR, injection vectors, XSS, exposed secrets, and authorization flaws. Utilizes AST pattern matching and taint tracking via 4-MCP with non-destructive reporting.
---

# `security-audit` — Code Security & Vulnerability Assessment Protocol

> **Prinsip Utama:** *Secure by Default & Server as Absolute Trust.* Asumsikan seluruh input dari klien tidak aman. Analisis kerentanan secara objektif dengan melacak alur data yang belum disanitasi (*taint tracking*) dan memetakan skenario eksploitasi konkret tanpa langsung mengubah kode.

---

## Kapan Wajib Menggunakan (Trigger Moments)

Gunakan skill ini saat:
1. Melakukan tinjauan keamanan pada kode baru, modul autentikasi/otorisasi, atau endpoint publik.
2. Memeriksa kerentanan umum (*OWASP Top 10*): Injeksi, Broken Access Control, IDOR, XSS, SSRF, Deserialization, atau Secret Leaks.
3. Menilai batasan validasi input, sanitasi output, dan kebijakan perlindungan data sensitif.
4. Menjalankan audit kepatuhan keamanan (*security posture review*) sebelum rilis atau deployment.

---

## Guardrails & Batasan Keras

- **JANGAN LANGSUNG MEMPERBAIKI KODE:** Laporkan seluruh temuan kerentanan terlebih dahulu untuk dievaluasi risikonya oleh pengguna.
- **Skenario Eksploitasi Konkret Wajib Disertakan:** Jangan sekadar menyebut nama celah; jelaskan mekanisme bagaimana penyerang dapat menyalahgunakan kerentanan tersebut.
- **Precision Slicing:** DILARANG membaca file utuh (> 50 baris) dengan `view_file`. Gunakan pencarian pola AST dan call graph untuk melacak taint path.
- **Zero Raw Byte Secret Leaks:** Jangan menduplikasi token rahasia nyata yang ditemukan ke dalam konteks percakapan. Sensor nilainya (*masking*).

---

## MCP Suite Routing

| Target Audit Keamanan | Tool Utama | Metode Penyelidikan |
|---|---|---|
| **Frontend & XSS Patterns** | `strata-mcp` | Gunakan `find_code` untuk memindai pola AST injeksi HTML/DOM seperti `v-html`, `dangerouslySetInnerHTML`, `innerHTML`, atau binding URL tanpa sanitasi (`javascript:` protocol). |
| **Backend & Taint Flow** | `codegraph` | Gunakan `codegraph_explore` untuk menelusuri *taint analysis*: alur parameter request dari controller menuju query database (SQL/NoSQL) atau pemanggilan shell command tanpa parameter binding. |
| **Secret Scanning & Audit Skrip** | `context-mode` | Jalankan skrip audit regex pola kredensial/API key atau entropy scanner di sandbox `ctx_execute` (Bun) secara aman tanpa membanjiri konteks. |
| **Threat Modeling & Severity** | `sequential-thinking` | Gunakan `sequentialthinking` untuk menganalisis vektor serangan, menilai dampak bisnis, dan menentukan tingkat keparahan (*CVSS / Severity*). |

---

## Vektor Kerentanan yang Wajib Diperiksa

1. **Injection Flaws:**
   - SQL / NoSQL Injection (string concatenation dalam query, raw query tanpa parameter binding).
   - Command / Process Injection (penggunaan `exec`, `spawn`, `eval` dengan argumen input pengguna).
2. **Broken Authentication & Authorization:**
   - **IDOR (Insecure Direct Object References):** Mengakses entitas (e.g. `/api/orders/:id`) tanpa memverifikasi kepemilikan tenant/user di sisi server.
   - Missing Middleware / Route Guards: Endpoint internal yang dapat diakses tanpa sesi valid.
   - Broken Role-Based Access Control (RBAC): User biasa dapat mengeksekusi operasi admin.
3. **Exposed Secrets & Sensitive Data:**
   - API keys, private tokens, passwords, atau JWT secret yang di-hardcode di dalam repositori kode.
   - Kebocoran PII (*Personally Identifiable Information*) atau detail stack trace di response error produksi.
4. **Input Validation & Insecure Deserialization:**
   - Payload JSON/form yang diterima langsung tanpa validasi skema (e.g. Zod, Yup, FormRequest).
   - Mass-assignment vulnerability (menyimpan `req.body` mentah ke dalam model database).
5. **Client-Side & SSR Vulnerabilities:**
   - Cross-Site Scripting (XSS): Perenderan konten input langsung ke DOM tanpa escaping.
   - Server-Side Request Forgery (SSRF): Fetching URL eksternal yang diinput pengguna tanpa whitelist IP/host.

---

## Format Output Laporan Audit Keamanan

Sajikan laporan audit keamanan dengan format standar berikut:

```markdown
### 1. Ringkasan Postur Keamanan
- Ringkasan scope audit dan profil risiko yang teridentifikasi.

### 2. Daftar Temuan Kerentanan Terstruktur

#### [CRITICAL / HIGH / MEDIUM / LOW] Nama Kerentanan (misal: IDOR pada Update Profile)
- **Lokasi:** [`profileController.ts:L34-L48`](file:///path/to/profileController.ts#L34-L48)
- **Kategori:** e.g. Broken Access Control / Insecure Direct Object Reference
- **Skenario Eksploitasi Konkret:**
  Jelaskan langkah demi langkah bagaimana penyerang (misal: User A dengan ID 10) dapat mengirim request khusus untuk membaca/mengubah data milik User B (ID 11).
- **Tingkat Keparahan & Alasan:**
  Mengapa kerentanan ini masuk kategori tersebut (dampak kerahasiaan data, integritas sistem, atau kemudahan eksploitasi).
- **Rekomendasi Remediasi:**
  Solusi perbaikan teknis konkret (e.g. scoping query terhadap `auth()->user()->id`, validasi schema Zod, parameter binding).

### 3. Checklist Rekomendasi Hardening
- Langkah-langkah pencegahan tambahan untuk mencegah kelas kerentanan serupa di masa depan.
```
