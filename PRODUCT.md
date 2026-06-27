# Product

## Register

product

## Users

Personas que gestionan sus finanzas personales (ingresos, gastos, cuentas,
tarjetas, recurrentes) desde el móvil o el escritorio. Contexto colombiano
(locale `es`, formato `1.234.567,89`). La app es una PWA instalable; se usa
en sesiones cortas y frecuentes para registrar movimientos y revisar saldos.

## Product Purpose

MoneyTrack es un control de finanzas simple: registrar ingresos y gastos,
conciliar cuentas y tarjetas, y proyectar saldos con confianza. El éxito es
que el usuario confíe en la cifra que ve sin tener que re-verificarla en otro
lado. North Star: **"The Confident Ledger"** — el libro mayor en el que se
confía.

## Brand Personality

Voz **confident · warm · expert**. Seguro sin ser frío, cálido sin ser
infantil, experto sin abrumar. El color comunica estado (verde +, rojo −,
ámbar atención); el violet `#7c3aed` es la marca, no decoración.

## Anti-references

- **No** un dashboard SaaS genérico: nada de hero-metrics con degradado,
  rejillas de tarjetas idénticas, ni glassmorphism decorativo.
- Los degradados se confinan a `.btn-primary` y `.card-balance`; el degradado
  violet del shell y los de RecurringStatsCards son intencionales y by-design.
- Sin librerías de motion (Framer Motion): animación CSS-first.

## Design Principles

- **The Confident Ledger** — la cifra es la verdad; el diseño la respalda, no
  la disfraza.
- **El color es estado, no adorno** — verde/rojo/ámbar para estado, violet
  para marca; el tipo se distingue por icono, no por color.
- **Cálido sin perder rigor** — al des-saturar no colapsar a gris; conservar
  presencia del violet.
- **AA siempre** — todo texto cumple WCAG AA en claro y oscuro; los tokens ya
  están ajustados para ello.

## Accessibility & Inclusion

WCAG 2.1 AA como piso. Targets táctiles ≥44–48px. Soporte de modo oscuro y
`prefers-reduced-motion`. Contraste de los pares estado-sobre-muted verificado
(success 5.21:1, destructive 5.24:1, warning 4.84:1).
