# UI Page Specifications Template Guide

Panduan referensi ini memuat struktur template standar untuk penyusunan dokumen `docs/ui-page-references.md`.

---

## Document Structure Template

```markdown
# UI Page Specifications & Component Blueprint

## 1. Global Context & State Management Strategy
- **Pinia Stores**: [Daftar Store & State]
- **Composables**: [Daftar custom composables]
- **Reusable Components Matrix**: [Tabel komponen reusable]

## 2. Page Specifications Blueprint
### Page 1: [Nama Halaman]
- **Route**: `/example`
- **Access Level**: Public / Authenticated / Admin
- **Core Intent**: [Tujuan utama halaman]
- **Data & Action Capabilities**:
  - View / Data: [Informasi yang ditampilkan]
  - User Actions: [Aksi yang bisa dilakukan user]
- **Component Palette**:
  - Shadcn Primitives: `Button`, `Dialog`, `Table`, dll.
  - Reusable Components: `AppHeader`, `DataTableFilter`, dll.

## 3. Traceability & API Mapping
- `GET /api/v1/resource` -> Digunakan di `DataTable`
- `POST /api/v1/resource` -> Digunakan di Modal Form
```
