import React from 'react';

/**
 * Indicador "Calculando…" mientras el saldo se deriva de la ventana paginada
 * (el fetch del historial completo está en vuelo). Compartido por StatsCards y
 * AccountCard para que el texto y la semántica de accesibilidad (aria-live)
 * vivan en un solo sitio. El color/tamaño se pasa por `className`.
 *
 * Nota (a11y): NO se usa `animate-pulse`. La animación de opacidad baja el
 * contraste del texto por debajo de AA en cada ciclo (sobre todo en cards con
 * tinte violet). El estado ya se anuncia con `aria-live`; el texto estático
 * cumple contraste siempre y respeta `prefers-reduced-motion` sin casos
 * especiales.
 */
export const BalanceSettling: React.FC<{ className?: string }> = ({ className }) => (
  <span className={className ?? ''} aria-live="polite">
    Calculando…
  </span>
);
