# `.strata/graph.db` — Knowledge Graph & Database Reference

Dokumen ini menyediakan referensi teknis mendalam mengenai arsitektur, skema tabel, siklus hidup pembaruan, dan resep kueri langsung ke database relasional SQLite `.strata/graph.db` yang dikelola oleh `strata-mcp`.

---

## 1. Arsitektur & Siklus Hidup (Lifecycle)

Database `.strata/graph.db` berfungsi sebagai *knowledge graph* persisten untuk seluruh berkas frontend dan relasi dependensinya dalam proyek.

### Karakteristik Utama:
- **Mesin Penyimpanan:** SQLite lokal berkecepatan tinggi (`bun:sqlite` / `sqlite3`).
- **Lokasi Berkas:** `.strata/graph.db` di root direktori proyek (otomatis diabaikan oleh `.gitignore`).
- **Mekanisme Inkremental (`WorkspaceDelta`):**
  - Engine membandingkan `mtime`, `size`, dan hash berkas di disk terhadap catatan di tabel `files`.
  - Hanya berkas baru (*added*) atau berkas yang berubah (*modified*) yang diproses ulang oleh parser AST.
  - Berkas yang tidak berubah (*unchanged*) langsung menggunakan cache di database tanpa beban komputasi ulang (*0ms re-parse overhead*).
- **Integritas Transaksi:** Pembaruan delta dilakukan dalam satu transaksi SQLite (`BEGIN TRANSACTION ... COMMIT`) untuk menjaga konsistensi graf dependensi.

---

## 2. Skema Tabel & Kamus Data

Terdapat 5 tabel relasional utama yang saling terhubung melalui referensi `file_id`:

```
┌──────────────┐         1:N         ┌──────────────────┐
│    routes    │ ──────────────────> │      files       │
└──────────────┘                     └──────────────────┘
                                        │          │
                     ┌──────────────────┘          └──────────────────┐
                     │ 1:N                                        1:N │
                     ▼                                                ▼
             ┌──────────────┐                                 ┌──────────────┐
             │  components  │                                 │  state_deps  │
             └──────────────┘                                 └──────────────┘
                     │
                     │ (via file_id)
                     ▼
             ┌──────────────┐
             │    edges     │ (parent_file_id ──> child_file_id)
             └──────────────┘
```

### A. Tabel `files`
Menyimpan metadata dasar setiap berkas yang diindeks:
```sql
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,             -- Path relatif berkas dari root proyek
  hash TEXT NOT NULL,                    -- Hash konten untuk deteksi perubahan
  mtime REAL NOT NULL,                   -- Waktu modifikasi terakhir berkas
  size INTEGER NOT NULL,                 -- Ukuran berkas dalam bytes
  is_page INTEGER DEFAULT 0,             -- Flag: 1 jika berkas adalah page/view
  is_layout INTEGER DEFAULT 0,           -- Flag: 1 jika berkas adalah layout wrapper
  render_boundary TEXT,                  -- 'client' | 'server' | 'static'
  boundary_directive TEXT                -- e.g. 'use client', 'client:load'
);
CREATE INDEX idx_files_path ON files(path);
```

### B. Tabel `components`
Menyimpan spesifikasi kontrak antarmuka setiap komponen:
```sql
CREATE TABLE components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- Nama komponen (e.g. 'DataTableToolbar')
  contract_json TEXT,                    -- Serialisasi JSON dari ComponentContract
  UNIQUE(file_id, name)
);
CREATE INDEX idx_components_name ON components(name);
```
> **Isi `contract_json` (`ComponentContract`):**
> Menyimpan detail props (`name`, `type`, `required`, `default`), emits (`defineEmits`), slots, models (`v-model`), style tokens, dan reactivity smells yang diekstrak langsung dari AST.

### C. Tabel `edges`
Menyimpan relasi graf pemanggilan dan rendering antar-komponen (*Directed Acyclic Graph*):
```sql
CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  child_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL,             -- 'static' | 'dynamic'
  is_rendered INTEGER DEFAULT 1,         -- 1 jika komponen dirender di template/JSX
  UNIQUE(parent_file_id, child_file_id, import_type)
);
CREATE INDEX idx_edges_parent ON edges(parent_file_id);
CREATE INDEX idx_edges_child ON edges(child_file_id);
```

### D. Tabel `state_deps`
Menyimpan ketergantungan komponen terhadap state global, store, atau composables:
```sql
CREATE TABLE state_deps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                    -- 'store' | 'context' | 'composable'
  identifier TEXT NOT NULL               -- e.g. 'useCartStore', 'useAuth', 'useTheme'
);
CREATE INDEX idx_state_deps_identifier ON state_deps(identifier);
```

### E. Tabel `routes`
Menyimpan pemetaan rute URL terhadap halaman dan rantai layout:
```sql
CREATE TABLE routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_path TEXT UNIQUE NOT NULL,         -- Path rute URL (e.g. '/dashboard/orders')
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                    -- 'page' | 'endpoint'
  params_json TEXT,                      -- Parameter dinamis rute (e.g. [':id'])
  handlers_json TEXT,                    -- HTTP handlers yang didukung
  layout_chain_json TEXT                 -- Array path layout yang membungkus halaman
);
CREATE INDEX idx_routes_url ON routes(url_path);
```

---

## 3. Resep Kueri Ad-Hoc via Sandbox `ctx_execute` (Bun)

Jika membutuhkan analisis arsitektur mendalam yang belum tersedia sebagai parameter di 5 core tools MCP, kamu dapat mengeksekusi kueri SQLite langsung melalui sandbox `ctx_execute` menggunakan modul bawaan `bun:sqlite`.

### Contoh Eksekusi Dasar di `ctx_execute`:
```javascript
import { Database } from "bun:sqlite";

const db = new Database(".strata/graph.db", { readonly: true });
const results = db.query("SELECT COUNT(*) as total_files FROM files").get();
console.log(JSON.stringify(results));
db.close();
```

---

### Resep 1: Deteksi "God Components" (High Fan-Out)
Menemukan komponen yang merender terlalu banyak komponen anak (kompleksitas tinggi, calon pemecahan refactoring):
```sql
SELECT f.path, COUNT(e.child_file_id) AS total_rendered_children
FROM files f
JOIN edges e ON f.id = e.parent_file_id
WHERE e.is_rendered = 1
GROUP BY f.id
ORDER BY total_rendered_children DESC
LIMIT 10;
```

---

### Resep 2: Deteksi Komponen Kritis / High Blast Radius (High Fan-In)
Menemukan komponen dasar yang paling banyak dikonsumsi oleh komponen atau halaman lain (perubahan pada komponen ini memiliki risiko regresi tertinggi):
```sql
SELECT f.path, COUNT(e.parent_file_id) AS total_consumers
FROM files f
JOIN edges e ON f.id = e.child_file_id
GROUP BY f.id
ORDER BY total_consumers DESC
LIMIT 10;
```

---

### Resep 3: Deteksi Dead Components / Orphan Files
Menemukan berkas komponen yang bukan berstatus halaman (`is_page = 0`) dan bukan layout (`is_layout = 0`), tetapi tidak pernah diimpor atau dirender oleh berkas manapun:
```sql
SELECT f.path
FROM files f
WHERE f.is_page = 0 
  AND f.is_layout = 0
  AND f.path NOT LIKE '%.test.%'
  AND f.path NOT LIKE '%.spec.%'
  AND f.id NOT IN (SELECT DISTINCT child_file_id FROM edges);
```

---

### Resep 4: Recursive Upward Blast Radius (Dampak Lengkap Perubahan)
Melacak seluruh rantai dependensi ke atas dari suatu komponen target sampai ke halaman atau konsumen paling ujung:
```sql
WITH RECURSIVE blast_radius(file_id, depth) AS (
  -- Anchor: Komponen target awal
  SELECT parent_file_id, 1 
  FROM edges 
  WHERE child_file_id = (SELECT id FROM files WHERE path LIKE '%TargetComponent.vue%')
  
  UNION
  
  -- Recursive step: Konsumen dari konsumen
  SELECT e.parent_file_id, b.depth + 1
  FROM edges e
  JOIN blast_radius b ON e.child_file_id = b.file_id
)
SELECT DISTINCT f.path, f.is_page, MIN(b.depth) AS distance
FROM blast_radius b
JOIN files f ON b.file_id = f.id
GROUP BY f.id
ORDER BY distance ASC;
```

---

### Resep 5: Konsumen State Store / Composable Tertentu
Mengetahui semua berkas yang mengonsumsi state atau composable spesifik:
```sql
SELECT f.path, sd.kind, sd.identifier
FROM state_deps sd
JOIN files f ON sd.file_id = f.id
WHERE sd.identifier = 'useCartStore'
ORDER BY f.path ASC;
```
