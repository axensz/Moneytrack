---
target: the accounts view
total_score: 29
p0_count: 0
p1_count: 2
timestamp: 2026-06-26T18-09-03Z
slug: src-components-views-accounts-accountsview-tsx
---
# Critique — Vista de Cuentas (AccountsView)

Target: `src/components/views/accounts/AccountsView.tsx` (+ AccountCard, CreditCardsConsolidatedSummary, BalanceComparisonSection, CardStatementsModal)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Excelente feedback (BalanceSettling "Calculando…", máscara hideBalances, badges Pagado/Parcial/Pendiente); falta skeleton al cargar cuentas |
| 2 | Match System / Real World | 4 | Terminología es-CO impecable (Cupo, Corte, Pago, Tasa E.A., Al día, Sin registrar) |
| 3 | User Control and Freedom | 3 | Cancelar en modales, typing-to-confirm en borrado; sin undo; window.confirm como escape pobre |
| 4 | Consistency and Standards | 2 | Colores crudos Tailwind en vez de tokens; rojos inconsistentes (rose/red/destructive); window.confirm vs modales propios |
| 5 | Error Prevention | 3 | Borrado typing-to-confirm + guards doble-clic; merge valida cupo/deuda; window.confirm debilita una decisión financiera |
| 6 | Recognition Rather Than Recall | 3 | Botones con texto en general; botón borrar icon-only (Trash2) sin label/aria |
| 7 | Flexibility and Efficiency | 3 | Drag&drop + alternativa teclado, filtro por tarjeta; sin bulk ni shortcuts |
| 8 | Aesthetic and Minimalist Design | 2 | 6+ familias de color + múltiples gradientes; resumen = hero-metric grid + eyebrow uppercase; ruidoso vs "calm" |
| 9 | Error Recovery | 3 | Toasts específicos en español; algún "Error desconocido" genérico |
| 10 | Help and Documentation | 3 | Microcopy autoexplicativo inline; sin ayuda formal (ok para producto) |
| **Total** | | **29/40** | **Good — base sólida, problemas concentrados en consistencia + minimalismo de color** |

## Anti-Patterns Verdict

**LLM**: Veredicto mixto. La arquitectura, el microcopy de dominio y la accesibilidad de interacción NO son slop — están cuidados. Pero la **capa de color** sí lleva el tell de "AI hizo esto": paleta multicolor (purple + violet + emerald + teal + orange + rose + amber) con gradientes decorativos. Es exactamente la anti-referencia "generic SaaS dashboard" que PRODUCT.md pide evitar, y contradice el "One Violet Rule" de DESIGN.md.

**Deterministic scan** (`detect.mjs`, exit 2, 7 hallazgos, 0 falsos positivos):
- `ai-color-palette` ×6 — gradientes purple/violet: AccountCard:110, AccountCard:348, CreditCardsConsolidatedSummary:49, :96.
- `gray-on-color` ×1 — AccountCard:295, `text-gray-400 on bg-rose-50` (hover del botón borrar).

El detector NO captó (review sí): side-stripe/accent bars, hero-metric grid + eyebrow uppercase, window.confirm, ausencia de tokens semánticos, rojos inconsistentes.

**Visual overlays**: no disponibles — entorno headless sin automatización de navegador. Sin overlay en pantalla; evidencia = scan CLI + review de fuente.

## Overall Impression

Los **huesos son buenos**: jerarquía clara, estados honestos (settling, máscaras, "Al día"), accesibilidad de interacción genuinamente por encima del promedio (alternativa de teclado al drag&drop, focus-visible, targets 44px), y dominio bien hablado. Lo que arrastra la vista es **la piel de color**: seis familias cromáticas y media docena de gradientes convierten un ledger que debería ser tranquilo en un dashboard que grita. La mayor oportunidad: colapsar a violet + neutrales + estados semánticos con significado, y aplanar los gradientes. Es un trabajo de *quieter*, no de rediseño.

## What's Working

1. **Estados honestos.** `BalanceSettling` muestra "Calculando…" en vez de un número transitorio falso; `hideBalances` enmascara con ••••••; "Al día" es un estado, no un cero. Alineado con el principio "Honest states".
2. **Accesibilidad de interacción.** Alternativa de teclado al drag&drop (ChevronUp/Down con aria-label), `focus-visible:ring`, `role="group"`, `aria-hidden` en iconos decorativos, targets ≥44px. Raro y bien hecho.
3. **Lenguaje de dominio.** "Cupo utilizado", "Corte", "Pago", "Tasa E.A.", "Saldo real / Proyectado / Sin registrar". Habla el idioma del usuario con precisión.

## Priority Issues

**[P1] Paleta multicolor satura el norte "one violet hue"**
- Why: 6+ familias (purple, violet, emerald, teal, orange, rose, amber) hacen que cada elemento compita; rompe "Calm is the default" y la anti-referencia generic-SaaS.
- Fix: colapsar a violet (tokens) + neutrales; reservar color SOLO para estado con significado (success/warning/destructive). Quitar emerald/teal/orange decorativos.
- Comando: `/impeccable quieter`

**[P1] Gradientes fuera de los dos permitidos**
- Why: DESIGN.md confina gradientes a `.btn-primary` y `.card-balance`. Aquí hay ~6 (tarjeta principal, barras de uso, resumen consolidado). El detector los marca como tell de AI.
- Fix: aplanar a fills sólidos (violet o neutral); barras de progreso en color sólido.
- Comando: `/impeccable quieter`

**[P2] No usa tokens semánticos (doble fuente de verdad)**
- Why: `purple-600`, `emerald-500`, `rose-600` crudos en vez de `--primary`/`--success`/`--destructive`. Cambiar theme.css NO rebrand­ea estas tarjetas; deriva garantizada.
- Fix: reemplazar utilidades crudas por clases token (`text-primary`, `bg-card`, `text-muted-foreground`, `border-border`, `text-success/destructive`).
- Comando: `/impeccable polish`

**[P2] Side-stripe / accent bars (absolute ban)**
- Why: AccountCard pinta `absolute left-0 w-1.5 bg-purple-500` (barra vertical de color) y AccountsView usa `border-l-2 border-purple-200` en las asociadas. Es el "side-stripe border" prohibido.
- Fix: borde completo, tint de fondo o icono líder; nada de stripe de color >1px.
- Comando: `/impeccable polish`

**[P2] El resumen consolidado es un hero-metric grid + eyebrow**
- Why: `SummaryMetric` = 4 tarjetas idénticas (label `uppercase tracking-wide` + número grande) sobre gradiente. Tres tells a la vez (hero-metric template, identical card grid, eyebrow uppercase).
- Fix: una fila de cifras con jerarquía tipográfica (no tarjetas idénticas, sin eyebrow, sin gradiente de fondo).
- Comando: `/impeccable distill`

## Persona Red Flags

**Alex (Power User)**: Sin shortcuts de teclado para acciones; sin bulk (borrar/unificar varias tarjetas); el botón de borrar es icon-only sin label, lento de reconocer. Drag&drop con alternativa de teclado le sirve.

**Sam (Accesibilidad)**: Botón borrar (Trash2) sin `aria-label` ni texto (AccountCard:294). `text-rose-600` del balance negativo no tiene variante `dark:` → contraste dudoso en oscuro. Crédito vs ahorro se distingue casi solo por color (el icono Wallet/CreditCard salva parcialmente). Texto gris sobre fondos translúcidos/coloreados se lava.

**Camilo (persona de proyecto — power user que reconcilia contra extractos reales)**: confía en "Saldo real vs Proyectado vs Sin registrar" (excelente), pero la saturación de color y los gradientes compiten con las cifras y estorban el escaneo rápido de saldos — justo lo contrario de "the numbers are the signal".

## Minor Observations

- Rojos inconsistentes: `red-*` (StatusBadge pending) vs `rose-600` (balance negativo) vs token `--destructive` (#dc2626).
- `window.confirm` nativo para la advertencia cupo<deuda en el merge (AccountsView:233): bloqueante, no estilizable, inconsistente con los modales del sistema.
- `text-gray-400 on bg-rose-50` (botón borrar hover) — lavado; usar un rojo tenue del propio hue.
- Botón borrar icon-only sin texto/aria-label.
- `CardStatementsModal` es el componente más limpio del lote (usa BaseModal, input-base, empty state honesto) — buen patrón a replicar.

## Questions to Consider

- ¿El violet es el héroe, o solo uno de seis colores? Si "one violet hue" es el norte, ¿qué se pierde si emerald/teal/orange desaparecen y el estado vive solo en success/warning/destructive?
- ¿La vista consolidada necesita ser una tarjeta-dashboard, o una línea de cifras tipográfica diría lo mismo, más tranquila?
- ¿Distinguir crédito vs ahorro por color, o por estructura/etiqueta, para que sobreviva en escala de grises?
