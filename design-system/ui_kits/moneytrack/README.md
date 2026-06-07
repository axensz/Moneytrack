# MoneyTrack — App UI Kit

Interactive, click-through recreation of the MoneyTrack personal-finance app, built from the source in [github.com/axensz/Moneytrack](https://github.com/axensz/Moneytrack).

## Run it
Open `index.html`. It's a self-contained React app (CDN React + Babel + Lucide) that uses the design-system tokens and `.mt-*` classes from the root `styles.css`.

## What's interactive
- **Theme toggle** — light / dark, flipping `.dark` on `<html>`.
- **Acceder** — opens the auth modal (Google / email / guest); "Acceder" signs you in as a guest user named Camila.
- **Tabs** — **all seven views are now built**: Transacciones, Cuentas, Periódicos, **Préstamos**, **Presupuestos**, **Metas** and **Estadísticas** (no placeholders left).
- **Préstamos / Presupuestos / Metas** — summary tiles + item cards driven by the shared **`ProgressBar`** and **`Badge`** design-system components (repayment progress, budget over-limit warnings, savings-goal progress).
- **Estadísticas** — four Recharts charts matching the product: cash-flow area (6 months), monthly comparison bars, category donut with center total, and yearly trend line, plus a credit-card interest summary. Entrance animations are disabled (cleaner for print/reduced-motion).
- **Transactions** — search + category filter, **Nueva** opens an inline add-transaction form (type segmented control, category, amount, date) that prepends a real row; rows can be deleted on hover.
- **Ocultar** — masks every balance with dots, mirroring the product's privacy toggle.
- **Responsive** — mobile-first; layouts reflow at the product's 640px breakpoint via the `useViewport` hook (compact header, stacked stat/account/chart grids).

## Files
| File | Role |
|---|---|
| `index.html` | Entry point + script wiring |
| `icons.js` | Lucide → React icon factory (`window.Icon`) + `useViewport` responsive hook |
| `data.js` | Fake accounts, transactions, categories, recurring payments, stats datasets + COP formatter |
| `chrome.jsx` | `Logo`, `Header`, `TabNavigation`, `AuthModal` |
| `finance.jsx` | `StatCards`, `TransactionsView`, `AccountsView`, `RecurringView`, add-transaction form |
| `stats.jsx` | `StatsView` — Recharts cash-flow / bars / donut / line + interests card |
| `views.jsx` | `DebtsView`, `BudgetsView`, `GoalsView` (Préstamos / Presupuestos / Metas) |
| `app.jsx` | State wiring (`window.MTApp`) |

## Design-system components
The kit consumes the compiled design system (`../../_ds_bundle.js`): the auth dialog uses **`Modal`**, the add-transaction type picker uses **`SegmentedControl`**, and every progress meter (credit usage, budgets, goals, debts) uses **`ProgressBar`** — single source of truth with the rest of the system. (Like `../../styles.css`, this means the kit runs inside the design-system project, not as a standalone copy.)

## Fidelity notes
Layout, colors, spacing, badge styles, the credit-card usage bar, the violet balance hero and the Estadísticas charts (Recharts config, purple palette, semantic income/expense colors) are lifted from the real components (`StatsView.tsx`, `CashFlowChart.tsx`, `CategoryPieChart.tsx`, `StatsCards.tsx`, `AccountCard.tsx`, `TransactionItem.tsx`, `Header.tsx`, `TabNavigation.tsx`). Amounts use Colombian pesos (`es-CO`) like the product. This is a cosmetic recreation — no Firebase, no persistence.
