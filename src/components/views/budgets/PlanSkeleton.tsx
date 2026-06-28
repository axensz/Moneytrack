import React from 'react';

/**
 * Esqueleto del Plan financiero con la MISMA forma que la tarjeta de score
 * (header + círculo + grid 2×2). Se usa en DOS sitios para que la carga sea un
 * solo skeleton continuo sin parpadeos:
 *   1. fallback del <Suspense> que baja el chunk lazy de BudgetsView (1ª entrada),
 *   2. estado de carga interno mientras la config del plan y los saldos asientan.
 * Es presentacional y ligero → seguro de importar de forma eager en el shell.
 */
export const PlanSkeleton: React.FC = () => (
  <div className="card animate-pulse" aria-hidden="true">
    <div className="flex items-center gap-2.5 mb-6">
      <div className="h-8 w-8 rounded-lg bg-muted" />
      <div className="h-5 w-40 rounded bg-muted" />
    </div>
    <div className="flex flex-col items-center mb-6">
      <div className="h-32 w-32 rounded-full bg-muted mb-2" />
      <div className="h-4 w-24 rounded bg-muted" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted" />)}
    </div>
  </div>
);
