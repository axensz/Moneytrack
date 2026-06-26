# Product

## Register

product

## Users

A single, detail-oriented power user (the owner) tracking their own finances in
Colombia — COP currency, Bancolombia/Nu statements. Uses MoneyTrack across
desktop and mobile (installable PWA, offline-capable), often while reconciling
the app against real bank and card statements they import (CSV/XLSX/PDF).

The job to be done: keep an accurate, trustworthy picture of net worth and cash
flow, never miss an upcoming due date (recurring payments, credit-card cycles),
and reconcile recorded data against reality with confidence. This is not a
first-run consumer onboarding flow — it's a tool someone lives in and trusts
with exact numbers.

## Product Purpose

A personal finance tracker that is uncompromising about correctness. Savings and
cash balances are derived from transactions so they self-correct; credit-card
debt is an authoritative persisted value mutated atomically; transfers are
atomic. It exists to give one person full, trustworthy control over their money,
with cloud sync (Firestore), an offline guest mode, and optional AI assistance
(Gemini) for categorization and planning.

Success looks like: the figures are always right, the upcoming obligations are
always visible, and the user can glance at any screen and trust what it says
without double-checking a spreadsheet.

## Brand Personality

Confident, warm, expert. MoneyTrack speaks like a seasoned financial advisor who
knows your numbers cold and is glad to help: **confident** (states figures and
next steps plainly — never hedges, never apologizes for itself), **warm** (human
and inviting; it lowers money anxiety through approachability, not clinical
coldness), and **expert** (quiet command of the domain — interest, billing
cycles, reconciliation — without showing off). The emotional goal is *you're in
good hands*. Warmth here means human, never playful or gamified.

## Anti-references

Not a generic SaaS dashboard: no gradient "hero metric" templates (big number +
small label + gradient accent), no endless identical icon-heading-text card
grids, no purple-gradient template chrome, no decorative glassmorphism. The
design must never look auto-generated. By extension, also avoid fintech/crypto
hype (neon, dark-glass, flashy) and toy-bright gamification — both betray the
"calm and precise" promise for a money tool.

## Design Principles

1. **Numbers earn trust.** Legibility and accuracy of figures outrank
   decoration. Style never obscures a value, a sign, or a due date.
2. **Calm is the default.** The interface stays quiet so the money is the
   signal. Color and motion are spent only to carry meaning (income vs expense,
   due vs overdue, healthy vs at-risk), never for ambiance.
3. **Density with hierarchy.** It's a power tool for a detail-oriented user.
   Show real data densely, but with deliberate hierarchy — never dumbed down,
   never an undifferentiated wall.
4. **Honest states.** Every balance, due date, reconciliation, error, empty, and
   offline state tells the truth. No fake precision, no silently swallowed
   failure, no optimistic numbers that don't reconcile.
5. **Earn the affordance.** Cards, charts, and color appear only when they are
   the best way to convey the data — not by category reflex.

## Accessibility & Inclusion

Target WCAG 2.1 AA. Body text ≥4.5:1 contrast (including maskable/blurred
balances when revealed). Maintain the existing baseline: visible focus rings,
touch targets ≥44px, ARIA on interactive controls. Honor
`prefers-reduced-motion` with crossfade/instant alternatives. Color is never the
sole carrier of meaning — income/expense/due status always pairs color with a
sign, icon, or label so it survives color-blindness and grayscale. Spanish-first
(es-CO), COP currency formatting.
