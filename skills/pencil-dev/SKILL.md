---
name: pencil-dev
description: Workflow and interaction skill for Pencil.dev (pen.dev) design-as-code files. Use when asked to inspect .pen design files, modify Pencil canvas nodes via Pencil MCP tools, or export .pen layouts to React/Tailwind code.
version: 2.1.0
---

# Skill: `pencil-dev` (Pencil.dev Design-as-Code Workflow)

> **Rationale**: `.pen` design files are binary/DSL files managed by Pencil.dev. **Never use standard file reading tools (`view_file`, `grep_search`) on `.pen` files.** Access, inspect, and modify `.pen` design files EXCLUSIVELY via `pencil` MCP tools (`call_mcp_tool`).

---

## GOAL & CONSTRAINTS

### Core Goals
- Manage Pencil `.pen` canvas nodes exclusively via `pencil` MCP tools.
- Implement Two-Pass Node Inspection (`snapshot_layout` + `batch_get`) for minimal token consumption (~200 tokens per frame).
- Construct robust, atomic declarative node trees with zero validation rollbacks.
- Export visual canvas nodes into clean React / Tailwind CSS code accompanied by an 8-state preview wrapper.

---

## PENCIL MCP TOOL ARSENAL & EMPIRICAL PARAMETERS

| MCP Tool Name | Required Arguments | Purpose & Return Format |
|---|---|---|
| `get_editor_state` | `include_schema: true/false` | Read active `.pen` canvas state, active path, and **Reusable Component Library List** (`E:ID`). |
| `snapshot_layout` | `filePath: "..."` (**REQUIRED**) | Get spatial layout tree & bounding boxes (`x, y, w, h`). Lightweight diagnostic (~100 tokens). |
| `batch_design` | `filePath: "..."`, `input: "..."` (**REQUIRED**) | Execute JS DSL statements (`Insert`, `Update`, `Delete`, `SetVariables`, `type: "ref"`). |
| `export_html` | `filePath: "..."`, `nodeIds: ["ID"]`, `outputPath: "..."` | Export selected nodes to HTML/CSS. **CRITICAL**: Parameter is `nodeIds` (Array of strings). |
| `get_screenshot` | `filePath: "..."`, `nodeId: "..."` | Capture visual PNG screenshot artifact of target node for visual QA inspection. |
| `batch_get` | `filePath: "..."` (**REQUIRED**) | Fast structural search returning node tree array with child truncation. |

---

## EMPIRICAL DSL SYNTAX RULES & COMPONENT INSTANTIATION

### Verified `batch_design` DSL Rules

1. **Text Node Property Name (`content`)**:
   - **CRITICAL**: Text nodes MUST use `content: "..."`. NEVER use `text: "..."`. Pencil strictly rejects `text` with `Invalid properties: /text unexpected property, got "text"`.
   ```javascript
   //  BENAR
   { type: "text", content: "Tombol Checkout", fontSize: 14, fontWeight: "bold", fill: "#0F172A" }
   //  SALAH (Menyebabkan error rollback)
   { type: "text", text: "Tombol Checkout", fontSize: 14 }
   ```

2. **`alignItems` Strict Enum (`"start" | "center" | "end"`)**:
   - Pencil DSL HANYA menerima 3 nilai enum: `"start"`, `"center"`, `"end"`.
   - **DILARANG** menggunakan `"baseline"` atau `"stretch"` (akan menyebabkan immediate transaction error & rollback).

3. **Atomic Declarative Tree Construction via Nested `children: [...]`**:
   - Pencil secara otomatis menghasilkan random ID unik untuk setiap node baru dan menimpa ID kustom manual.
   - **Best Practice**: Bangun seluruh hirarki artboard dan sub-komponen bersarang langsung di dalam array `children: [...]` pada satu pemanggilan `Insert("root", { ... })`. Hindari pemanggilan `Insert` sekuensial bertingkat yang bergantung pada ID buatan sendiri.

4. **Padding Schema (Uniform Number vs 4-Direction Object)**:
   - Nilai seragam: `padding: 24` atau `padding: 0`.
   - Nilai berbeda per sisi: Wajib menggunakan object 4 arah lengkap `{ top: N, right: N, bottom: N, left: N }`.
   - **DILARANG** menggunakan string CSS seperti `padding: "16px 24px"`.

5. **Width & Height Sizing (`"fill_container"` vs Numerical Dimensions)**:
   - **Root Artboard**: Wajib mendefinisikan posisi koordinat absolut `x`, `y` serta dimensi numerik `width: 1440`, `height: 1120`.
   - **Child Elements**: Dapat menggunakan `width: "fill_container"` atau `height: "fill_container"` di dalam frame auto-layout (`layout: "vertical"` / `layout: "horizontal"`).

6. **Font Weight Values**:
   - Menerima keyword standar (`"bold"`, `"normal"`), semantic weight (`"medium"`, `"semibold"`), maupun string numerik (`"500"`, `"600"`, `"700"`).

7. **Border / Stroke (`stroke` + `strokeWidth`)**:
   - Wajib menyertakan `strokeWidth: 1` setiap kali mendefinisikan `stroke: "#CBD5E1"` agar garis tepi di-render di kanvas.

8. **Shadow & Elevation via `effect`**:
   - Schema efek bayangan:
   ```json
   effect: {
     type: "shadow",
     shadowType: "outer",
     offset: { x: 0, y: 2 },
     blur: 6,
     spread: 0,
     color: "#0F172A0D"
   }
   ```

9. **No Single-Line Comments (`//`)**:
   - Jangan pernah menyertakan komentar satu baris `//` di dalam string `input` yang dikirim ke `batch_design`.

10. **`SetVariables` Schema**:
    - Wajib menggunakan object schema: `SetVariables({ varName: { type: "color", value: "#HEX" } })`.

---

### Reusable Component Instantiation (`type: "ref"`)
Untuk memanggil komponen dari registered library (`E:ID` dari `get_editor_state`):
```javascript
Insert("parent_node_id", {
  type: "ref",
  ref: "E:LIBRARY_COMPONENT_ID",
  descendants: {}
})
```

---

## TWO-PASS INSPECTION & 8-STATE PREVIEW CONTRACT

### Two-Pass Node Inspection Protocol (Token Economy)
1. **Pass 1 — Spatial Diagnostics (`snapshot_layout`)**: Memetakan bounding boxes dan layout flow (`flex`/`grid`).
2. **Pass 2 — Token Inspection (`batch_get`)**: Mengambil detail token warna (`fill`, `stroke`) dan konten teks.

### State Component Output Contract
Saat meng-export komponen UI:
1. **Component Code**: `<ComponentName>.tsx` atau `.vue` menggunakan design tokens.
2. **8-State Demo Wrapper**: `<ComponentName>.preview.html` me-render 8 state interaktif stacked secara vertikal:
   - `default` · `hover` (`.is-hover`) · `focus` (`.is-focus`) · `active` (`.is-active`) · `disabled` · `loading` · `error` · `success`.

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No `text` Property on Text Nodes**: JANGAN gunakan `text: "..."`. Gunakan `content: "..."`.
- **No `baseline` / `stretch` on `alignItems`**: JANGAN gunakan `"baseline"`. Gunakan `"start" | "center" | "end"`.
- **No CSS String on Padding**: JANGAN gunakan `padding: "12px 16px"`. Gunakan object `{ top, right, bottom, left }` atau integer.
- **No Standard File Tools on `.pen` Files**: JANGAN gunakan `view_file` atau `grep_search` pada file `.pen`.
- **No Single-Line `//` Comments in `batch_design`**: JANGAN gunakan komentar `//` dalam payload DSL.
- **No Singular `nodeId` in `export_html`**: Selalu gunakan `nodeIds: ["ID"]` (array of strings).
- **No Unapproved Asset Generation**: JANGAN jalankan `generate_image` secara otomatis tanpa persetujuan eksplisit pengguna.
