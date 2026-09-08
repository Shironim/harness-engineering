# Pencil JS DSL Specification & Styling Reference

This reference documents the syntax, core functions, vector icons, stroke styling, typography attributes, design libraries, and atomic tree construction patterns for Pencil's `batch_design` execution sandbox.

---

## 1. Core DSL Functions & Signatures

Execute JavaScript statements ending with `;` inside `batch_design`:

| Function | Signature | Description & Verified Syntax |
|---|---|---|
| `Insert` | `Insert(parentId, dataObject)` | Inserts a new node or nested tree. `parentId` must be `"root"` for top-level canvas frames, or an existing generated node ID string (e.g. `Insert("PZE35", { ... })`). |
| `Update` | `Update(nodeId, updatesObject)` | Modifies properties of an existing node by its ID without removing child nodes. E.g. `Update("Tq8Di", { name: "VIP Announcement Bar" });`. |
| `Delete` | `Delete(nodeId)` | Permanently removes node by its ID. E.g. `Delete("SZbP0");`. |
| `SetVariables` | `SetVariables({ varName: { type: "color", value: "#HEX" } })` | Sets document-wide design tokens / variables. **MUST** use object shape `{ type: "color", value: "#HEX" }`. |

---

## 2. Design Libraries & Reusable Components (`type: "ref"`)

When design libraries (e.g. Shadcn UI, Material Design, UI Kit components) are present in a `.pen` file, `get_editor_state` lists them under `### Reusable Components` with an ID prefix (e.g., `E:VSnC2` for `Button/Default`, `E:UjXug` for `Badge/Default`).

To instantiate a reusable component from a library via `batch_design`:

```javascript
Insert("target_parent_id", {
  type: "ref",
  ref: "E:VSnC2", // Component ID from get_editor_state Reusable Components list
  // Optional descendant overrides:
  descendants: {
    "descendant_id": { content: "Submit Order" }
  }
});
```

---

## 3. Verified `batch_design` Examples

### A. Inserting Frame Tree (`Insert`) — Recommended Declarative Tree Pattern
```javascript
Insert("root", {
  name: "Fashion Landing Page",
  type: "frame",
  x: 4560,
  y: 0,
  width: 1440,
  height: 1080,
  fill: "#0B0B0C",
  layout: "vertical",
  gap: 0,
  children: [
    {
      name: "Announcement Bar",
      type: "frame",
      width: "fill_container",
      height: 40,
      fill: "#18181B",
      stroke: "#27272A",
      strokeWidth: 1,
      layout: "horizontal",
      justifyContent: "center",
      alignItems: "center",
      gap: 16,
      children: [
        {
          type: "text",
          content: " EXCLUSIVE AUTUMN DROP",
          fontSize: 12,
          fontWeight: "600",
          fill: "#E2C08D"
        }
      ]
    }
  ]
});
```

### B. Updating Existing Node (`Update`)
```javascript
Update("Tq8Di", {
  name: "VIP Announcement Bar",
  opacity: 0.95
});
```

### C. Setting Global Design Tokens (`SetVariables`)
```javascript
SetVariables({
  primaryGold: { type: "color", value: "#E2C08D" },
  bgDark: { type: "color", value: "#0B0B0C" }
});
```

### D. Deleting Node (`Delete`)
```javascript
Delete("SZbP0");
```

---

## 4. Lucide Vector Icons

Insert native Lucide vector icons without external SVG assets:

```javascript
Insert("target_parent_id", {
  type: "icon",
  library: "lucide",       // 'lucide', 'feather', 'Material Symbols Outlined'
  icon: "sparkles",        // Lucide icon name: 'search', 'heart', 'shopping-bag', 'layers', 'truck', 'shield-check'
  width: 24,
  height: 24,
  fill: "#E2C08D"
});
```

---

## 5. Granular Stroke & Border Control

Pencil supports uniform and direction-specific stroke widths:

```javascript
// Uniform border (strokeWidth is required for stroke to render visibly):
stroke: "#27272A",
strokeWidth: 1,

// Direction-specific border dividers:
stroke: "#1F1F24",
strokeWidth: { top: 1, bottom: 1 },

// Bottom-only border:
stroke: "#1F1F24",
strokeWidth: { bottom: 1 }
```

---

## 6. Typography & Text Wrapping Controls

When rendering text nodes (`type: "text"`):

```javascript
{
  type: "text",
  content: "REDEFINING MODERN LUXURY & SILHOUETTE.", // Mandatory 'content' property
  fontSize: 32,
  fontWeight: "bold",        // 'normal' | '500' | '600' | 'bold'
  fill: "#FFFFFF",
  textGrowth: "fixed-width", // For multiline text wrapping
  width: 620,                // Explicit numeric width or "fill_container"
  letterSpacing: -0.5
}
```

---

## 7. Parser Syntax Rules Checklist

Before calling `batch_design`, verify every item in this checklist:

- [ ] **First Argument**: `Insert` has `"root"` or a valid generated parent ID string as 1st argument.
- [ ] **Text Content**: Every text node uses `content: "..."` (NEVER `text: "..."`).
- [ ] **SetVariables Syntax**: `SetVariables` uses `{ varName: { type: "color", value: "#HEX" } }`.
- [ ] **Ref Syntax**: Instantiating library component uses `{ type: "ref", ref: "E:ID" }`.
- [ ] **No JS Comments**: No `//` single-line comments in the string payload.
- [ ] **Exact camelCase**: `justifyContent`, `alignItems`, `textGrowth`, `strokeWidth`.
- [ ] **Strict Enum Values**:
  - `justifyContent`: `"start"` | `"center"` | `"end"` | `"space_between"` | `"space_around"`
  - `alignItems`: `"start"` | `"center"` | `"end"` (Never `"baseline"` or `"stretch"`)
  - `layout`: `"none"` | `"vertical"` | `"horizontal"`
  - `textGrowth`: `"auto"` | `"fixed-width"` | `"fixed-width-height"`
