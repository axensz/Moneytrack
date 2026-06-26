# Motion Polish — Plan SDD (Emil Kowalski)

> Rama: `worktree-motion-polish`. Stack: Next 16 / React 19 / Tailwind v4, **CSS-first (sin Framer Motion)**.
> Tracker vivo de progreso en memoria del asistente (`motion-audit-2026-06`).

## Spec / Objetivo
Llevar el "motion vocabulary" de MoneyTrack a calidad Apple/Linear sin añadir dependencias:
curvas de easing con punch, feedback de press, entrada de modal reparada, accesibilidad
(`prefers-reduced-motion`), y eliminación del antipatrón `transition-all`.

## Criterios de aceptación
1. `npm run typecheck` en verde.
2. `npm run test:run` en verde (sin regresiones).
3. `npm run build` en verde.
4. Cero `transition-all` en `src/**` (verificado por grep).
5. Sin cambios de lógica/negocio: solo clases/CSS de presentación.

## Fases
- **A–C (fundacional, hecho a mano, global):** tokens de easing en `@theme`, `:active` +
  `prefers-reduced-motion` globales, reparación de `.animate-in`/`BaseModal`. ~80% del salto
  de calidad sin tocar componentes de features.
- **D (workflow):** `app/styles/components.css` — `transition-all` → `transition-[...]` específico
  en `.card-*`, `.btn-*`, `.input-base`, `.select-filter`.
- **E (workflow):** `TabNavigation.tsx` — `transition-all` → `transition-colors`.
- **F (workflow, fan-out):** 21 `.tsx` con `transition-all` → propiedad específica; `:active`
  en botones custom (no `btn-*`).
- **VERIFY (workflow):** typecheck + tests + build + grep-clean, con verificación adversarial.

## No-goals (ponytail)
- No instalar Motion/Framer. CSS corre fuera del main thread (clave con Firebase cargando).
- No subrayado deslizante en tabs (nav de alto uso → Emil aconseja minimal).
- No re-trabajar `LoadingScreen` salvo lo que cubre `prefers-reduced-motion`.
