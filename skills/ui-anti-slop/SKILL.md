---
name: ui-anti-slop
description: High-density anti-AI-slop checklist for UI design. Final pre-ship quality pass to eliminate generic LLM tropes and enforce frontend craft standards.
---

# UI Anti-Slop Checklist

> Pre-ship quality gate. A single failed `[BAN]` rule blocks release. Brief instructions override general rules.

---

## GOAL & CONSTRAINTS

### Core Goals
- Enforce strict quantitative thresholds for typography, color, layout, motion, and accessibility.
- Eliminate generic LLM tropes (AI purple gradients, Inter defaults, triple feature cards, filler copy).
- Provide a high-density, zero-fluff checklist for rapid validation.

---

## Tipografi

- `[BAN]` Font utama generik (`Inter`, `Roboto`, `Fraunces`, `Playfair`, `Space Grotesk`) -> Gunakan `Geist`, `Satoshi`, `Cabinet Grotesk`, `Outfit`.
- `[BAN]` Italic serif oversized di headline hero, serif tanpa konteks editorial/luxury, dan Em-dash (`—`/`–`) di mana pun (hanya gunakan `-`).
- `[CEK]` Body copy measure 45–75ch (ideal 65–75ch), line-height >= 1.3 (ideal 1.5–1.7), `text-wrap: balance` pada heading.
- `[CEK]` Display tracking -0.02em s.d. -0.04em (body text tidak wide > 0.05em), skala font step >= 1.25.
- `[CEK]` Body mobile >= 16px (min 11px fungsional), hero headline <= 2 baris, subtext <= 20 kata.

---

## Warna

- `[BAN]` Palette ungu/violet + cyan-on-dark (AI purple/blue glow), default beige/cream (`#f5f1ea`), gradient pada teks, dan chromatic glow halo.
- `[BAN]` Pure black `#000000` (gunakan off-black/zinc-950/charcoal).
- `[CEK]` Maksimal 1 aksen (saturation < 80%), WCAG AA contrast (body >= 4.5:1, UI control/large text >= 3:1).
- `[CEK]` Lock konsistensi warna aksen di seluruh halaman & sediakan dark mode eksplisit (bukan invert mekanis).

---

## Layout

- `[BAN]` 3 kartu fitur sama besar, eyebrow/kicker di atas headline (max 1 per 3 section), nested cards, `h-screen` (gunakan `min-h-[100dvh]`).
- `[BAN]` Split-header default (headline kiri + paragraf kanan) -> gunakan stack vertikal.
- `[CEK]` Variasi layout: zigzag max 2x berurutan, bento grid tanpa cell kosong, logo wall di bawah hero, hero top padding <= pt-24.
- `[CEK]` Navigasi 1 baris (tinggi <= 80px), spacing scale 4-unit (ruang atas heading > bawah), padding container mobile >= 16px.

---

## Motion

- `[BAN]` `ease-in` pada UI, bounce/elastic easing sebagai refleks, `transition: all`, entry `scale(0)` (mulai `scale(0.95)` + `opacity: 0`).
- `[BAN]` Animasi layout properties (`width`, `height`, `top`, `margin`) -> gunakan `transform` + `opacity` saja.
- `[BAN]` Scroll listener di window (`window.addEventListener("scroll")`) -> gunakan `IntersectionObserver` / CSS `animation-timeline`.
- `[CEK]` Durasi UI < 300ms (button 100–160ms, popover 125–200ms, modal 200–500ms), easing curve `cubic-bezier(0.23, 1, 0.32, 1)`.
- `[CEK]` Pressed feedback (`scale(0.97)`), stagger entrance 30–80ms, dan penanganan `prefers-reduced-motion`.

---

## Copy & Content

- `[BAN]` Filler verbs (*Elevate*, *Seamless*, *Unleash*, *Next-Gen*, *Revolutionize*, *Transformative*, *Unlock*, *Supercharge*).
- `[BAN]` Nama palsu (*John Doe*, *Acme*, *NovaCore*), angka/metrik palsu (*99.99%*, *$100.00* -> gunakan data nyata/mock label), dan micro-meta labels.
- `[BAN]` Version labels di hero (`V0.6`, `BETA`), scroll cues (mouse bounce, tanda panah bawah), dan "Oops!" error messages.
- `[CEK]` CTA 1–3 kata (1 baris, intent tidak duplikat), quote <= 3 baris (sentence case), middle-dot (`·`) max 1 per baris.

---

## States & Performance

- `[CEK]` Loading state menggunakan skeleton matching layout, empty state terstruktur jelas (bukan spinner generik).
- `[CEK]` Focus ring jelas, touch target >= 44x44px (web/iOS) / >= 48x48dp (Android).
- `[CEK]` Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1, gambar WebP/AVIF (kompresi 80–85%).
- `[CEK]` Bounded verification: 1 putaran build & inspeksi desktop/mobile -> perbaiki -> konfirmasi -> selesai.
