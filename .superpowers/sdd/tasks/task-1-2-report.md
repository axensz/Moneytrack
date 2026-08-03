# OPSX ledger integrity — bloques 1.1-1.5 y 2.1-2.5

Base lógica: `9d2df62`.

## Causa

El head autenticado está paginado a 500. `useBalanceTransactions` interpretaba un head menor de 500 como completo por su conteo y desactivaba `useAllTransactions` pasando `userId=null`; ese hook considera el modo sin usuario asentado. Por tanto, un primer snapshot corto de caché podía habilitar saldos y writers antes de una confirmación de servidor.

## RED exacto

Ejecutado antes de la implementación:

```text
npm.cmd test -- src/__tests__/hooks/useBalanceTransactions.test.ts src/__tests__/hooks/useFirestoreSubscriptions.pagination.test.ts src/__tests__/hooks/addTransactionBalanceGate.test.ts src/__tests__/hooks/transactionEditValidation.test.ts src/__tests__/components/metricScopeFilterIndependence.test.tsx --run

Test Files  4 failed | 1 passed (5)
Tests  4 failed | 32 passed (36)

useBalanceTransactions: expected true to be false
useFirestoreSubscriptions: expected undefined to be false
useAddTransaction: expected writer not to be called, but was called 1 time
useTransactionsView: expected writer not to be called, but was called 1 time
```

## Cambios

- El head de transacciones se suscribe con `includeMetadataChanges`; solo `fromCache=false` y `hasPendingWrites=false` asientan autoridad.
- `FirestoreContext` expone `transactionsServerSettled`, causa no resuelta (`cache`, `pending-writes`, `error`) y estado de reintento.
- Un head autenticado corto permanece visible pero no entrega `ready=true` hasta confirmación del servidor. Un head de 500 o más mantiene el listener completo confirmado.
- `FinanceContext` y el selector de transacciones propagan la señal sin depender de filtros ni del estado de paginación de la vista.
- Se agregó un preflight pequeño reutilizado por alta y edición: bloquea solo operaciones que pueden reducir saldo/deuda, antes de cualquier writer, con el mensaje accionable de conciliación y sin cerrar/resetear formularios.
- Se extendió la prueba de independencia de métricas con todos los filtros inferiores combinados. No se cambiaron fórmulas, `BalanceCalculator` ni `transactionPaginationCache`.

## GREEN exacto

```text
npm.cmd test -- src/__tests__/hooks/useBalanceTransactions.test.ts src/__tests__/hooks/useFirestoreSubscriptions.pagination.test.ts src/__tests__/hooks/addTransactionBalanceGate.test.ts src/__tests__/hooks/transactionEditValidation.test.ts src/__tests__/components/metricScopeFilterIndependence.test.tsx --run
Test Files  5 passed (5)
Tests  41 passed (41)

npm.cmd test -- src/__tests__/integration/balancePaginationCorruption.test.ts src/__tests__/hooks/useAllTransactions.test.ts src/__tests__/utils/accountBalanceAdjust.test.ts src/__tests__/hooks/transactionsViewExportFiltering.test.ts src/__tests__/hooks/useBalanceTransactions.test.ts src/__tests__/hooks/useFirestoreSubscriptions.pagination.test.ts src/__tests__/hooks/addTransactionBalanceGate.test.ts src/__tests__/hooks/transactionEditValidation.test.ts src/__tests__/components/metricScopeFilterIndependence.test.tsx --run
Test Files  9 passed (9)
Tests  64 passed (64)

npm.cmd run typecheck
tsc --noEmit: exit 0
```

## Archivos

- `src/hooks/firestore/useFirestoreSubscriptions.ts`
- `src/hooks/useFirestore.ts`
- `src/hooks/useBalanceTransactions.ts`
- `src/contexts/FinanceContext.tsx`
- `src/hooks/useFinanceSelectors.ts`
- `src/utils/ledgerReadiness.ts`
- `src/hooks/useAddTransaction.ts`
- `src/components/views/transactions/hooks/useTransactionsView.tsx`
- `src/__tests__/hooks/useFirestoreSubscriptions.pagination.test.ts`
- `src/__tests__/hooks/useBalanceTransactions.test.ts`
- `src/__tests__/hooks/addTransactionBalanceGate.test.ts`
- `src/__tests__/hooks/transactionEditValidation.test.ts`
- `src/__tests__/components/metricScopeFilterIndependence.test.tsx`
- `.superpowers/sdd/tasks/task-1-2-report.md`

## Riesgos y límites

- Falta la prueba de integración provider-level solicitada en 1.3; el grafo también la identifica como cobertura ausente. Los flujos hook/contexto se cubrieron de forma focal, pero esa verificación end-to-end debe agregarse en el siguiente bloque.
- Los escenarios de error del historial completo ya permanecen en `useAllTransactions`; conviene añadir una prueba dedicada de cambio de usuario y retry del head en la prueba provider-level.
- La barrera es de cliente para el primer bloque; la serialización server-current y la fachada de writers siguen siendo trabajo posterior.
