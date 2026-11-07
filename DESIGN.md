# Design

> Sistema visual derivado de `app/styles/theme.css`, `components.css` y
> `utilities.css`. Los tokens CSS de `theme.css` son la fuente de verdad;
> este documento los resume.

## Theme

Light + dark (clase `.dark`). Base clara cálida (`#faf9f7`), no blanco puro.
Una sola tonalidad de marca (violet). Los colores de estado son siempre pares
sólido-sobre-muted.

## Color Palette

| Rol | Light | Dark |
| --- | --- | --- |
| Background | `#faf9f7` | `#0a0a0a` |
| Foreground | `#1f1f1f` | `#ededed` |
| Card | `#ffffff` | `#1f2937` |
| Muted / fg | `#f5f4f1` / `#6b6b6b` | `#262626` / `#a3a3a3` |
| **Primary (marca)** | `#7c3aed` | `#8b5cf6` |
| Primary solid (botón AA) | `#7c3aed` | `#6d28d9` |
| Primary on-surface (texto AA) | `#6d28d9` | `#c4b5fd` |
| Success | `#047857` / muted `#ecfdf5` | `#10b981` / `#03291c` |
| Destructive | `#c81e1e` / muted `#fef2f2` | `#f56565` / `#3a0808` |
| Warning | `#b45309` / muted `#fffbeb` · solid `#b45309` | `#f59e0b` / `#4a2308` · solid `#b45309` |
| Info | `#2563eb` / muted `#eff6ff` | `#60a5fa` / `#0d1733` |
| Balance | accent `#f3e8ff`, value `#7c3aed` | accent `#581c87`, value `#c4b5fd` |
| Border / accent | `#e5e5e5` / `#ddd6fe` | `#4c1d95` / `#6d28d9` |

Rellenos sólidos con texto blanco usan `--primary-solid` (no `--primary`) para
cumplir AA en dark. `--primary` queda para borde, foco e iconos (umbral 3:1 de
componente). El violet de marca como **texto pequeño** sobre card o tinte
`primary/10` usa `--primary-on-surface` (`text-primary-on-surface`): `#6d28d9`
en claro, `#c4b5fd` en oscuro, ambos ≥4.5:1 (badges de tipo, nombre de cuenta
padre, botones de acción violet, cifras violet del resumen de tarjetas). Esto
corrige el fallo AA de `--primary` como texto en superficies oscuras
(`#8b5cf6` daba ~3.1–3.5:1).

## Typography

- **Sans (cuerpo/UI):** `Arial, Helvetica, "Helvetica Neue", system-ui` —
  stack de sistema, sin fuente display custom.
- **Mono:** `"Cascadia Mono", "Segoe UI Mono", ui-monospace, Consolas` — cifras
  y montos.
- Jerarquía por peso y tamaño, no por color.

## Components

- **Cards:** `rounded-xl` (12px), borde 1px, `--shadow-md`, padding fluido
  `p-3 → p-5`. Variantes: `.card`, `.card-stat` (hover sube sombra),
  `.card-balance` (degradado violet claro permitido),
  `.card-recommend-hero` (degradado violet **oscuro**, ver excepción abajo).

### Excepción de gradiente: `.card-recommend-hero`

El héroe de recomendación del **Optimizador de tarjetas** (modal "Próxima
compra" en Cuentas) usa un gradiente violet **oscuro**
(`--hero-recommend-from #6d28d9` → `--hero-recommend-to #7c3aed`) con texto
blanco. Es una excepción de diseño intencional, al nivel de `.btn-primary` y
`.card-balance`: el único gradiente nuevo fuera de esos y del shell. A
diferencia de `.card-balance` (gradiente claro para texto violet oscuro), este
es oscuro a propósito para que el texto blanco cumpla WCAG AA en toda la rampa
— blanco sobre el stop más claro `#7c3aed` = 5.7:1 y sobre `#6d28d9` = 7.1:1.
Mode-invariante (luce igual en claro y oscuro). Justificación: la recomendación
es la jerarquía máxima del modal y necesita destacarse como héroe, no como una
tarjeta más de la rejilla.
- **Inputs:** `.input-base`, `rounded-lg`, `min-height` 48px móvil / 44px ≥sm,
  `font-size` 16px móvil (evita zoom iOS), foco anillo violet.
- **Botones:** `.btn-primary` degradado violet (`--btn-primary-from/to`),
  fuente única de la paleta de botones; rebrand desde un solo sitio.

## Layout & Motion

- Mobile-first, responsive, PWA instalable. Targets táctiles generosos.
- Bordes `xl`/`lg`, sombras suaves escaladas por modo.
- **Motion CSS-first**, sin librerías. Toda animación respeta
  `prefers-reduced-motion`.
- Degradados confinados a `.btn-primary`, `.card-balance`, el shell y
  RecurringStatsCards (intencionales).
