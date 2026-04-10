# Plan de Deuda Técnica — Estado Actual

**Última revisión:** 9 de abril de 2026

---

## ✅ COMPLETADOS

- [x] P0-01: clearAll/markAllAsRead feedback visible (toast.success)
- [x] P0-02: Validación description consistente
- [x] P0-03: Índice transactions (single-field, Firestore auto)
- [x] P1-01: formatCurrency centralizado
- [x] P1-02: Deduplicación notificaciones
- [x] P1-03: React.memo en TransactionItem
- [x] P1-04: Guard inicialización monitores
- [x] P1-05: actionUrl XSS neutralizado
- [x] P1-06: Transferencias atómicas — error específico visible en toast
- [x] P1-08: Service Worker skipWaiting + cache v2
- [x] P1-09: Metadata viewport/themeColor
- [x] P1-10: Límite monto alineado frontend = Firestore (1B)
- [x] P2-02: Skeleton loading en vistas secundarias
- [x] P2-03: Stats deps estables (transactions/accounts son state refs)
- [x] P2-06: Cache monitores — cleanup periódico (setInterval en useNotificationMonitoring)
- [x] P2-07: Quiet hours — Colombia no tiene DST, getHours() local es correcto
- [x] P2-09: Singleton Intl.NumberFormat
- [x] P2-10: DeleteConfirmModal con nombre
- [x] P2-12: Filtrado no duplicado (useFilteredData vs useTransactionsView son propósitos distintos)
- [x] P2-13: dateRange es useState, no crea objeto nuevo cada render
- [x] P2-14: useEffect intervalo cleanup (clearInterval en return)
- [x] P2-16: creditUsedMap memoizado
- [x] Paginación real transacciones
- [x] Error UI Firestore con retry
- [x] Firebase build-safe (graceful degradation)
- [x] Fechas corte/pago corregidas
- [x] Statement saldo a favor
- [x] Cupo usado ajustado por cuotas vencidas
- [x] Intereses primera cuota mes siguiente
- [x] Cascade delete cuenta (tx + recurrentes + deudas)
- [x] Firestore rules validación cuotas/intereses
- [x] Offline sync feedback unificado (OfflineIndicator)
- [x] Offline retry backoff exponencial
- [x] Cuotas off-by-one corregido

---

## ⏳ PENDIENTES (baja prioridad / cosmético)

- [ ] P1-07: Virtualización de listas (react-window) — útil solo con 1000+ items
- [ ] P1-11: Categorías protegidas server-side — bajo impacto (frontend ya protege, se recrean)
- [ ] P1-12: Batch delete con indicador de progreso
- [ ] P2-08: CreditCardCalculator deprecated — migrar a Strategy (cosmético, ya delega)
- [ ] P2-15: addTransaction idempotencia en retry (edge case raro)
- [ ] P2-17: Bundle size tree-shaking
- [ ] P2-18: Iconos PNG optimizar a WebP
- [ ] P3-01: Tests cobertura 15% → 70%
