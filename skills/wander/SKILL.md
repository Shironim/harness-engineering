---
name: wander
description: Fetch external web content from URLs, synthesize simple digests, and create continuous learning exploration maps. Use when asked to read web links, digest external articles, or explore related topics via /wander.
---

# Skill: Wander (`/wander` / `wander`)

> **Rationale**: Membaca tautan/URL eksternal, mengekstrak esensi materi dalam bahasa yang intuitif dan komunikatif, serta menyediakan **Peta Eksplorasi Lanjutan (Wandering Map)** agar proses pembelajaran pengguna tidak terhenti di satu artikel saja.

---

## GOAL & CONSTRAINTS

### Core Goals
- Fetch and extract main article content from external URLs using `read_url_content` or `search_web`.
- Explain complex concepts using plain language, key takeaways, and simple real-world analogies.
- Construct a continuous "Wandering Map" (Prerequisites, Deep Dives, Adjacent Topics) to guide follow-up learning.
- Write and persist structured digests to `docs/wander/[slug-topik].md`.

---

## OUTPUT DOCUMENT CONTRACT (`docs/wander/[slug].md`)

Setiap kali skill `wander` dipanggil, buat dan simpan hasilnya di file `docs/wander/[slug].md` mengikuti templat persis berikut:

```markdown
# Wander Digest: [Judul Artikel / Topik]

> **Sumber Original**: [Judul Halaman](URL)  
> **Kategori**: [Teknologi / Sains / Bisnis / Architecture]  
> **Tanggal Wander**: YYYY-MM-DD  

---

## Ringkasan Eksekutif (TL;DR)
[Penjelasan singkat 2-3 kalimat mengenai esensi artikel]

---

## Konsep Inti (Dengan Analogi)
- **[Konsep 1]**: [Penjelasan mudah + analogi sederhana dari dunia nyata]
- **[Konsep 2]**: [Penjelasan mudah + analogi sederhana dari dunia nyata]

---

## Poin-Poin Kunci (Takeaways)
- [Poin Kunci 1]
- [Poin Kunci 2]
- [Poin Kunci 3]

---

## Peta Eksplorasi Lanjutan (Wandering Map)
Ingin menjelajah lebih jauh? Berikut arah eksplorasi yang direkomendasikan:

1. **Prasyarat (Fondasi)**: `[Topik Fondasi]` — [Mengapa fondasi ini perlu dipahami]
2. **Deep Dive**: `[Sub-topik Spesifik]` — [Apa yang akan dipelajari di sub-topik ini]
3. **Adjacent Topic**: `[Topik Terkait]` — [Korelasinya dengan topik utama]

 *Ketik link baru atau beri tahu aku topik mana di atas yang ingin kamu bedah berikutnya!*
```

---

## DON'T DO / ANTI-PATTERNS (Negative Cases)

- **No Raw Un-Synthesized HTML Dumps**: NEVER dump unformatted raw text directly from `read_url_content` into conversation memory.
- **No Dead-End Digests**: Do NOT omit the "Wandering Map" section. Every digest MUST recommend follow-up exploration directions.
- **No Omitted File Persistence**: Do NOT present output solely in chat; always save the output to `docs/wander/[slug].md`.
