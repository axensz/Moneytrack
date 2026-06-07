# MoneyTrack Design System

A design system for **MoneyTrack** — a personal-finance app for tracking income, expenses, bank accounts, credit cards and recurring payments. Built with Next.js + Firebase, it works offline (localStorage) and syncs to the cloud on sign-in. The product is in **Spanish (es-CO)** and formats money in **Colombian pesos**.

This project distills MoneyTrack's real visual language — a warm off-white canvas, a single vibrant violet accent, soft rounded cards and clear income/expense semantics — into reusable tokens, components and full-screen recreations.

## Source
Reverse-engineered from the production codebase. Explore it to build higher-fidelity work:

- **GitHub:** https://github.com/axensz/Moneytrack (`main`)
- Key references: `app/styles/theme.css` (color tokens), `app/styles/components.css` (cards/buttons/inputs), `src/components/ui/Button.tsx`, `src/components/shared/StatsCards.tsx`, `src/components/views/accounts/components/AccountCard.tsx`, `src/components/views/transactions/components/TransactionItem.tsx`, `src/components/layout/Header.tsx` & `TabNavigation.tsx`.
- Icon set: **Lucide** (`lucide-react`). Charts: Recharts. AI assistant: Google Gemini.

---

## Visual Foundations

**Color.** One brand accent does all the work: **violet `#7C3AED`** (Primary), often as a `135°` gradient into `#8B5CF6`. The canvas is a **warm off-white `#FAF9F7`**, not pure white; cards sit on top in clean `#FFFFFF` with warm-grey muted fills (`#F5F4F1`). Semantics are unambiguous and consistent everywhere money appears: **green `#059669` = income**, **rose `#DC2626` = expense/gasto**, **amber `#D97706` = pending/warning**, **blue `#2563EB` = info/transfer**. Each ships with a tint-muted background for chips. Dark mode swaps to a near-black `#0A0A0A` canvas with slate `#1F2937` cards and **violet borders** (`#4C1D95`) — an unusual, brand-forward touch.

**The balance hero.** The headline money figure always rides a soft **violet gradient card** (`#F3E8FF → #E9D5FF`) with a violet-tinted shadow — the one place the system spends its accent boldly.

**Type.** A **system font stack** (Arial / Helvetica / system-ui) — chosen for instant paint and native feel, no webfont download. Mono (`Cascadia Mono` + fallbacks) is reserved for code. Money figures use **tabular numerals** so columns align. Headings are bold (700) and scale responsively (h1 28→36px). Body is `1.6` line-height for readability.

**Spacing & shape.** A 4px base scale. Cards are **`rounded-xl` (12px)**, inputs and buttons **`rounded-lg` (8px)**, badges/avatars/progress bars are **full pills**. Card padding steps up responsively 12 → 16 → 20px. Every interactive control honors a **44px touch floor** on mobile (inputs use 16px font to stop iOS zoom).

**Elevation.** Soft, low-contrast, layered shadows (`sm`/`md`/`lg`); cards default to `md` and lift to `lg` on hover. The balance card gets a special violet-tinted shadow. Borders are a quiet `#E5E5E5`, warming to a violet `#DDD6FE` on hover/focus.

**Motion.** Restrained and quick. `0.2s` ease-out on buttons/inputs, `0.3s` on theme/color transitions. Buttons **lift `-1px`** on hover and gain a deeper gradient; inputs grow a `3px` violet focus ring (`rgba(139,92,246,0.1)`). A handful of entrance keyframes (`fade-in`, `zoom-in`, `slide-in-from-bottom`) for menus and modals. No bounces, no infinite decorative loops.

**States.** Hover = subtle background fill (`muted`) or violet border + bigger shadow. Press/active = light background tint. Focus-visible = 2px violet outline. Segmented "type" buttons (Gasto / Ingreso / Transferencia) go from muted to a semantic-colored fill + `0 0 0 1px` ring when active.

**Cards.** Rounded-xl, white, 1px quiet border, soft `md` shadow. Account cards add a **left accent bar** (violet for credit, emerald for savings) and a "Principal" pill. Transaction rows are bordered, with a tinted 40px type-icon, description + account route, a signed bold amount, and a wrapping chip row.

---

## Content Fundamentals

**Language & locale.** Everything is **Spanish (Colombia)**. Currency is COP, formatted `$ 1.250.000` (dot thousands, no decimals for pesos). Dates are `es-CO` (`5 jun 2026`, day headers `mié, 5 jun 2026`).

**Voice.** Direct, plain, second-person **informal "tú"** ("Crea tu primera cuenta", "Tus datos se guardan en este dispositivo"). Labels are short nouns: *Transacciones, Cuentas, Periódicos, Préstamos, Presupuestos, Metas, Estadísticas*. Actions are verbs or short noun phrases: *Acceder, Agregar, Guardar, Cancelar, Editar, Eliminar, Importar, Unificar, Mostrar/Ocultar, Principal*.

**Tone.** Helpful and unfussy. Empty states guide rather than scold ("Crea tu primera cuenta en **Cuentas** para ver tu balance real"). Status is a single clear word: *Pendiente, Al día, Vencido, Pagado, Disponible, Con interés, 3 cuotas*.

**Casing.** Sentence case for body and buttons; **UPPERCASE + letter-spacing** only for small meta like date-group headers. Counts ride next to titles in a small violet pill.

**Emoji.** Not used in product UI. Meaning is carried by **Lucide icons** and the semantic color system, never emoji. (A `↻` glyph occasionally prefixes a recurring-payment tag.)

---

## Iconography

- **Library:** **Lucide** (`lucide-react`), the product's only icon set — clean, consistent 2px-stroke line icons. In this design system the UI kit and cards load Lucide from CDN and wrap each glyph as a React component (`ui_kits/moneytrack/icons.js`).
- **Sizing:** `16px` (sm), `18–20px` (base), `24–28px` (lg). Tab and header icons are 18–20px; transaction/account type chips put an 18px icon on a tinted 40–44px rounded square.
- **Common glyphs:** `Wallet`, `CreditCard`, `Banknote` (account types) · `TrendingUp` / `TrendingDown` (income/expense) · `ArrowRightLeft` (transfer) · `Activity`, `Repeat`, `HandCoins`, `PieChart`, `Target`, `BarChart3` (tab nav) · `Settings`, `Bell`, `LogIn/LogOut`, `Sun/Moon`, `Eye/EyeOff`, `Plus`, `Upload`, `Search`, `Edit2`, `Trash2`, `Clock`, `Check`, `Combine`, `GripVertical`.
- **No emoji, no custom pictograms.** Color + Lucide line icon = meaning.

### Logo
The mark is a deep-purple disc with an **"MT" monogram** (M in a light-violet gradient, T in white) and a small **monkey holding a gold coin**, plus a few gold sparkles — playful and memorable. The wordmark is two-tone: **Money** in violet, **Track** in foreground ink. Assets in `assets/`:

| File | Use |
|---|---|
| `assets/icon-512x512.png` / `icon-192x192.png` | App icon / favicon (raster) |
| `assets/moneytrack-icon.svg` | Full logo (SVG, has a `<text>` glyph that may not render in strict SVG viewers — prefer the PNG for previews) |
| `assets/favicon.svg` | Simplified favicon |

---

## Index / Manifest

**Foundations**
- `styles.css` — global entry point (import manifest only)
- `tokens/colors.css` — base + semantic color tokens, gradients, light & dark scopes
- `tokens/typography.css` — font stacks, type scale, weights, leading
- `tokens/spacing.css` — spacing, radii, touch targets, shadows, motion
- `tokens/base.css` — element resets + reusable `.mt-*` classes (card, btn, input, badge)

**Specimen cards** (`guidelines/`, shown in the Design System tab)
- Colors: `color-primary`, `color-neutrals`, `color-semantic`, `color-dark`
- Type: `type-scale`, `type-families`
- Spacing: `spacing-scale`, `radii-shadows`
- Brand: `brand-logo`

**Components** (`components/`)
- `core/` — `Button`, `Badge`, `Card`, `Input` + `Select`, `SegmentedControl`, `Modal` (card: `core.card.html`)
- `finance/` — `StatCard`, `TransactionRow`, `ProgressBar` (card: `finance.card.html`)
- Each has `<Name>.jsx`, `<Name>.d.ts`, `<Name>.prompt.md`. Consume via `window.MoneyTrackDesignSystem_daa395`.

**UI kit** (`ui_kits/moneytrack/`)
- `index.html` — interactive MoneyTrack app: transactions, accounts, recurring, **Estadísticas** (Recharts charts), theme + auth. Mobile-first responsive.
- `mobile.html` — the same app pinned to a 390px phone layout (a Starting Point so the responsive work is visible in the picker).
- See its `README.md` for the file map and interactions.

**Skill**
- `SKILL.md` — Agent-Skills entry point for generating MoneyTrack-branded work.

---

## Notes & substitutions
- **Fonts:** MoneyTrack genuinely ships on a system font stack, so no webfonts are bundled. `--font-mono` points at `Cascadia Mono` with a full fallback stack; if you want pixel-exact mono rendering you can upload that font, but it's optional.
- This is a cosmetic/design system — no Firebase, auth or persistence logic is included.
