---
name: to-ui-spec
description: Transform Task Briefs (docs/brief/*.md) or API references (api-reference.md) into UI Page Specifications and Shadcn Component Blueprints. Use when asked to generate UI page blueprints, map frontend components from briefs/APIs, or construct ui-page-references.md.
---

# Skill: `to-ui-spec` (UI Architecture & Component Mapper)

> **Rationale**: Menerjemahkan Task Brief (`docs/brief/*.md`) atau Dokumen API (`api-reference.md`) menjadi satu dokumen **UI Page Specifications & Component Blueprint (`docs/ui-page-references.md`)** sebelum koding komponen UI dimulai. Hal ini memastikan pemetaan rute, state management global, reusable components matrix, dan komponen Shadcn resmi terencana dengan matang.

---

## GOAL & CONSTRAINTS

### Core Goals
- Map user journeys, page routes, and access levels from Task Briefs or API documentation.
- Query MCP `shadcn` / `shadcn-vue` to select official component names and sub-component anatomy primitives.
- Publish `docs/ui-page-references.md` as the authoritative Single Source of Truth for frontend implementation.

---

## OUTPUT DOCUMENT CONTRACT (`docs/ui-page-references.md`)

Setiap kali skill ini dipanggil, buat dan simpan cetak biru UI di file `docs/ui-page-references.md` mengikuti templat persis berikut:

```markdown
# UI Page Specifications & Component Blueprint

> **Source Input**: [`docs/brief/feature-example.md`](docs/brief/) / `api-reference.md`  
> **Status**: [Draft | Ready for Implementation]  

---

## Global Context & State Management Strategy
- **Global Stores**: `useUserStore`, `useAuthStore` (Pinia / Zustand)
- **Composables / Custom Hooks**: `useTablePagination`, `useFormValidation`
- **Reusable Components Matrix**:
  | Component Name | Category | Primary Purpose | Base Primitives |
  |---|---|---|---|
  | `AppHeader` | Layout | Navigation & user profile menu | `NavigationMenu`, `DropdownMenu` |
  | `DataTableFilter` | Feature | Filtering table records | `Input`, `Select`, `Button` |

---

## Page Specifications Blueprint

### Page 1: [Nama Halaman]
- **Route**: `/dashboard/users`
- **Access Level**: Authenticated (Role: Admin)
- **Core Intent**: Mengelola daftar pengguna sistem dan mengubah peranan akses.
- **Data & Action Capabilities**:
  - **View / Data**: Tabel pengguna (Nama, Email, Role, Status), Total counter.
  - **User Actions**: Tambah User baru, Edit Role via Modal, Non-aktifkan User.
- **Component Palette**:
  - **Shadcn Primitives**: `Table`, `TableHeader`, `TableRow`, `TableCell`, `Dialog`, `DialogContent`, `Form`, `Badge`, `Button`.
  - **Reusable Components**: `AppHeader`, `DataTableFilter`.

---

## Traceability & API Mapping
- `GET /api/v1/users` $\rightarrow$ Consumed by `DataTable` in `/dashboard/users`
- `POST /api/v1/users` $\rightarrow$ Consumed by `AddUserModal` form
- `PATCH /api/v1/users/:id/role` $\rightarrow$ Consumed by Role Edit Dropdown
```

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Invented Component Names**: Dilarang mengarang nama komponen UI jika ada nama resmi dari MCP `shadcn` (contoh: gunakan `DialogContent` bukan `ModalBody`).
- **No Direct Coding Before Spec Approval**: Jangan langsung menulis kode komponen `.vue` / `.tsx` sebelum cetak biru `ui-page-references.md` dipublikasikan.
- **No Duplicate State Owners**: Jangan menduplikasi state bisnis di local component `ref()` jika sudah dikelola oleh Pinia / Zustand store global.
- **No Unmapped API Endpoints**: Setiap aksi user pada cetak biru UI WAJIB terpetakan ke endpoint API yang relevan.
