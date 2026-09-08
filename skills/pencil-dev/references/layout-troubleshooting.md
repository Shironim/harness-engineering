# Pencil Layout Engine Rules & Troubleshooting

This reference documents common layout traps, circular dependency errors, collapsed frame fixes, responsive fill rules, and positioning practices when building designs in Pencil.

---

## 1. The Collapsed Frame Trap (`fit_content` Sizing)

- **Symptom**: A top-level frame initialized with `height: "fit_content"` before any child nodes are inserted collapses to `0px` height and renders invisible in screenshots.
- **Root Cause**: `fit_content` calculates bounds dynamically based on children. Empty frames have 0 children, thus 0px bounds.
- **Fix**: Always specify fixed initial dimensions (e.g. `width: 1440, height: 1120`) for root frames, OR populate all children atomically inside the same `Insert` call payload.

---

## 2. Circular Layout Dependency (`fit_content` + `fill_container` Collision)

- **Symptom**: `batch_design` issues a warning: `node 'X' uses 'fit_content' sizing on the horizontal axis while a child uses 'fill_container'`.
- **Root Cause**: The parent tries to size itself to fit its children, while the child tries to expand to fill its parent. This circular loop collapses both elements to zero width/height.
- **Fix**:
  - Parent frame **MUST** specify an explicit numeric size (e.g. `width: 1440` or `width: 760`) or use `width: "fill_container"` inside another sized container.
  - Or, children inside a `fit_content` parent must use explicit numeric widths.

---

## 3. Responsive Fill (`width: "fill_container"`)

- **Rule**: Use `width: "fill_container"` on inner sub-frames (Navbar, header rows, section containers, card footers) to automatically span 100% of the parent frame's width.
- **Caveat**: Only use `fill_container` when the parent container has a fixed numeric width or is itself set to `fill_container`.

---

## 4. Typography Safety & Text Wrapping (`textGrowth: "fixed-width"`)

- **Rule**: Multiline text (paragraphs, titles, testimonials, quotes) inside flex column/row frames must ALWAYS use `textGrowth: "fixed-width"` with explicit numeric `width` (or `width: "fill_container"`).
- **Why**: Prevents multiline text from overflowing adjacent layout columns or clipping visually in `get_screenshot`.

---

## 5. Non-Destructive Side-by-Side Canvas Positioning

- **Best Practice**: When creating a re-layout, alternative design concept, or iteration, do NOT overwrite or delete the existing frame unless requested.
- **Implementation**: Read existing top-level frame positions (`snapshot_layout`), then set the new root frame's horizontal position to `x: existing_x + existing_width + offset` (e.g., `x: 3040` next to `x: 1520`).
- **Benefit**: Enables direct side-by-side visual inspection and comparison on the Pencil canvas.
