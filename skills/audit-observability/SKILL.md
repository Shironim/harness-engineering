---
name: audit-observability
description: Audit and enforce observability readiness (Logs, Metrics, Traces) across API endpoints, functions/classes, data flows, and external boundaries using the 4-MCP architecture.
---

# `audit-observability` — Codebase Observability & Telemetry Readiness Audit

> **Prinsip Utama:** *Observability is code-level engineering, not just infra setup.* Sistem harus dapat diobservasi dari luar tanpa membuka shell server atau menduga alur kegagalan. Audit ini membedah 3 pilar observability (**Logs**, **Metrics**, **Traces**) di setiap level abstraksi kode (endpoint, service layer, query DB, hingga third-party call) secara non-destruktif[cite: 2].

---

## Kapan Wajib Menggunakan (Trigger Moments)

Gunakan skill ini saat:
1. Memeriksa kesiapan produksi (*production readiness*) modul, endpoint, atau microservice.
2. Mengaudit apakah logging di fungsi kritis informatif (menangkap context, input, output, dan status failure) atau justru *empty catch/swallowed error*[cite: 2].
3. Memastikan adanya instrumentasi tracing lintas-boundary (HTTP call antar-service, database queries, message broker).
4. Mengevaluasi metrik runtime aplikasi (RPS, latency histogram, database pool/query time, error rates).

---

## Guardrails & Batasan Investigasi

- **Read-Only / Non-Destructive:** Dilarang mengedit atau menambahkan logging/otel SDK secara terburu-buru sebelum laporan checklist selesai diverifikasi[cite: 2].
- **2–3 Tool Call Quota:** Investigasi codebase wajib tuntas dalam 2–3 pemanggilan tool terencana via 4-MCP protocol (tanpa blind looping via `grep_search` atau `view_file` manual)[cite: 3].
- **Sanitasi Data Sensitif (PII Guard):** Validasi bahwa payload request/response yang dicatat ke logger **tidak membocorkan data rahasia** (password, API keys, personal token, detail kartu kredit).
- **Format Output Ringkas:** Jika menggunakan `context-mode` (`ctx_execute`), skrip wajib memfilter dan mereduksi output menjadi ringkasan $\le 40$ baris[cite: 2, 3].

---

## 3 Pilar Observability Checklist

Setiap titik inspeksi (Endpoint $\rightarrow$ Controller $\rightarrow$ Service/Class $\rightarrow$ DB/I/O) diaudit berdasarkan parameter:

### 1. Structured Logging (Event & Context)
- **Life-Cycle Logging:** Apakah ada log penanda saat request masuk, transisi validasi, mutasi data, dan respons dikembalikan?
- **Context Enrichment:** Apakah log menyertakan identitas request (`requestId`, `traceId`, `userId`, `tenantId`, atau `route`) agar mudah difilter di Log Management?
- **Structured Format:** Log berbentuk format terstruktur (JSON/key-value) vs raw unstructured string print (`console.log`, `print_r`, `echo`).
- **Failure Transparency:** Blok error/catch mencatat stack trace, root cause error message, dan parameter input penyebab kegagalan (tanpa membocorkan PII).

### 2. Application & Business Metrics (State & Health)
- **Golden Signals:** Pengukuran latency/duration (histogram/timer), traffic/throughput (RPS/counter), error rate, dan saturasi resource.
- **Database & I/O Metrics:** Pencatatan query execution time, connection pool stats, atau queue backlog size.
- **Business Counter:** Metrik indikator domain (misal: `orders_created_total`, `payment_failures_total`).

### 3. Distributed Tracing & Propagation (Data Journey)
- **Trace Context Propagation:** Apakah distributed context (`traceparent`, W3C trace context, OpenTelemetry carrier) diteruskan saat memanggil third-party API atau service downstream?
- **Span Granularity:** Apakah operasi berat (database queries, RPC calls, heavy computational tasks) dibungkus ke dalam child span terpisah?
- **Span Status & Attributes:** Span ditandai error saat terjadi exception dan diberi atribut kontekstual (HTTP method, status code, query target).

---

## MCP Investigation Suite Routing

| Domain Investigasi | Tool Utama | Skill Panduan | Metode Penyelidikan |
|---|---|---|---|
| **Perumusan Hipotesis** | `sequential-thinking` | `use-sequential-thinking` | Merumuskan prioritas flow data kritis (misal: endpoint transaksi, checkout, integrasi payment)[cite: 1, 3]. |
| **Call Graph & AST Tracing** | `codegraph` | `use-codegraph` | Menelusuri endpoint controller $\rightarrow$ service class $\rightarrow$ database/external call untuk mendeteksi gap logging/tracing di sepanjang alur[cite: 3]. |
| **Bulk Scan Pattern** | `context-mode` | `use-context-mode` | Menjalankan batch scan via Bun sandbox (`ctx_execute`) untuk mendeteksi: unhandled `catch`, raw `console.log/print`, import OpenTelemetry/logger facade, dan middleware tracing[cite: 2, 3]. |

---

## Format Laporan Audit Observability

Sajikan hasil audit menggunakan format baku berikut:

### 1. Observability Scorecard
| Layer / Alur Data | Logs Readiness | Metrics Readiness | Traces Readiness | Status |
|---|---|---|---|---|
| **Ingress / Route Middleware** | ✅ / ⚠️ / ❌ | ✅ / ⚠️ / ❌ | ✅ / ⚠️ / ❌ | Pass / Needs Work |
| **Business Logic (Service/Class)** | ✅ / ⚠️ / ❌ | ✅ / ⚠️ / ❌ | ✅ / ⚠️ / ❌ | Pass / Needs Work |
| **Data Access Layer (ORM/DB)** | ✅ / ⚠️ / ❌ | ✅ / ⚠️ / ❌ | ✅ / ⚠️ / ❌ | Pass / Needs Work |
| **External Integration / HTTP** | ✅ / ⚠️ / ❌ | ✅ / ⚠️ / ❌ | ✅ / ⚠️ / ❌ | Pass / Needs Work |

### 2. Temuan Gap & Risiko Trouble-shooting
Kelompokkan temuan berdasarkan tingkat keparahan:
- **CRITICAL (Blind Spot)**: Alur data/transaksi kritis tidak memiliki log error, menelan exception tanpa trace, atau menyebabkan sistem crash tanpa rekam jejak sama sekali.
- **MEDIUM (Investigation Friction)**: Log hanya berupa string mentah tanpa context (`requestId`/`userId`), hilangnya child span pada slow queries, atau ketiadaan metrik latency endpoint.
- **LOW (Hygiene / Optimization)**: Format timestamp inkonsisten, duplikasi log level debug di production, atau log noise berlebih.

Untuk setiap temuan berikan:
- **Lokasi Kode:** Link markdown baris kode (`file:///path/to/file#L15-L30`)[cite: 2].
- **Blind Spot Analysis:** Kesulitan apa yang dihadapi developer saat insiden terjadi di fungsi/baris ini.
- **Rekomendasi Implementasi:** Contoh snippet instrumentasi yang disarankan (Structured Log, OTel Span, atau Metric Counter).