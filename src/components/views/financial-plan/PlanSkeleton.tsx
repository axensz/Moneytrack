import React from 'react';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';

/**
 * Esqueleto del Plan financiero con la MISMA forma que la tarjeta de score
 * (header + círculo + grid 2×2). Se usa en DOS sitios para que la carga sea un
 * solo skeleton continuo sin parpadeos:
 *   1. fallback del <Suspense> que baja el chunk lazy de FinancialPlanView (1ª entrada),
 *   2. estado de carga interno mientras la config del plan y los saldos asientan.
 * Es presentacional y ligero → seguro de importar de forma eager en el shell.
 */
export const PlanSkeleton: React.FC = () => (
  <div className="card" role="status" aria-busy="true" aria-label="Cargando plan financiero">
    <div aria-hidden="true">
      <div className="flex items-center gap-2.5 mb-6">
        <ShimmerSkeleton className="h-8 w-8" rounded="lg" />
        <ShimmerSkeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-col items-center mb-6">
        <ShimmerSkeleton className="h-32 w-32 mb-2" rounded="full" />
        <ShimmerSkeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => <ShimmerSkeleton key={i} className="h-16" rounded="lg" />)}
      </div>
    </div>
  </div>
);
