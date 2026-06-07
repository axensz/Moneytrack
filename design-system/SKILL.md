---
name: moneytrack-design
description: Use this skill to generate well-branded interfaces and assets for MoneyTrack, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation
- `styles.css` — link this one file to get every token and the `.mt-*` utility classes.
- `tokens/` — colors (violet primary, warm off-white canvas, semantic green/rose/amber/blue, light + dark), typography (system font stack, tabular money figures), spacing/radii/shadows/motion.
- `components/` — React primitives (`Button`, `Badge`, `Card`, `Input`/`Select`, `StatCard`, `TransactionRow`). Read each `.prompt.md` for usage.
- `ui_kits/moneytrack/` — a full interactive app recreation to copy patterns from.
- `assets/` — logo / app icons.

## Brand in one breath
Spanish (es-CO), Colombian pesos (`$ 1.250.000`). One vibrant **violet `#7C3AED`** accent on a **warm off-white `#FAF9F7`** canvas. Green = income, rose = expense, amber = pending, blue = transfer. Rounded-xl cards, soft layered shadows, 44px touch targets, **Lucide** icons, no emoji. The balance figure always rides a violet gradient card. Informal "tú" voice, short verb/noun labels.
