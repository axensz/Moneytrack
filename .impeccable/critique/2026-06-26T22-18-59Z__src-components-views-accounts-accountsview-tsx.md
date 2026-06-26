---
target: the accounts view
total_score: 34
p0_count: 0
p1_count: 0
timestamp: 2026-06-26T22-18-59Z
slug: src-components-views-accounts-accountsview-tsx
---
# Critique — Vista de Cuentas (AccountsView) — run 2 (post quieter/distill/polish)

Target: `src/components/views/accounts/AccountsView.tsx` (+ AccountCard, CreditCardsConsolidatedSummary, BalanceComparisonSection, CardStatementsModal, AccountFormModal, MergeCreditCardsModal, DeleteConfirmModal)

## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|----|-----------|
| 1 | Visibility of System Status | 3 | = | Buen feedback (settling, máscara, badges); sigue sin skeleton al cargar |
| 2 | Match System / Real World | 4 | = | Terminología es-CO impecable |
| 3 | User Control and Freedom | 3 | = | Confirmaciones temáticas (ConfirmDialog) + Escape; sigue sin undo en borrado |
| 4 | Consistency and Standards | 4 | +2 | Toda la vista en tokens; rojos unificados a --destructive; confirmaciones por modal del sistema |
| 5 | Error Prevention | 3 | = | Validaciones + guards + typing-to-confirm (ya sólido) |
| 6 | Recognition Rather Than Recall | 4 | +1 | Botón borrar ahora con aria-label; acciones con texto |
| 7 | Flexibility and Efficiency | 3 | = | Sin bulk ni shortcuts |
| 8 | Aesthetic and Minimalist Design | 4 | +2 | One-violet; sin gradientes decorativos, side-stripes ni hero-metric grid; resumen destilado |
| 9 | Error Recovery | 3 | = | Toasts específicos; algún "Error desconocido" genérico |
| 10 | Help and Documentation | 3 | = | Microcopy autoexplicativo inline |
| **Total** | | **34/40** | **+5** | **Good (alto) — a un paso de Excellent** |

## Anti-Patterns Verdict

**LLM**: La capa de color ya **no** lleva el tell de AI. La paleta es one-violet intencional + neutrales + estado-con-significado (success/warning/destructive). Sin gradientes decorativos, sin side-stripes, sin eyebrow uppercase, sin hero-metric grid. La arquitectura, microcopy y a11y de interacción siguen fuertes.

**Deterministic scan** (`detect.mjs`): **0 hallazgos** en los 8 componentes (eran 7: 6 ai-color-palette + 1 gray-on-color). Sin falsos positivos.

**Visual overlays**: no disponibles (entorno headless). Evidencia = scan CLI + review de fuente + 25/25 tests de la vista.

## Overall Impression

La vista pasó de "dashboard SaaS colorido" a "the quiet ledger": one-violet, plana, tokens en todo. Los dos heurísticos que la arrastraban (Consistencia y Minimalismo, ambos en 2) subieron a 4. Lo que queda son mejoras de capacidad, no de ruido: estados de carga, acciones masivas, undo.

## What's Working

1. **Color con intención** — violet como único acento de marca; success/warning/destructive solo donde comunican estado (saldo negativo, uso alto, pagado/pendiente).
2. **Consistencia de sistema** — todo en tokens; cambiar `theme.css` ahora rebrandeа la vista entera. Confirmaciones por `ConfirmDialog`/`BaseModal` (no `window.confirm`).
3. **Estados honestos + a11y** — settling, máscara, "Al día", alternativa de teclado al drag&drop, focus-visible, targets ≥44px, aria-label en borrar.

## Priority Issues (lo que queda)

**[P2] Sin estado de carga (skeleton) al cargar cuentas**
- Why: `accountsLoading` deshabilita el botón pero la lista no comunica "cargando"; un parpadeo en frío.
- Fix: skeleton de tarjetas mientras `accountsLoading`.
- Comando: `/impeccable harden`

**[P2] Borrado sin undo**
- Why: el borrado es en cascada e irreversible; solo hay typing-to-confirm.
- Fix: toast con "Deshacer" (ventana corta) o papelera temporal.
- Comando: `/impeccable harden`

**[P3] Sin acciones masivas ni shortcuts (Alex)**
- Why: unificar/borrar es de a una; sin atajos de teclado.
- Fix: selección múltiple para borrar/unificar; atajos.
- Comando: `/impeccable shape`

**[P3] Infra compartida con grises crudos**
- Why: `BaseModal`/`ConfirmDialog` (toda la app) aún usan `gray-*`/`ring-purple` hardcodeados — drift de sistema fuera de esta vista.
- Fix: tokenizar la infra de modales en un pase aparte.
- Comando: `/impeccable polish` (scope: modales compartidos)

## Minor Observations

- `utilities.css` arrastra drift pre-existente (radios 3/4px del scrollbar/foco, rgba violeta del scrollbar, sombra del dropdown) — candidato a tokens en un pase de sistema.
- Mensajes de error con algún "Error desconocido" genérico — podrían ser más específicos.

## Questions to Consider

- ¿Vale un skeleton, o el settling actual basta para la sensación de carga?
- ¿El borrado en cascada merece un "Deshacer", dado que es irreversible?
- ¿Hay caso real de uso para selección múltiple de tarjetas, o es sobre-ingeniería para un usuario único?
