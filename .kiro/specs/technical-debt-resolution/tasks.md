# 📋 PLAN DE IMPLEMENTACIÓN: Resolución de Deuda Técnica MoneyTrack

**Basado en:** requirements.md + design.md  
**Lenguaje:** TypeScript (Next.js)  
**Duración:** 5 sprints (5 semanas)

---

## 🎯 OVERVIEW

Este plan ejecuta la resolución de 47 hallazgos técnicos en 5 sprints incrementales:
- **Sprint 1:** Estabilización crítica (P0 + P1 críticos)
- **Sprint 2:** Performance y estabilidad (P1 + P2 performance)
- **Sprint 3:** Eliminación de duplicidades (P2 refactors)
- **Sprint 4:** UX y cobertura de tests (P2 + P3 tests)
- **Sprint 5:** Polish y cobertura 70% (P3 restantes)

**Checkpoint de Estabilidad:** Después de Sprint 2, la app está "estable y segura"

---

## 📦 SPRINT 1: ESTABILIZACIÓN CRÍTICA (40h)

### Objetivo
Resolver todos los P0 + P1 críticos sin regresiones

---

- [x] 1. Configurar índices compuestos en Firestore (MT-P0-03)
  - Actualizar `firestore.indexes.json` con índices para transactions y notifications
  - Desplegar índices: `firebase deploy --only firestore:indexes`
  - Verificar en Firebase Console que índices están activos
  - _Requirements: MT-P0-03_
  - _Riesgo: Ninguno - Solo mejora performance_


- [x] 2. Implementar validación consistente de description (MT-P0-02)
  - [x] 2.1 Actualizar `src/utils/validators.ts` con regla min=1 para description
    - Modificar `validateTransaction` para rechazar descriptions vacías
    - Agregar mensaje de error específico: "La descripción es requerida"
    - _Requirements: MT-P0-02_
    - _Riesgo: Bajo - Solo validación_
  
  - [ ]* 2.2 Escribir unit tests para validación de description
    - Test: description vacía debe ser rechazada
    - Test: description con solo espacios debe ser rechazada
    - Test: description válida debe ser aceptada
    - _Requirements: MT-P0-02_
  
  - [x] 2.3 Verificar que Firestore rules ya tiene min=1
    - Revisar `firestore.rules` línea 35
    - Documentar en comentario que frontend y backend están alineados
    - _Requirements: MT-P0-02_

- [x] 3. Unificar formatters de moneda (MT-P1-01)
  - [x] 3.1 Verificar que `src/utils/formatters.ts` tiene singleton
    - Confirmar que `CurrencyFormatter` usa patrón singleton
    - Si no existe, implementar singleton para `Intl.NumberFormat`
    - _Requirements: MT-P1-01_
    - _Riesgo: Medio - Usado en 20+ lugares_
  
  - [x] 3.2 Migrar `src/services/BudgetMonitor.ts` a usar formatters centralizados
    - Reemplazar implementación local línea 145
    - Importar `formatCurrency` de `@/utils/formatters`
    - Eliminar código duplicado
    - _Requirements: MT-P1-01_
  
  - [x] 3.3 Migrar `src/services/PaymentMonitor.ts` a usar formatters centralizados
    - Reemplazar implementación local línea 120
    - Importar `formatCurrency` de `@/utils/formatters`
    - Eliminar código duplicado
    - _Requirements: MT-P1-01_
  
  - [x] 3.4 Migrar `src/services/SpendingAnalyzer.ts` a usar formatters centralizados
    - Reemplazar implementación local línea 150
    - Importar `formatCurrency` de `@/utils/formatters`
    - Eliminar código duplicado
    - _Requirements: MT-P1-01_
  
  - [x] 3.5 Migrar `src/services/BalanceMonitor.ts` a usar formatters centralizados
    - Reemplazar implementación local línea 110
    - Importar `formatCurrency` de `@/utils/formatters`
    - Eliminar código duplicado
    - _Requirements: MT-P1-01_
  
  - [x] 3.6 Migrar `src/services/DebtMonitor.ts` a usar formatters centralizados
    - Reemplazar implementación local línea 130
    - Importar `formatCurrency` de `@/utils/formatters`
    - Eliminar código duplicado
    - _Requirements: MT-P1-01_
  
  - [ ]* 3.7 Escribir property test para equivalencia de formatters
    - **Property 3: Formatter Equivalence**
    - Usar `fast-check` para generar montos aleatorios
    - Verificar que todas las implementaciones producen mismo output
    - **Validates: Requirements MT-P1-01**


- [x] 4. Verificar deduplicación de notificaciones (MT-P1-02)
  - [x] 4.1 Revisar implementación actual de dedupeKey
    - Verificar que incluye fecha: `${type}_${entityId}_${date}`
    - Confirmar que funciona correctamente en días consecutivos
    - _Requirements: MT-P1-02_
    - _Riesgo: Bajo - Ya corregido_
  
  - [ ]* 4.2 Escribir property test para deduplicación
    - **Property 4: Notification Deduplication**
    - Generar notificaciones con mismo dedupeKey en 24h
    - Verificar que solo existe 1 en el sistema
    - **Validates: Requirements MT-P1-02**

- [~] 5. Implementar validación de URLs en notificaciones (MT-P1-05)
  - [~] 5.1 Crear función `isValidActionUrl` en `src/utils/validators.ts`
    - Definir patrones permitidos: `/transactions/*`, `/accounts/*`, `/budgets/*`
    - Rechazar: `javascript:`, `data:`, URLs externas
    - Retornar boolean
    - _Requirements: MT-P1-05_
    - _Riesgo: Alto - Seguridad XSS_
  
  - [~] 5.2 Aplicar validación en `NotificationCenter.tsx`
    - Importar `isValidActionUrl`
    - Validar `actionUrl` antes de `router.push`
    - Si inválida, no navegar y log warning
    - _Requirements: MT-P1-05_
  
  - [ ]* 5.3 Escribir unit tests para validación de URLs
    - Test: URLs maliciosas rechazadas (`javascript:alert(1)`, `data:text/html`)
    - Test: URLs válidas aceptadas (`/transactions/123`)
    - Test: URLs externas rechazadas (`https://evil.com`)
    - _Requirements: MT-P1-05_
  
  - [ ]* 5.4 Escribir property test para URL validation
    - **Property 7: URL Validation Security**
    - Generar URLs aleatorias
    - Verificar que solo patrones permitidos son aceptados
    - **Validates: Requirements MT-P1-05**


- [~] 6. Implementar feedback en operaciones batch (MT-P0-01, MT-P1-12)
  - [~] 6.1 Crear tipo `BatchProgress` en `src/types/index.ts`
    - Definir interface con `total`, `processed`, `errors[]`
    - Exportar tipo
    - _Requirements: MT-P0-01, MT-P1-12_
    - _Riesgo: Alto - Probar con muchos items_
  
  - [~] 6.2 Implementar hook `useBatchOperations` en `src/hooks/useBatchOperations.ts`
    - Crear estado `progress: BatchProgress | null`
    - Implementar `clearAll` con actualización de progreso
    - Implementar `markAllAsRead` con actualización de progreso
    - Capturar errores en array `errors`
    - _Requirements: MT-P0-01_
  
  - [~] 6.3 Crear componente `BatchProgressModal` en `src/components/common/`
    - Mostrar progreso: "Procesando X de Y..."
    - Mostrar barra de progreso visual
    - Mostrar lista de errores si existen
    - Permitir cancelación si es posible
    - _Requirements: MT-P0-01_
  
  - [~] 6.4 Integrar `BatchProgressModal` en `NotificationCenter.tsx`
    - Usar hook `useBatchOperations`
    - Mostrar modal cuando `progress !== null`
    - _Requirements: MT-P0-01_
  
  - [~] 6.5 Implementar progreso en `deleteAccount` en `src/hooks/useAccounts.ts`
    - Contar transacciones a eliminar
    - Actualizar progreso por cada transacción eliminada
    - Mostrar feedback al usuario
    - _Requirements: MT-P1-12_
  
  - [ ]* 6.6 Escribir unit tests para batch operations
    - Test: Batch con 0 items
    - Test: Batch con 1 item
    - Test: Batch con 50 items
    - Test: Batch con errores en medio
    - _Requirements: MT-P0-01, MT-P1-12_
  
  - [ ]* 6.7 Escribir property test para batch progress
    - **Property 1: Batch Operations Progress Tracking**
    - Generar arrays de N items
    - Verificar que progreso se actualiza N veces
    - Verificar que processed === total al final
    - **Validates: Requirements MT-P0-01, MT-P1-12**


- [~] 7. Implementar rollback visible en transferencias (MT-P1-06)
  - [~] 7.1 Actualizar `executeTransfer` en `src/hooks/firestore/useTransactionsCRUD.ts`
    - Usar `writeBatch` para operaciones atómicas
    - Capturar errores de Firestore
    - Retornar objeto con `success`, `error`, `rollbackComplete`
    - _Requirements: MT-P1-06_
    - _Riesgo: Alto - Lógica crítica de balance_
  
  - [~] 7.2 Crear función `handleFirestoreError` en `src/utils/errorHandlers.ts`
    - Mapear códigos de error a mensajes útiles
    - Casos: `permission-denied`, `not-found`, `aborted`, etc.
    - _Requirements: MT-P1-06_
  
  - [~] 7.3 Mostrar feedback de rollback en UI
    - Si `rollbackComplete === true`, mostrar mensaje: "La transferencia falló y los cambios fueron revertidos"
    - Permitir retry
    - _Requirements: MT-P1-06_
  
  - [ ]* 7.4 Escribir unit tests para transferencias
    - Test: Transferencia exitosa actualiza ambas cuentas
    - Test: Transferencia fallida no modifica cuentas
    - Test: Error de red muestra mensaje correcto
    - _Requirements: MT-P1-06_
  
  - [ ]* 7.5 Escribir property test para rollback
    - **Property 8: Transaction Rollback Completeness**
    - Simular fallos aleatorios
    - Verificar que estado se revierte completamente
    - **Validates: Requirements MT-P1-06**

- [~] 8. Alinear límites de monto frontend-backend (MT-P1-10)
  - [~] 8.1 Actualizar `VALIDATION_RULES` en `src/constants.ts`
    - Cambiar `max` de 999 billones a 1 billón
    - Documentar que debe coincidir con Firestore rules
    - _Requirements: MT-P1-10_
    - _Riesgo: Bajo - Solo validación_
  
  - [~] 8.2 Verificar que Firestore rules tiene límite de 1 billón
    - Revisar `firestore.rules` líneas 15-20
    - Agregar comentario explicando límite
    - _Requirements: MT-P1-10_
  
  - [ ]* 8.3 Escribir property test para validación consistente
    - **Property 2: Frontend-Backend Validation Consistency**
    - Generar montos aleatorios
    - Verificar que frontend y backend validan igual
    - **Validates: Requirements MT-P0-02, MT-P1-10**


- [~] 9. Implementar validación backend de categorías protegidas (MT-P1-11)
  - [~] 9.1 Actualizar Firestore rules para categorías protegidas
    - Agregar función `isProtectedCategory(name)`
    - Lista: `['Salario', 'Transferencia', 'Ajuste']`
    - Rechazar `delete` si categoría está protegida
    - _Requirements: MT-P1-11_
    - _Riesgo: Medio - Probar eliminación_
  
  - [~] 9.2 Actualizar `VALIDATION_RULES` en `src/utils/validators.ts`
    - Agregar lista de categorías protegidas
    - Crear función `isProtectedCategory`
    - _Requirements: MT-P1-11_
  
  - [~] 9.3 Aplicar validación en `useCategories.ts`
    - Verificar antes de eliminar
    - Mostrar mensaje: "Esta categoría está protegida y no puede eliminarse"
    - _Requirements: MT-P1-11_
  
  - [ ]* 9.4 Escribir unit tests para categorías protegidas
    - Test: Eliminar categoría protegida es rechazada
    - Test: Eliminar categoría normal es permitida
    - Test: Frontend y backend rechazan igual
    - _Requirements: MT-P1-11_
  
  - [ ]* 9.5 Escribir property test para protected categories
    - **Property 10: Protected Category Enforcement**
    - Generar categorías aleatorias
    - Verificar que protegidas son rechazadas
    - **Validates: Requirements MT-P1-11**

- [~] 10. Fix warnings de Next.js metadata (MT-P1-09)
  - [~] 10.1 Actualizar `app/layout.tsx` para Next.js 14+
    - Mover `viewport` a export separado
    - Actualizar sintaxis de `metadata`
    - Seguir guía oficial de Next.js
    - _Requirements: MT-P1-09_
    - _Riesgo: Bajo - Solo warnings_
  
  - [~] 10.2 Verificar que warnings desaparecen
    - Ejecutar `npm run dev`
    - Confirmar 0 warnings en consola
    - _Requirements: MT-P1-09_

- [~] 11. Verificar inicialización única de monitores (MT-P1-04)
  - [~] 11.1 Revisar `useNotificationMonitoring.ts` líneas 60-95
    - Confirmar que tiene guard de inicialización
    - Verificar que monitores solo se crean una vez
    - _Requirements: MT-P1-04_
    - _Riesgo: Bajo - Ya corregido_
  
  - [ ]* 11.2 Escribir property test para monitor initialization
    - **Property 6: Monitor Initialization Idempotence**
    - Simular múltiples montajes/desmontajes
    - Verificar que cada monitor se inicializa exactamente 1 vez
    - **Validates: Requirements MT-P1-04**

- [~] 12. Checkpoint Sprint 1 - Verificación
  - Ejecutar todos los tests: `npm test`
  - Verificar 0 warnings en consola
  - Verificar que todos los P0 están resueltos
  - Verificar que 9 de 12 P1 están resueltos
  - Preguntar al usuario si hay dudas o problemas

---

## 📦 SPRINT 2: PERFORMANCE Y ESTABILIDAD (40h)

### Objetivo
App estable, segura y performante (checkpoint de estabilidad)

---

- [~] 13. Implementar React.memo en TransactionCard (MT-P1-03)
  - [~] 13.1 Envolver `TransactionCard` con `React.memo`
    - Agregar comparación custom en segundo argumento
    - Comparar solo `transaction.id` y `transaction.updatedAt`
    - _Requirements: MT-P1-03_
    - _Riesgo: Medio - Puede causar bugs sutiles_
  
  - [~] 13.2 Memoizar callbacks en `TransactionsList`
    - Usar `useCallback` para `onEdit` y `onDelete`
    - Asegurar dependencias estables
    - _Requirements: MT-P1-03_
  
  - [ ]* 13.3 Medir re-renders con React DevTools Profiler
    - Benchmark antes: contar re-renders con 100 transacciones
    - Benchmark después: verificar reducción >80%
    - Documentar resultados
    - _Requirements: MT-P1-03_
  
  - [ ]* 13.4 Escribir property test para render proportionality
    - **Property 5: Render Proportionality**
    - Generar listas de N items
    - Cambiar solo M items
    - Verificar que re-renders ≈ M, no N
    - **Validates: Requirements MT-P1-03**

- [~] 14. Implementar virtualización de listas (MT-P1-07)
  - [~] 14.1 Instalar react-window
    - Ejecutar: `npm install react-window`
    - Instalar types: `npm install --save-dev @types/react-window`
    - _Requirements: MT-P1-07_
    - _Riesgo: Alto - Puede romper filtros_
  
  - [~] 14.2 Crear componente `VirtualizedList` en `src/components/common/`
    - Props: `items`, `itemHeight`, `renderItem`, `fallbackThreshold`
    - Usar `FixedSizeList` de react-window
    - Fallback a lista normal si `items.length < 50`
    - _Requirements: MT-P1-07_
  
  - [~] 14.3 Migrar `TransactionsView` a usar `VirtualizedList`
    - Reemplazar map por `VirtualizedList`
    - Configurar `itemHeight={80}`
    - Probar con 1000+ transacciones
    - _Requirements: MT-P1-07_
  
  - [~] 14.4 Migrar `NotificationCenter` a usar `VirtualizedList`
    - Reemplazar map por `VirtualizedList`
    - Configurar `itemHeight={100}`
    - Probar con 500+ notificaciones
    - _Requirements: MT-P1-07_
  
  - [~] 14.5 Migrar `AccountsView` a usar `VirtualizedList`
    - Reemplazar map por `VirtualizedList`
    - Configurar `itemHeight={120}`
    - Probar con 100+ cuentas
    - _Requirements: MT-P1-07_
  
  - [ ]* 14.6 Escribir tests E2E para virtualización
    - Test: Scroll con 1000+ items es fluido (60fps)
    - Test: Filtros actualizan virtualización correctamente
    - Test: Selección de items funciona
    - Test: Búsqueda mantiene posición
    - _Requirements: MT-P1-07_
  
  - [ ]* 14.7 Escribir property test para virtualization performance
    - **Property 9: Virtualization Performance Constancy**
    - Generar listas de N items (N > 100)
    - Medir tiempo de render inicial
    - Verificar que es O(1) respecto a N
    - **Validates: Requirements MT-P1-07**


- [~] 15. Implementar auto-update de Service Worker (MT-P1-08)
  - [~] 15.1 Actualizar `public/sw.js` con `skipWaiting`
    - Agregar listener para `install`: `self.skipWaiting()`
    - Agregar listener para `activate`: `clients.claim()`
    - _Requirements: MT-P1-08_
    - _Riesgo: Medio - Probar actualización_
  
  - [~] 15.2 Implementar notificación de actualización en UI
    - Detectar nuevo SW disponible
    - Mostrar toast: "Nueva versión disponible. Recargar?"
    - Botón para recargar página
    - _Requirements: MT-P1-08_
  
  - [ ]* 15.3 Probar actualización de SW manualmente
    - Desplegar versión nueva
    - Verificar que SW se actualiza automáticamente
    - Verificar que usuario ve notificación
    - _Requirements: MT-P1-08_

- [~] 16. Optimizar useMemo en useGlobalStats (MT-P2-03)
  - [~] 16.1 Revisar dependencias de `useMemo` en `src/hooks/useGlobalStats.ts`
    - Identificar dependencias inestables (objetos, arrays)
    - Reemplazar con primitivos estables
    - _Requirements: MT-P2-03_
    - _Riesgo: Medio - Probar stats_
  
  - [~] 16.2 Memoizar cálculos pesados
    - `totalBalance`: solo recalcular si `accounts` cambia
    - `monthlyExpenses`: solo recalcular si `transactions` cambia
    - Usar primitivos en deps: `accounts.length`, `transactions.length`
    - _Requirements: MT-P2-03_
  
  - [ ]* 16.3 Escribir tests para memoización
    - Test: Cálculo no se ejecuta si deps no cambian
    - Test: Cálculo se ejecuta si deps cambian
    - Usar spy para contar ejecuciones
    - _Requirements: MT-P2-03_

- [~] 17. Implementar limpieza de cache en monitores (MT-P2-06)
  - [~] 17.1 Agregar límite máximo a cache en `BudgetMonitor.ts`
    - Definir `MAX_CACHE_SIZE = 1000`
    - Implementar LRU (Least Recently Used) eviction
    - Limpiar entries antiguas cuando se alcanza límite
    - _Requirements: MT-P2-06_
    - _Riesgo: Bajo - Verificar memoria_
  
  - [~] 17.2 Agregar límite máximo a cache en `SpendingAnalyzer.ts`
    - Definir `MAX_CACHE_SIZE = 1000`
    - Implementar LRU eviction
    - _Requirements: MT-P2-06_
  
  - [ ]* 17.3 Escribir property test para cache bounded growth
    - **Property 13: Cache Bounded Growth**
    - Ejecutar N operaciones (N > 1000)
    - Verificar que cache.size <= MAX_CACHE_SIZE
    - **Validates: Requirements MT-P2-06**


- [~] 18. Estabilizar dependencias en useFilteredData (MT-P2-13)
  - [~] 18.1 Refactorizar `useFilteredData` en `src/hooks/useFilteredData.ts`
    - Reemplazar `filters.dateRange` con `filters.startDate` y `filters.endDate`
    - Usar primitivos en deps de `useMemo`
    - _Requirements: MT-P2-13_
    - _Riesgo: Bajo - Probar filtros_
  
  - [~] 18.2 Actualizar componentes que usan `useFilteredData`
    - Pasar `startDate` y `endDate` en lugar de `dateRange`
    - Verificar que filtros funcionan igual
    - _Requirements: MT-P2-13_
  
  - [ ]* 18.3 Escribir tests para dependencias estables
    - Test: useMemo no recalcula si fechas no cambian
    - Test: useMemo recalcula si fechas cambian
    - _Requirements: MT-P2-13_

- [~] 19. Memoizar cálculos de tarjetas de crédito (MT-P2-16)
  - [~] 19.1 Identificar componentes que calculan balance de TC
    - Buscar cálculos en componentes de cuentas
    - Envolver en `useMemo` con deps correctas
    - _Requirements: MT-P2-16_
    - _Riesgo: Bajo - Probar cálculos_
  
  - [~] 19.2 Crear hook `useCreditCardBalance` si es necesario
    - Centralizar lógica de cálculo
    - Memoizar resultado
    - _Requirements: MT-P2-16_
  
  - [ ]* 19.3 Escribir property test para memoization effectiveness
    - **Property 11: Memoization Effectiveness**
    - Generar datos sin cambios
    - Verificar que factory no se ejecuta
    - **Validates: Requirements MT-P2-03, MT-P2-13, MT-P2-16**

- [~] 20. Optimizar bundle size (MT-P2-17)
  - [~] 20.1 Implementar dynamic imports para recharts
    - Usar `next/dynamic` para importar gráficos
    - Configurar `ssr: false` si es necesario
    - _Requirements: MT-P2-17_
    - _Riesgo: Bajo - Probar imports_
  
  - [~] 20.2 Optimizar imports de Firebase
    - Importar solo funciones necesarias de `firebase/firestore`
    - Evitar `import * as firebase`
    - _Requirements: MT-P2-17_
  
  - [~] 20.3 Analizar bundle con `@next/bundle-analyzer`
    - Instalar: `npm install --save-dev @next/bundle-analyzer`
    - Ejecutar análisis: `ANALYZE=true npm run build`
    - Identificar oportunidades adicionales
    - _Requirements: MT-P2-17_
  
  - [ ]* 20.4 Verificar reducción de bundle size
    - Medir antes: ~450KB
    - Medir después: objetivo <380KB
    - Documentar reducción
    - _Requirements: MT-P2-17_

- [~] 21. Checkpoint Sprint 2 - Verificación de Estabilidad
  - Ejecutar todos los tests: `npm test`
  - Ejecutar Lighthouse: objetivo score >90
  - Verificar bundle size: objetivo <380KB
  - Probar con 1000+ items en listas (debe ser fluido)
  - Confirmar que todos los P1 están resueltos (12/12)
  - **CHECKPOINT: App está "estable y segura"**
  - Preguntar al usuario si hay dudas o problemas

---

## 📦 SPRINT 3: ELIMINACIÓN DE DUPLICIDADES (40h)

### Objetivo
Código DRY y mantenible

---

- [~] 22. Documentar validaciones frontend-backend (MT-P2-01)
  - [~] 22.1 Crear `docs/VALIDATIONS.md`
    - Tabla de validaciones: campo, frontend, backend, tests
    - Documentar cada regla de validación
    - Explicar por qué deben estar sincronizadas
    - _Requirements: MT-P2-01_
    - _Riesgo: Bajo - Solo documentación_
  
  - [~] 22.2 Agregar comentarios en `firestore.rules`
    - Explicar cada función de validación
    - Referenciar `VALIDATIONS.md`
    - _Requirements: MT-P2-01_
  
  - [~] 22.3 Agregar comentarios en `src/utils/validators.ts`
    - Explicar cada regla
    - Referenciar Firestore rules correspondientes
    - _Requirements: MT-P2-01_

- [~] 23. Eliminar CreditCardCalculator deprecated (MT-P2-08)
  - [~] 23.1 Identificar todos los usos de `CreditCardCalculator`
    - Buscar: `grep -r "CreditCardCalculator" src/`
    - Documentar cada uso
    - _Requirements: MT-P2-08_
    - _Riesgo: Alto - Cálculos críticos_
  
  - [~] 23.2 Crear tests de equivalencia
    - Para cada uso, crear test que compara resultado antiguo vs nuevo
    - Generar 100+ casos de prueba
    - Verificar que diferencia < 0.01
    - _Requirements: MT-P2-08_
  
  - [~] 23.3 Migrar a nueva implementación
    - Reemplazar llamadas a `CreditCardCalculator`
    - Usar nueva implementación
    - Verificar que tests de equivalencia pasan
    - _Requirements: MT-P2-08_
  
  - [~] 23.4 Eliminar clase `CreditCardCalculator`
    - Eliminar de `src/utils/balanceCalculator.ts`
    - Eliminar imports
    - _Requirements: MT-P2-08_
  
  - [ ]* 23.5 Escribir property test para calculator equivalence
    - **Property 14: Calculator Equivalence**
    - Generar transacciones de TC aleatorias
    - Verificar que nuevo cálculo ≈ antiguo (±0.01)
    - **Validates: Requirements MT-P2-08**


- [~] 24. Unificar formatters de fecha (MT-P2-11)
  - [~] 24.1 Identificar implementaciones duplicadas de formato de fecha
    - Buscar en `src/utils/formatters.ts` y `src/utils/dateUtils.ts`
    - Documentar diferencias
    - _Requirements: MT-P2-11_
    - _Riesgo: Bajo - Probar formatos_
  
  - [~] 24.2 Consolidar en `src/utils/formatters.ts`
    - Mantener solo una implementación
    - Soportar diferentes formatos: 'short', 'long', 'relative'
    - _Requirements: MT-P2-11_
  
  - [~] 24.3 Migrar todos los usos a formatter centralizado
    - Buscar: `grep -r "formatDate\|format.*Date" src/`
    - Reemplazar con import de `@/utils/formatters`
    - _Requirements: MT-P2-11_
  
  - [~] 24.4 Eliminar `src/utils/dateUtils.ts` si queda vacío
    - Verificar que no tiene otras funciones útiles
    - Eliminar archivo
    - _Requirements: MT-P2-11_
  
  - [ ]* 24.5 Escribir tests para formatters de fecha
    - Test: Diferentes formatos producen output esperado
    - Test: Fechas edge case (año bisiesto, cambio de horario)
    - _Requirements: MT-P2-11_

- [~] 25. Centralizar filtrado de transacciones (MT-P2-12)
  - [~] 25.1 Verificar que `src/hooks/useFilteredData.ts` es Source of Truth
    - Revisar implementación actual
    - Documentar como Source of Truth
    - _Requirements: MT-P2-12_
    - _Riesgo: Medio - Probar filtros_
  
  - [~] 25.2 Identificar implementaciones duplicadas de filtrado
    - Buscar en `TransactionsView.tsx`
    - Buscar en `StatsView.tsx`
    - Documentar lógica duplicada
    - _Requirements: MT-P2-12_
  
  - [~] 25.3 Migrar `TransactionsView` a usar `useFilteredData`
    - Reemplazar lógica local con hook
    - Verificar que filtros funcionan igual
    - _Requirements: MT-P2-12_
  
  - [~] 25.4 Migrar `StatsView` a usar `useFilteredData`
    - Reemplazar lógica local con hook
    - Verificar que stats se calculan igual
    - _Requirements: MT-P2-12_
  
  - [ ]* 25.5 Escribir property test para filter equivalence
    - **Property 15: Filter Equivalence**
    - Generar transacciones y filtros aleatorios
    - Verificar que todas las implementaciones producen mismo resultado
    - **Validates: Requirements MT-P2-12**


- [~] 26. Implementar validación de fecha futura (MT-P2-04)
  - [~] 26.1 Agregar validación en `src/utils/validators.ts`
    - Función `isValidDate(date: Date): boolean`
    - Rechazar fechas futuras: `date > new Date()`
    - Mensaje: "La fecha no puede ser futura"
    - _Requirements: MT-P2-04_
    - _Riesgo: Bajo - Solo validación_
  
  - [~] 26.2 Aplicar validación en formularios de transacciones
    - Validar antes de guardar
    - Mostrar error en campo de fecha
    - _Requirements: MT-P2-04_
  
  - [ ]* 26.3 Escribir property test para future date rejection
    - **Property 12: Future Date Rejection**
    - Generar fechas aleatorias
    - Verificar que futuras son rechazadas
    - **Validates: Requirements MT-P2-04**

- [~] 27. Hacer modal de duplicados bloqueante (MT-P2-05)
  - [~] 27.1 Actualizar `useAddTransaction.ts`
    - Cuando se detecta duplicado, bloquear botón "Guardar"
    - Mostrar solo opciones: "Cancelar" o "Guardar de todas formas"
    - _Requirements: MT-P2-05_
    - _Riesgo: Bajo - Solo UX_
  
  - [~] 27.2 Actualizar UI del modal
    - Hacer modal no-dismissible (no cerrar con click fuera)
    - Botones claros: "Cancelar" (rojo) y "Continuar" (amarillo)
    - _Requirements: MT-P2-05_
  
  - [ ]* 27.3 Escribir tests para modal bloqueante
    - Test: No se puede guardar sin confirmar
    - Test: Cancelar cierra modal sin guardar
    - Test: Continuar guarda la transacción
    - _Requirements: MT-P2-05_

- [~] 28. Implementar quiet hours con timezone (MT-P2-07)
  - [~] 28.1 Instalar date-fns-tz
    - Ejecutar: `npm install date-fns-tz`
    - _Requirements: MT-P2-07_
    - _Riesgo: Medio - Probar en diferentes TZ_
  
  - [~] 28.2 Actualizar `NotificationManager.ts` líneas 180-195
    - Usar `zonedTimeToUtc` y `utcToZonedTime`
    - Considerar DST (Daylight Saving Time)
    - Obtener timezone del usuario: `Intl.DateTimeFormat().resolvedOptions().timeZone`
    - _Requirements: MT-P2-07_
  
  - [~] 28.3 Crear función `isInQuietHours(date: Date, timezone: string): boolean`
    - Convertir a timezone del usuario
    - Verificar si está entre 22:00 y 08:00
    - _Requirements: MT-P2-07_
  
  - [ ]* 28.4 Escribir tests para quiet hours
    - Test: Diferentes timezones
    - Test: Cambio de horario (DST)
    - Test: Bordes (22:00, 08:00)
    - _Requirements: MT-P2-07_


- [~] 29. Implementar cleanup completo en useEffect (MT-P2-14)
  - [~] 29.1 Revisar `useNotificationMonitoring.ts` líneas 140-155
    - Verificar que interval se limpia en cleanup
    - Agregar flag para evitar updates después de unmount
    - _Requirements: MT-P2-14_
    - _Riesgo: Bajo - Verificar intervalos_
  
  - [~] 29.2 Patrón de cleanup robusto
    ```typescript
    useEffect(() => {
      let mounted = true;
      const interval = setInterval(() => {
        if (mounted) {
          checkNotifications();
        }
      }, 60000);
      
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    }, [checkNotifications]);
    ```
    - _Requirements: MT-P2-14_
  
  - [ ]* 29.3 Escribir tests para cleanup
    - Test: Interval se limpia en unmount
    - Test: No hay updates después de unmount
    - Test: Re-mount crea nuevo interval
    - _Requirements: MT-P2-14_

- [~] 30. Implementar idempotencia en transacciones (MT-P2-15)
  - [~] 30.1 Agregar campo `idempotencyKey` a transacciones
    - Generar UUID único por operación
    - Almacenar en Firestore
    - _Requirements: MT-P2-15_
    - _Riesgo: Medio - Probar retries_
  
  - [~] 30.2 Verificar duplicados antes de crear
    - Query por `idempotencyKey` antes de `addDoc`
    - Si existe, retornar transacción existente
    - Si no existe, crear nueva
    - _Requirements: MT-P2-15_
  
  - [~] 30.3 Actualizar Firestore rules para idempotencyKey
    - Agregar índice para `idempotencyKey`
    - Validar que es string no vacío
    - _Requirements: MT-P2-15_
  
  - [ ]* 30.4 Escribir property test para transaction idempotence
    - **Property 16: Transaction Idempotence**
    - Ejecutar operación N veces con mismo idempotencyKey
    - Verificar que solo existe 1 transacción
    - **Validates: Requirements MT-P2-15**

- [~] 31. Optimizar imágenes (MT-P2-18)
  - [~] 31.1 Convertir iconos PNG a WebP
    - Instalar cwebp: `npm install --save-dev cwebp-bin`
    - Script para convertir: `public/icons/*.png` → `*.webp`
    - _Requirements: MT-P2-18_
    - _Riesgo: Ninguno - Solo assets_
  
  - [~] 31.2 Actualizar referencias a iconos
    - Buscar: `grep -r "\.png" src/`
    - Reemplazar con `.webp`
    - Mantener `.png` como fallback
    - _Requirements: MT-P2-18_
  
  - [ ]* 31.3 Verificar reducción de tamaño
    - Medir antes: tamaño total de `public/icons/`
    - Medir después: objetivo reducción >50%
    - _Requirements: MT-P2-18_

- [~] 32. Checkpoint Sprint 3 - Verificación
  - Ejecutar todos los tests: `npm test`
  - Verificar que no hay código duplicado crítico
  - Verificar que 10 de 18 P2 están resueltos
  - Revisar documentación actualizada
  - Preguntar al usuario si hay dudas o problemas

---

## 📦 SPRINT 4: UX Y COBERTURA DE TESTS (40h)

### Objetivo
UX pulida y cobertura 50%+

---

- [~] 33. Implementar skeleton loading (MT-P2-02)
  - [~] 33.1 Crear componente `SkeletonLoader` en `src/components/common/`
    - Props: `count`, `height`, `className`
    - Usar animación de shimmer
    - _Requirements: MT-P2-02_
    - _Riesgo: Bajo - Solo UI_
  
  - [~] 33.2 Integrar en `TransactionsView`
    - Mostrar skeleton mientras `loading === true`
    - Reemplazar "No hay datos" inmediato
    - _Requirements: MT-P2-02_
  
  - [~] 33.3 Integrar en `AccountsView`
    - Mostrar skeleton mientras `loading === true`
    - _Requirements: MT-P2-02_
  
  - [~] 33.4 Integrar en `NotificationCenter`
    - Mostrar skeleton mientras `loading === true`
    - _Requirements: MT-P2-02_
  
  - [~] 33.5 Integrar en `StatsView`
    - Mostrar skeleton para gráficos mientras cargan
    - _Requirements: MT-P2-02_

- [~] 34. Agregar confirmación al eliminar cuenta (MT-P2-10)
  - [~] 34.1 Crear modal de confirmación
    - Título: "¿Eliminar cuenta?"
    - Mensaje: "Esta acción eliminará X transacciones asociadas"
    - Botones: "Cancelar" y "Eliminar"
    - _Requirements: MT-P2-10_
    - _Riesgo: Bajo - Solo UX_
  
  - [~] 34.2 Integrar en `AccountsView`
    - Mostrar modal antes de `deleteAccount`
    - Solo eliminar si usuario confirma
    - _Requirements: MT-P2-10_
  
  - [ ]* 34.3 Escribir tests para confirmación
    - Test: Cancelar no elimina cuenta
    - Test: Confirmar elimina cuenta
    - _Requirements: MT-P2-10_


- [~] 35. Mejorar mensajes de error (MT-P3-02)
  - [~] 35.1 Crear catálogo de mensajes de error en `src/constants/errorMessages.ts`
    - Mapear códigos de error a mensajes útiles
    - Incluir sugerencias de acción
    - _Requirements: MT-P3-02_
    - _Riesgo: Bajo - Solo UX_
  
  - [~] 35.2 Actualizar manejo de errores en `useTransactionsCRUD`
    - Reemplazar "Error al guardar" con mensajes específicos
    - Ejemplos: "No tienes permisos", "La cuenta no existe", etc.
    - _Requirements: MT-P3-02_
  
  - [~] 35.3 Actualizar manejo de errores en `useAccounts`
    - Mensajes específicos para cada tipo de error
    - _Requirements: MT-P3-02_
  
  - [~] 35.4 Actualizar manejo de errores en `useCategories`
    - Mensajes específicos para cada tipo de error
    - _Requirements: MT-P3-02_
  
  - [~] 35.5 Actualizar manejo de errores en `NotificationManager`
    - Mensajes específicos para cada tipo de error
    - _Requirements: MT-P3-02_

- [~] 36. Tests críticos - Formatters y Validators (MT-P3-01)
  - [ ]* 36.1 Escribir tests para `src/utils/formatters.ts`
    - Test: formatCurrency con valores positivos
    - Test: formatCurrency con valores negativos
    - Test: formatCurrency con valores muy grandes
    - Test: formatDate con diferentes formatos
    - Test: formatNumber con decimales
    - Test: formatPercentage
    - _Requirements: MT-P3-01_
    - _Estimación: 2h_
  
  - [ ]* 36.2 Escribir tests para `src/utils/validators.ts`
    - Test: validateTransaction con datos válidos
    - Test: validateTransaction con datos inválidos
    - Test: isValidActionUrl con URLs maliciosas
    - Test: isValidActionUrl con URLs válidas
    - Test: isValidDate con fechas futuras
    - Test: isProtectedCategory
    - _Requirements: MT-P3-01_
    - _Estimación: 2h_


- [~] 37. Tests críticos - NotificationManager (MT-P3-01)
  - [ ]* 37.1 Escribir tests para `src/services/NotificationManager.ts`
    - Test: create con datos válidos
    - Test: create con actionUrl inválida (debe rechazar)
    - Test: deduplicación funciona correctamente
    - Test: quiet hours respeta timezone
    - Test: prioridades se asignan correctamente
    - _Requirements: MT-P3-01_
    - _Estimación: 4h_

- [~] 38. Tests críticos - BudgetMonitor (MT-P3-01)
  - [ ]* 38.1 Escribir tests para `src/services/BudgetMonitor.ts`
    - Test: detecta cuando presupuesto es excedido
    - Test: calcula porcentaje gastado correctamente
    - Test: cache funciona correctamente
    - Test: limpieza de cache cuando alcanza límite
    - Test: notificaciones se crean en momentos correctos
    - _Requirements: MT-P3-01_
    - _Estimación: 4h_

- [~] 39. Tests críticos - TransactionsCRUD (MT-P3-01)
  - [ ]* 39.1 Escribir tests para `src/hooks/firestore/useTransactionsCRUD.ts`
    - Test: addTransaction con datos válidos
    - Test: addTransaction con datos inválidos (debe rechazar)
    - Test: updateTransaction actualiza correctamente
    - Test: deleteTransaction elimina correctamente
    - Test: executeTransfer actualiza ambas cuentas
    - Test: executeTransfer con error hace rollback
    - Test: idempotencia funciona (mismo idempotencyKey)
    - _Requirements: MT-P3-01_
    - _Estimación: 6h_

- [~] 40. Tests críticos - Hooks principales (MT-P3-01)
  - [ ]* 40.1 Escribir tests para `src/hooks/useGlobalStats.ts`
    - Test: cálculos son correctos
    - Test: memoización funciona
    - Test: actualiza cuando deps cambian
    - _Requirements: MT-P3-01_
    - _Estimación: 2h_
  
  - [ ]* 40.2 Escribir tests para `src/hooks/useFilteredData.ts`
    - Test: filtros por fecha funcionan
    - Test: filtros por categoría funcionan
    - Test: filtros por cuenta funcionan
    - Test: múltiples filtros combinados
    - Test: memoización funciona
    - _Requirements: MT-P3-01_
    - _Estimación: 3h_
  
  - [ ]* 40.3 Escribir tests para `src/hooks/useBatchOperations.ts`
    - Test: clearAll actualiza progreso
    - Test: markAllAsRead actualiza progreso
    - Test: errores son capturados
    - Test: progreso final es correcto
    - _Requirements: MT-P3-01_
    - _Estimación: 3h_

- [~] 41. Checkpoint Sprint 4 - Verificación de Cobertura
  - Ejecutar tests con coverage: `npm test -- --coverage`
  - Verificar cobertura >50%
  - Identificar áreas sin cobertura
  - Verificar que 12 de 18 P2 están resueltos
  - Preguntar al usuario si hay dudas o problemas

---

## 📦 SPRINT 5: POLISH Y COBERTURA 70% (27h)

### Objetivo
Proyecto production-ready con cobertura 70%+

---

- [~] 42. Tests restantes - Componentes (MT-P3-01)
  - [ ]* 42.1 Escribir tests para `src/components/views/transactions/TransactionsList.tsx`
    - Test: renderiza lista correctamente
    - Test: virtualización funciona con 100+ items
    - Test: filtros actualizan lista
    - Test: callbacks funcionan (onEdit, onDelete)
    - _Requirements: MT-P3-01_
    - _Estimación: 3h_
  
  - [ ]* 42.2 Escribir tests para `src/components/notifications/NotificationCenter.tsx`
    - Test: renderiza notificaciones
    - Test: markAsRead funciona
    - Test: clearAll funciona
    - Test: navegación con actionUrl funciona
    - _Requirements: MT-P3-01_
    - _Estimación: 3h_

- [~] 43. Tests restantes - Services (MT-P3-01)
  - [ ]* 43.1 Escribir tests para `src/services/PaymentMonitor.ts`
    - Test: detecta pagos próximos
    - Test: notificaciones se crean correctamente
    - Test: cache funciona
    - _Requirements: MT-P3-01_
    - _Estimación: 2h_
  
  - [ ]* 43.2 Escribir tests para `src/services/SpendingAnalyzer.ts`
    - Test: analiza gastos correctamente
    - Test: detecta patrones de gasto
    - Test: cache funciona
    - _Requirements: MT-P3-01_
    - _Estimación: 2h_
  
  - [ ]* 43.3 Escribir tests para `src/services/BalanceMonitor.ts`
    - Test: monitorea balance correctamente
    - Test: alertas de balance bajo
    - _Requirements: MT-P3-01_
    - _Estimación: 1h_

- [~] 44. Tests restantes - Utils (MT-P3-01)
  - [ ]* 44.1 Escribir tests para `src/utils/errorHandlers.ts`
    - Test: handleFirestoreError mapea códigos correctamente
    - Test: mensajes son útiles
    - _Requirements: MT-P3-01_
    - _Estimación: 2h_
  
  - [ ]* 44.2 Escribir tests para `src/utils/balanceCalculator.ts`
    - Test: cálculos de balance son correctos
    - Test: cálculos de TC son correctos
    - Test: edge cases (balance negativo, límite excedido)
    - _Requirements: MT-P3-01_
    - _Estimación: 2h_


- [~] 45. Estandarizar comentarios (MT-P3-03)
  - [~] 45.1 Crear guía de estilo de comentarios
    - Decidir idioma: español o inglés (consistente)
    - Documentar en `docs/STYLE_GUIDE.md`
    - _Requirements: MT-P3-03_
    - _Riesgo: Bajo - Solo estilo_
  
  - [~] 45.2 Actualizar comentarios en archivos críticos
    - Priorizar: hooks, services, utils
    - Usar JSDoc para funciones públicas
    - _Requirements: MT-P3-03_

- [~] 46. Implementar dark mode en gráficos (MT-P3-04)
  - [~] 46.1 Detectar tema actual del sistema
    - Usar `useTheme` o `window.matchMedia('(prefers-color-scheme: dark)')`
    - _Requirements: MT-P3-04_
    - _Riesgo: Bajo - Solo UI_
  
  - [~] 46.2 Actualizar colores de recharts según tema
    - Colores claros para dark mode
    - Colores oscuros para light mode
    - _Requirements: MT-P3-04_
  
  - [~] 46.3 Probar en ambos temas
    - Verificar legibilidad
    - Verificar contraste
    - _Requirements: MT-P3-04_

- [~] 47. Documentar arquitectura (MT-P3-05)
  - [~] 47.1 Crear `docs/ARCHITECTURE.md`
    - Diagrama de componentes principales
    - Flujo de datos
    - Estructura de carpetas
    - Decisiones de diseño
    - _Requirements: MT-P3-05_
  
  - [~] 47.2 Crear `docs/TESTING.md`
    - Estrategia de testing
    - Cómo ejecutar tests
    - Cómo escribir nuevos tests
    - Property-based testing guide
    - _Requirements: MT-P3-05_
  
  - [~] 47.3 Actualizar `README.md`
    - Agregar badges (coverage, build status)
    - Agregar sección de arquitectura
    - Agregar sección de testing
    - _Requirements: MT-P3-05_

- [~] 48. Crear guías de onboarding (MT-P3-06)
  - [~] 48.1 Crear `docs/ONBOARDING.md`
    - Setup inicial del proyecto
    - Estructura del código
    - Flujos principales
    - Cómo contribuir
    - _Requirements: MT-P3-06_
  
  - [~] 48.2 Crear `docs/CONTRIBUTING.md`
    - Proceso de PR
    - Estándares de código
    - Checklist de PR
    - _Requirements: MT-P3-06_


- [~] 49. Verificación final y métricas
  - [~] 49.1 Ejecutar suite completa de tests
    - `npm test -- --coverage`
    - Verificar cobertura >70%
    - Verificar 0 tests flaky
    - _Requirements: MT-P3-01_
  
  - [~] 49.2 Ejecutar Lighthouse audit
    - Performance >90
    - Accessibility >90
    - Best Practices >90
    - SEO >90
    - _Requirements: Todos_
  
  - [~] 49.3 Verificar bundle size
    - Ejecutar: `ANALYZE=true npm run build`
    - Verificar <350KB
    - Documentar reducción desde inicio
    - _Requirements: MT-P2-17_
  
  - [~] 49.4 Verificar que todos los hallazgos están resueltos
    - P0: 3/3 ✅
    - P1: 12/12 ✅
    - P2: 18/18 ✅
    - P3: 14/14 ✅
    - Total: 47/47 ✅
  
  - [~] 49.5 Generar reporte final
    - Métricas antes vs después
    - Hallazgos resueltos
    - Cobertura de tests
    - Performance improvements
    - Documentar en `docs/RESOLUTION_REPORT.md`

- [~] 50. Checkpoint Final - Proyecto Production-Ready
  - Todos los tests pasan
  - Cobertura >70%
  - Lighthouse score >90
  - Bundle size <350KB
  - Documentación completa
  - 47/47 hallazgos resueltos
  - **PROYECTO LISTO PARA NUEVAS FEATURES**
  - Celebrar 🎉

---

## 📊 RESUMEN DE TAREAS

| Sprint | Tareas | Estimación | Hallazgos Resueltos |
|--------|--------|------------|---------------------|
| Sprint 1 | 1-12 | 40h | P0 (3) + P1 (9) |
| Sprint 2 | 13-21 | 40h | P1 (3) + P2 (5) |
| Sprint 3 | 22-32 | 40h | P2 (10) |
| Sprint 4 | 33-41 | 40h | P2 (3) + P3 (1) |
| Sprint 5 | 42-50 | 27h | P3 (13) |
| **TOTAL** | **50 tareas** | **187h** | **47 hallazgos** |

## 🎯 ORDEN DE IMPLEMENTACIÓN RECOMENDADO

**Dentro de cada sprint, seguir el orden de las tareas.**

**Dependencias críticas:**
- Tarea 1 (índices) debe completarse antes de desplegar
- Tarea 6 (batch operations) debe completarse antes de tarea 7 (transferencias)
- Tarea 14 (virtualización) debe completarse antes de tarea 13 (React.memo)
- Tarea 23 (CreditCardCalculator) requiere tests exhaustivos antes de eliminar

**Tareas opcionales (marcadas con *):**
- Pueden saltarse para MVP más rápido
- Recomendado completarlas para cobertura 70%

---

**Documento completado. Listo para ejecución.**
