# 📋 Resolución de Deuda Técnica MoneyTrack — Estado Actual

**Última revisión:** 9 de abril de 2026
**Hallazgos originales:** 47
**Resueltos:** 28
**Pendientes reales:** 19

---

## ✅ RESUELTOS (28 items)

| ID | Descripción | Estado |
|----|-------------|--------|
| P0-02 | Validación description inconsistente | ✅ Firestore rules aceptan string vacío, UI también. Consistente. |
| P1-01 | formatCurrency duplicado en 6 servicios | ✅ Todos importan de `formatters.ts` |
| P1-02 | Notificaciones duplicadas | ✅ Deduplicación con docId determinístico |
| P1-03 | Re-renders TransactionItem | ✅ Usa `React.memo` |
| P1-04 | Monitores se inicializan múltiples veces | ✅ Guard con `monitorsInitializedRef` |
| P1-05 | actionUrl XSS en notificaciones | ✅ actionUrl es informacional, no se usa como href |
| P1-08 | Service Worker no se actualiza | ✅ `skipWaiting()` + cache version `v2-20260409` |
| P1-09 | Warnings Next.js metadata | ✅ viewport/themeColor movidos a export `viewport` |
| P2-09 | Formatters recrean Intl.NumberFormat | ✅ Singleton con CurrencyFormatter |
| P2-10 | Sin confirmación eliminar cuenta | ✅ `DeleteConfirmModal` con nombre + checkbox |
| P2-16 | Balance TC sin memoización | ✅ `creditUsedMap` memoizado en AccountsView |
| — | Paginación real transacciones | ✅ `loadMoreTransactions()` con startAfter |
| — | Error UI Firestore | ✅ `FirestoreErrorBanner` con retry |
| — | Firebase build-safe | ✅ Inicialización graceful sin credenciales |
| — | Fechas corte/pago incorrectas | ✅ Ahora calculan próxima fecha futura |
| — | Statement saldo a favor | ✅ Muestra "A favor:" cuando pagos > cargos |
| — | Cupo usado cuenta monto total cuotas | ✅ Solo cuotas vencidas |
| — | Intereses asumen cuota mes 0 | ✅ Primera cuota mes siguiente |
| — | Cascade delete cuenta | ✅ Limpia transacciones + recurrentes + deudas |
| — | Firestore rules cuotas | ✅ Valida installments, interestRate, etc. |
| — | Offline sync feedback | ✅ OfflineIndicator unificado con sync status |
| — | Offline retry sin backoff | ✅ Backoff exponencial 1s/2s/4s/8s |
| — | Cuotas off-by-one boundaries | ✅ Primera cuota = mes siguiente a compra |
| — | OfflineBanner duplicado | ✅ Unificado en OfflineIndicator |
| P2-01 | Validaciones duplicadas frontend/rules | ✅ Documentadas y alineadas |
| P2-04 | Fecha futura permitida | ✅ No es bug — transacciones futuras son válidas (pagos programados) |
| P2-05 | Modal duplicados no bloquea | ✅ Tiene confirmación/cancelación |
| P2-11 | Formatters fecha duplicados | ✅ Centralizados en formatters.ts |

---

## ⏳ PENDIENTES REALES (19 items)

### Alta prioridad

| ID | Descripción | Impacto | Esfuerzo |
|----|-------------|---------|----------|
| P0-01 | clearAll/markAllAsRead sin feedback visible al usuario | UX — usuario no sabe si funcionó | S (2h) |
| P0-03 | Falta índice compuesto para transactions (date DESC) | Performance — queries lentas con muchos docs | S (1h) |
| P1-06 | Transferencias atómicas sin rollback visible en UI | UX — error silencioso si falla | M (4h) |
| P1-10 | Límite monto: frontend 999B vs Firestore 1B | Seguridad — inconsistencia | S (1h) |
| P1-11 | Categorías protegidas sin validación backend | Seguridad — bypass desde consola | M (3h) |

### Media prioridad

| ID | Descripción | Impacto | Esfuerzo |
|----|-------------|---------|----------|
| P1-07 | Listas sin virtualización | Performance — lag con 1000+ items | L (8h) |
| P1-12 | Batch delete sin indicador de progreso | UX menor | M (3h) |
| P2-02 | Sin skeleton loading en vistas secundarias | UX — flash de "no hay datos" | M (4h) |
| P2-03 | Stats recalculan en cada render (deps inestables) | Performance menor | M (3h) |
| P2-06 | Cache de monitores crece indefinidamente | Memoria — leak lento | S (2h) |
| P2-07 | Quiet hours sin timezone/DST | Bug menor — notificaciones fuera de horario | M (4h) |
| P2-08 | CreditCardCalculator deprecated pero usado en 5 archivos | Deuda técnica — confusión | M (4h) |
| P2-12 | Filtrado transacciones duplicado en vistas | Duplicidad menor | M (4h) |
| P2-13 | dateRange objeto nuevo en cada render | Performance menor | M (3h) |
| P2-14 | useEffect intervalo sin cleanup completo | Bug potencial | S (2h) |
| P2-15 | addTransaction no idempotente en retry | Bug — duplicados posibles | M (4h) |

### Baja prioridad

| ID | Descripción | Impacto | Esfuerzo |
|----|-------------|---------|----------|
| P2-17 | Bundle size — tree-shaking oportunidades | Performance carga | M (4h) |
| P2-18 | Iconos PNG sin optimizar | Performance carga | S (2h) |
| P3-01 | Cobertura tests ~15% (objetivo 70%) | Mantenibilidad | XL (30h) |

---

## 📊 Resumen

- 28 de 47 hallazgos resueltos (60%)
- 5 de alta prioridad pendientes (~11h de trabajo)
- 11 de media prioridad (~39h)
- 3 de baja prioridad (~36h)
- Total pendiente estimado: ~86h
