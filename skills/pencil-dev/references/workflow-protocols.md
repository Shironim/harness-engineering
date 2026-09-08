# Standard Pencil Workflow Protocols

Detailed execution protocols for inspecting, modifying, and exporting Pencil designs.

---

## Protocol A: Canvas Inspection (Turn 1 Execution)

1. **Step 1**: Call `get_editor_state()` to inspect the active `.pen` file path, open canvas state, and registered component libraries.
2. **Step 2**: Use `snapshot_layout(filePath)` to get the bounding boxes (`x, y, w, h`) of all top-level frames and identify available canvas coordinates without token bloat (~100 tokens).
3. **Step 3**: If target `.pen` file path is unknown, locate `.pen` files in workspace using `find /home/shironim -name "*.pen"`.

---

## Protocol B: Modifying & Creating Canvas Frames (.pen Design-as-Code)

1. **Step 1**: Calculate empty canvas coordinates (`x, y`) using `snapshot_layout` to avoid overlapping existing artboards.
2. **Step 2**: Construct a declarative, atomic JS DSL tree using `Insert("root", { name: "...", type: "frame", x, y, width, height, layout, children: [...] })`.
3. **Step 3**: Execute the DSL via `batch_design(filePath, input)`.
4. **Step 4**: Note the generated root node ID returned by `batch_design` for subsequent updates or visual verification.
5. **Step 5**: If visual inspection is needed, call `get_screenshot(filePath, nodeId)` to verify alignment and typography.

---

## Protocol C: Design-to-Code Conversion (.pen → React / Tailwind)

1. Run Protocol A to inspect the active canvas node tree.
2. Call `get_screenshot(filePath, nodeId)` to visually inspect target nodes.
3. Call `export_html(filePath, nodeIds: ["ID1", "ID2"], outputPath)` to extract clean HTML/CSS representation.
4. Translate structure into production-ready React / Vue / Tailwind code.
