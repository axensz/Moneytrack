---
name: MoneyTrack
description: A confident, warm personal-finance ledger — violet accent on warm-neutral surfaces, system type, soft elevation.
colors:
  primary-violet: "#7c3aed"
  primary-violet-lifted: "#8b5cf6"
  primary-violet-deep: "#6d28d9"
  background: "#faf9f7"
  foreground: "#1f1f1f"
  card: "#ffffff"
  muted: "#f5f4f1"
  muted-foreground: "#6b6b6b"
  success: "#059669"
  destructive: "#dc2626"
  warning: "#d97706"
  info: "#2563eb"
  balance-accent: "#f3e8ff"
  balance-foreground: "#6b21a8"
  border: "#e5e5e5"
  border-accent: "#ddd6fe"
typography:
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  lg: "8px"
  xl: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-violet-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
  button-cancel:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "16px"
  card-balance:
    backgroundColor: "{colors.balance-accent}"
    textColor: "{colors.balance-foreground}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "48px"
---

# Design System: MoneyTrack

## 1. Overview

**Creative North Star: "The Confident Ledger"**

MoneyTrack looks like a ledger kept by a warm, seasoned expert: confident,
exact, and glad to help. The surface stays out of the way so the numbers are the
signal. A single violet accent does all the brand work — it marks primary
actions, the running balance, and focus — against barely-warm off-white
surfaces in light mode and near-black in dark mode. Everything else is neutral
on purpose: warm grays, hairline borders, soft diffuse shadows. Color is spent,
never sprinkled; every saturated value (green, red, amber, blue) carries a
specific financial meaning, never decoration.

The system is **dense but legible**. It's a power tool for one detail-oriented
user reconciling real bank and card statements, so it shows real data at real
density — but hierarchy is deliberate (weight and size, soft elevation,
generous touch targets) so nothing reads as an undifferentiated wall. Type is
the operating-system sans (Arial/Helvetica stack); there is no web font and no
display face. Restraint is the aesthetic.

What it explicitly rejects: the **generic SaaS dashboard** — gradient "hero
metric" templates, endless identical icon-heading-text card grids, decorative
glassmorphism, purple-gradient template chrome. It also rejects fintech/crypto
hype (neon, dark-glass, flashy) and toy-bright gamification. (Note: the current
implementation still carries a violet gradient on the primary button and the
balance card — the one place it brushes the anti-pattern. See Do's and Don'ts.)

**Key Characteristics:**
- One brand hue (violet), everything else neutral or semantic.
- Warm-neutral light surfaces; near-black dark surfaces; full light/dark parity.
- System sans type — hierarchy by weight and size, not by family.
- Soft, low-opacity shadows over hard edges; flat surfaces that lift on hover.
- Two-radius rhythm: 12px cards, 8px controls.
- Touch-first: ≥44px targets, 16px inputs on mobile.

## 2. Colors

A restrained, semantic palette: one violet brand hue, a warm-neutral ground, and
four status colors that each mean something specific about money. Light and dark
are full peers — every token has both values.

### Primary
- **Trusted Violet** (`#7c3aed` light / `#8b5cf6` dark): the single brand hue.
  Primary buttons, the running balance value, focus rings, active accents. Its
  deep step (`#6d28d9`) is the hover/pressed state. Rare by doctrine — it reads
  as "this matters."

### Secondary (semantic status)
- **Ledger Green** (`#059669` light / `#10b981` dark) on **Green Mist**
  (`#ecfdf5` / `#064e3b`): income, positive balance, paid/healthy state.
- **Alert Red** (`#dc2626` light / `#ef4444` dark) on **Red Mist**
  (`#fef2f2` / `#7f1d1d`): expense, debt, overdue, destructive actions.
- **Caution Amber** (`#d97706` light / `#f59e0b` dark) on **Amber Mist**
  (`#fffbeb` / `#78350f`): upcoming due dates, budget warnings.
- **Calm Blue** (`#2563eb` light / `#3b82f6` dark) on **Blue Mist**
  (`#eff6ff` / `#1e3a8a`): informational, edit actions, neutral highlights.

### Tertiary (balance treatment)
- **Violet Mist** (`#f3e8ff` light / `#581c87` dark): the balance card ground.
- **Deep Violet** text (`#6b21a8` light / `#d8b4fe` dark): balance labels.
  The balance value itself uses Trusted Violet.

### Neutral
- **Warm Paper** (`#faf9f7` light / near-black `#0a0a0a` dark): app background.
  Intentionally a *barely*-warm off-white, not cream/sand.
- **Ink** (`#1f1f1f` light / `#ededed` dark): primary text and figures.
- **Pure Card** (`#ffffff` light / slate `#1f2937` dark): card/input surface.
- **Warm Muted** (`#f5f4f1` light / `#262626` dark) with **Quiet Gray** text
  (`#6b6b6b` light / `#a3a3a3` dark): secondary surfaces, labels, placeholders.
- **Hairline** (`#e5e5e5` light / violet-tinted `#4c1d95` dark) and **Violet
  Hairline** (`#ddd6fe` / `#6d28d9`): borders, dividers, hover accents.

### Named Rules
**The One Violet Rule.** Violet is the *only* brand hue. It marks primary
actions, balances, and focus — never decoration, never a second accent. Its
rarity is the point.

**The Status-Pair Rule.** Every semantic state is a solid foreground over its
own muted tint (Ledger Green `#059669` on Green Mist `#ecfdf5`, etc.). Never a
raw saturated fill behind body text; never a status color used decoratively.

## 3. Typography

**Display Font:** none — headings use the body family at larger size/weight.
**Body Font:** Arial, Helvetica, sans-serif (the OS sans stack).
**Label Font:** same stack, 14px / weight 500.

**Character:** deliberately neutral and ubiquitous. The system font is fast,
zero-download, and renders identically to what the user sees everywhere else on
their device — it disappears so the numbers don't. Personality comes from
layout, color, and restraint, not from a typeface.

### Hierarchy
- **Title / Headline** (weight 600, ~18–24px): section and card headings. Same
  family, heavier weight — hierarchy by weight, not face.
- **Body** (weight 400, 16px mobile / 14px in dense desktop controls, line-height
  ~1.5): transaction rows, descriptions, values. Cap prose at 65–75ch.
- **Label** (weight 500, 14px, `--muted-foreground`): field labels, captions.
- **Value / figure** (weight 500–600, Ink or Trusted Violet for balances):
  monetary amounts. Always at full Ink contrast — never muted-gray.

### Named Rules
**The System-Font Rule.** No web font is downloaded. Body is the OS sans stack;
hierarchy is achieved with weight and size only. Do not introduce a display or
brand typeface without an explicit decision.

**The 16px Input Rule.** Inputs render at 16px on mobile (prevents iOS focus
auto-zoom) and step down to 14px at ≥640px. Never ship a sub-16px mobile input.

## 4. Elevation

A flat-by-default system lifted by **soft, low-opacity shadows** plus hairline
borders — not by heavy material drop-shadows. Surfaces rest flat and gain depth
only as a response to state (hover). Dark mode uses the same shadow shapes at
higher opacity to stay visible on near-black.

### Shadow Vocabulary
- **shadow-sm** (`0 1px 2px 0 rgb(0 0 0 / 0.05)`; dark `/ 0.3`): form
  containers, resting inputs — barely-there separation.
- **shadow-md** (`0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)`;
  dark `/ 0.4, / 0.3`): cards and stat cards at rest.
- **shadow-lg** (`0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05)`;
  dark `/ 0.5, / 0.4`): the hover/raised state of an interactive card.

### Named Rules
**The Soft-Shadow Rule.** Shadows are diffuse and low-opacity (0.05–0.08 in
light). Cards sit on shadow-md and rise to shadow-lg on hover; the border may
shift to Violet Hairline at the same time. Never a hard, dark, or tight shadow —
that reads as a 2014 app.

## 5. Components

### Buttons
- **Shape:** gently rounded (8px, `rounded-lg`). Minimum height 44px; mobile
  groups stack full-width with 12px gaps.
- **Primary** (`.btn-primary`): violet gradient (`#7c3aed → #8b5cf6`, 135°),
  white text, `shadow-md`, padding ~10px 16px. **Hover:** darker gradient
  (`#6d28d9 → #7c3aed`), `shadow-lg`, lifts `translateY(-1px)`.
- **Submit / Secondary** (`.btn-submit`, `.btn-secondary`): solid violet
  (`--primary`), white text, hover `#6d28d9` + 1px lift.
- **Cancel** (`.btn-cancel`): Warm Muted fill, Quiet Gray text, hover `#e5e4e0`.
  The quiet, recessive choice in any pairing.
- **Danger** (`.btn-danger`): solid Alert Red (`#dc2626`), white text, hover
  `#b91c1c`; disabled drops to 50% opacity.
- **Segmented type-picker** (`.btn-type`): inactive = Warm Muted; active states
  are semantic (success/destructive/info) — muted tint fill + matching solid
  text/border + a 1px ring of the same color.

### Cards / Containers
- **Corner Style:** 12px (`rounded-xl`) — one step softer than controls.
- **Background:** Pure Card (`#ffffff` / dark `#1f2937`).
- **Shadow Strategy:** shadow-md at rest → shadow-lg on hover (see Elevation).
- **Border:** 1px Hairline; shifts to Violet Hairline on hover.
- **Internal Padding:** responsive 12 → 16 → 20px (`p-3 sm:p-4 md:p-5`).
- **Balance card** (`.card-balance`): the one signature surface — a 3-stop violet
  gradient (`#f3e8ff → #ede9fe → #e9d5ff`) with a violet-tinted shadow. Flat
  Violet Mist fill in dark mode.

### Inputs / Fields
- **Style:** 1px Hairline border, Pure Card / input fill, 8px radius, 48px min
  height on mobile (44px desktop), 16px text (14px desktop).
- **Hover:** border shifts to Violet Hairline.
- **Focus:** `ring-2` violet ring + a 3px violet glow (`rgba(139,92,246,0.1)`),
  border goes transparent. Visible focus is non-negotiable.
- **Select:** custom chevron SVG, theme-aware stroke color.
- **Label:** `.label-base` — 14px, weight 500, Quiet Gray, 8px bottom margin.

### Navigation & touch
- Every interactive control clears a **44px** touch target; icon buttons use a
  44×44 `.icon-badge`. Checkboxes/radios grow to 24px on mobile. Adjacent
  buttons keep ≥8px separation.

## 6. Do's and Don'ts

### Do:
- **Do** keep Trusted Violet (`#7c3aed` / dark `#8b5cf6`) as the single brand hue
  — primary actions, balance emphasis, and focus rings only.
- **Do** pair every status color with its muted tint (Ledger Green `#059669` on
  `#ecfdf5`, Alert Red `#dc2626` on `#fef2f2`, and so on) — the Status-Pair Rule.
- **Do** keep figures at full Ink contrast (`#1f1f1f`); the muted-gray
  `#6b6b6b` floor is for labels, never for a balance.
- **Do** convey income / expense / due with sign + icon + label, not color alone
  (color-blind and grayscale safety).
- **Do** hold the two-radius rhythm: 12px (`rounded-xl`) cards, 8px
  (`rounded-lg`) controls.
- **Do** keep shadows soft and low; rest on shadow-md, lift to shadow-lg on hover.
- **Do** ship 16px mobile inputs and ≥44px touch targets.

### Don't:
- **Don't** build a **generic SaaS dashboard**: no gradient "hero metric"
  templates (big number + small label + gradient accent), no endless identical
  icon-heading-text card grids, no decorative glassmorphism, no purple-gradient
  template chrome.
- **Don't** spread gradients. The violet gradient lives **only** on `.btn-primary`
  and `.card-balance` today; add no new gradient surfaces — and prefer flattening
  these to a solid violet in a future `quieter` / `polish` pass, since they are
  the one place the UI brushes the SaaS-gradient anti-reference.
- **Don't** use light-gray body text "for elegance." `#6b6b6b` is the floor;
  anything lighter fails contrast on Warm Paper.
- **Don't** introduce a second brand hue or a web/display font. Hierarchy is
  weight and size in one system sans.
- **Don't** use color as the only carrier of financial meaning.
- **Don't** nest cards, and **don't** use hard, dark, or tight drop-shadows.
