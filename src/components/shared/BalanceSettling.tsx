import React from 'react';

/**
 * Indicador "Calculando…" mientras el saldo se deriva de la ventana paginada
 * (el fetch del historial completo está en vuelo). Compartido por StatsCards y
 * AccountCard para que el texto y la semántica de accesibilidad (aria-live)
 * vivan en un solo sitio. El color/tamaño se pasa por `className`.
 */
export const BalanceSettling: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`animate-pulse ${className ?? ''}`} aria-live="polite">
    Calculando…
  </span>
);
