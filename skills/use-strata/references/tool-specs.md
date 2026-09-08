# MCP Tool Specifications & Payload Schemas

Dokumen ini memuat spesifikasi teknis lengkap, daftar argumen, batasan tipe data, serta contoh pemanggilan JSON untuk kelima core tools yang disediakan oleh server `"strata-mcp"`.

Server Identifier: `"strata-mcp"`

---

## 1. `find_code` (Pencarian Pola, Komponen, & Uji AST)

Gunakan tool ini untuk semua kebutuhan pencarian kode berbasis AST (ast-grep), pelacakan pemakaian komponen UI di template/script, atau pengujian pola AST di memori.

| Argument | Type | Requirement | Description & Rules |
|---|---|---|---|
| `path` | `string` | Optional* | Direktori atau file target pencarian (alias: `target_path`). (*Wajib jika melakukan search disk). |
| `pattern` | `string` | Optional | Pola AST ast-grep (contoh: `"ref($$$)"`, `"useRouter()"`, `"console.log($$$)"`). |
| `component` | `string` | Optional | Nama komponen target (contoh: `"OldButton"`, `"modal"`). |
| `rule_yaml` | `string` | Optional | Aturan YAML relasional ast-grep lengkap. |
| `code` | `string` | Optional | Potongan kode untuk pengujian rule in-memory atau dump CST. |
| `action` | `string` | Optional | `"search"` (default) atau `"dump_ast"` untuk melihat visualisasi CST syntax tree. |
| `language` | `string` | Optional | Hint bahasa: `"ts"`, `"js"`, `"tsx"`, `"jsx"` (default: `"ts"`). |
| `scope` | `string` | Optional | Batas pencarian komponen: `"template"`, `"script"`, atau `"both"` (default: `"both"`). |
| `output_format` | `string` | Optional | Format keluaran: `"text"` atau `"json"` (default: `"text"`). |

### Contoh Pemanggilan:

```json
// A. Pencarian Pola AST (ast-grep)
{
  "ServerName": "strata-mcp",
  "ToolName": "find_code",
  "Arguments": {
    "pattern": "const $NAME = ref($VAL)",
    "path": "./resources/js"
  }
}

// B. Audit Pemakaian Komponen Tertentu
{
  "ServerName": "strata-mcp",
  "ToolName": "find_code",
  "Arguments": {
    "component": "DataTableToolbar",
    "path": "./resources/js",
    "scope": "template"
  }
}
```

---

## 2. `inspect_component` (Inspeksi Kontrak, Irisan Fungsi, & Event Handlers)

Gunakan tool ini untuk membedah file/komponen secara mendalam tanpa harus membaca manual seluruh isi file (Zero Raw Byte Dumping).

| Argument | Type | Requirement | Description & Rules |
|---|---|---|---|
| `path` | `string` | **REQUIRED** | Path file komponen/kode target (`.vue`, `.tsx`, `.jsx`, `.astro`, `.ts`, `.js`). |
| `symbol` | `string` | Optional | Nama simbol/fungsi yang ingin diiris (misal: `"calculateTotal"`, `"handleSubmit"`). |
| `audit_events` | `boolean` | Optional | Jika `true`, mengaudit keterikatan event template Vue ke deklarasi script. |
| `output_format` | `string` | Optional | Format keluaran: `"text"` atau `"json"` (default: `"text"`). |

### Kemampuan Diagnostik Tambahan:
- **Contract Extraction**: Mengembalikan props publik, emits, slots, models (`v-model`), exposed methods, variants, dan inferred props.
- **Precision Slicing**: Mengiris badan fungsi (`symbol`) secara presisi (start line - end line) beserta nomor baris aktual & micro blast-radius.
- **Reactivity Smells Diagnostics**: Otomatis mendeteksi destrukturisasi props Vue 3 tanpa `toRefs`, mutasi langsung `props.xxx = ...`, dan alokasi inline function/object di loop render React.
- **Smart Path Resolving**: Resolusi toleran otomatis terhadap `target_path` atau root project saat menerima relative path.

### Contoh Pemanggilan:

```json
// A. Ambil Kontrak Props & Emits Publik
{
  "ServerName": "strata-mcp",
  "ToolName": "inspect_component",
  "Arguments": {
    "path": "resources/js/Components/Modal.vue"
  }
}

// B. Iris Fungsi Spesifik (Zero-Hop + Blast Radius)
{
  "ServerName": "strata-mcp",
  "ToolName": "inspect_component",
  "Arguments": {
    "path": "resources/js/Composables/useCart.ts",
    "symbol": "calculateTotal"
  }
}

// C. Audit Broken Handlers & Dead Handlers Template-to-Script
{
  "ServerName": "strata-mcp",
  "ToolName": "inspect_component",
  "Arguments": {
    "path": "resources/js/Pages/Auth/Login.vue",
    "audit_events": true
  }
}
```

---

## 3. `get_component_tree` (Pohon Hirarki & Resolusi Rute)

Gunakan tool ini untuk memetakan hubungan antar komponen, melacak blast radius ke atas, atau meresolusi pohon komponen dari URL rute.

| Argument | Type | Requirement | Description & Rules |
|---|---|---|---|
| `entry_path` | `string` | Optional* | Path file komponen/root (misal `"resources/js/App.vue"`). |
| `route` | `string` | Optional* | URL rute untuk auto-resolve ke page view (misal `"/dashboard"`, `"/orders/[id]"`). |
| `target_path` | `string` | Optional | Direktori root proyek (default: `"."`). |
| `direction` | `string` | Optional | `"downward"` (root -> children) atau `"upward"` (leaf -> consumers blast radius). |
| `max_depth` | `number` | Optional | Batas kedalaman traversal (default: `3`). |
| `alias_map` | `object` | Optional | Mapping alias path manual (misal `{"@/": "resources/js/"}`). |
| `output_format` | `string` | Optional | Format keluaran: `"text"` atau `"json"` (default: `"text"`). |

*Wajib menyertakan salah satu antara `entry_path` atau `route`.

### Fitur Props Drilling Diagnostics:
Secara otomatis mendeteksi prop yang diteruskan tembus melalui $\ge 1$ intermediate component (`propsDrilling`) lengkap dengan kedalaman dan rekomendasi refactoring (Provide/Inject / Composable / Pinia).

### Contoh Pemanggilan:

```json
// A. Pemetaan Hierarki Turun dari Rute Halaman
{
  "ServerName": "strata-mcp",
  "ToolName": "get_component_tree",
  "Arguments": {
    "route": "/activity-logs",
    "direction": "downward",
    "max_depth": 3
  }
}

// B. Pelacakan Dampak ke Atas (Upward Blast Radius)
{
  "ServerName": "strata-mcp",
  "ToolName": "get_component_tree",
  "Arguments": {
    "entry_path": "resources/js/Components/ButtonAction.vue",
    "direction": "upward"
  }
}
```

---

## 4. `trace_state` (Dampak State & Composable Call Chain)

Gunakan tool ini untuk melacak siapa yang mengonsumsi suatu state store atau composable, serta menelusuri rantai pemanggilan multi-hop.

| Argument | Type | Requirement | Description & Rules |
|---|---|---|---|
| `identifier` | `string` | **REQUIRED** | Nama identifier state (misal: `"useCartStore"`, `"useAuth"`). |
| `target_path` | `string` | Optional | Root direktori proyek (default: `"."`). |
| `depth` | `number` | Optional | Kedalaman penelusuran: `1` untuk flat consumers, `2+` untuk multi-hop call chain (default: `1`). |
| `direction` | `string` | Optional | `"consumers"`, `"dependencies"`, atau `"both"` (default: `"both"`). |
| `output_format` | `string` | Optional | Format keluaran: `"text"` atau `"json"` (default: `"text"`). |

### Contoh Pemanggilan:

```json
{
  "ServerName": "strata-mcp",
  "ToolName": "trace_state",
  "Arguments": {
    "identifier": "usePermission",
    "depth": 2,
    "direction": "consumers"
  }
}
```

---

## 5. `audit_frontend` (Audit Rute & Kode Mati)

Gunakan tool ini untuk mengevaluasi kesehatan arsitektur frontend (topologi rute, dead code, atau konsistensi design tokens).

| Argument | Type | Requirement | Description & Rules |
|---|---|---|---|
| `target_path` | `string` | Optional | Root direktori proyek (default: `"."`). |
| `target` | `string` | Optional | `"routes"`, `"dead-components"`, `"dead-state"`, `"similar-templates"`, `"design-tokens"`, atau `"all"` (default: `"all"`). |
| `prefix` | `string` | Optional | Filter prefix rute URL (misal: `"/admin"`). |
| `ignore_patterns` | `array` | Optional | Glob pattern pengecualian audit. |
| `output_format` | `string` | Optional | Format keluaran: `"text"` atau `"json"` (default: `"text"`). |

### Contoh Pemanggilan:

```json
// A. Deteksi Komponen Yatim Piatu (Dead Components)
{
  "ServerName": "strata-mcp",
  "ToolName": "audit_frontend",
  "Arguments": {
    "target": "dead-components"
  }
}

// B. Pemetaan Manifes Rute & Layouts
{
  "ServerName": "strata-mcp",
  "ToolName": "audit_frontend",
  "Arguments": {
    "target": "routes"
  }
}
```
