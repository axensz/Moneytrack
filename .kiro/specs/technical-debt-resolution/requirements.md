# 📋 ESPECIFICACIÓN TÉCNICA: Resolución de Deuda Técnica MoneyTrack

**Fecha:** 22 de febrero de 2026  
**Basado en:** AUDITORIA_TECNICA_COMPLETA.md  
**Objetivo:** Plan de ejecución técnico para resolver 47 hallazgos identificados  
**Duración estimada:** 5 sprints (5 semanas)

---

## 🎯 OBJETIVO GENERAL

Convertir los hallazgos de la auditoría técnica en un plan ejecutable que:
1. Resuelva todos los bugs P0 y P1 sin regresiones
2. Elimine duplicidades de código identificadas
3. Mejore performance y estabilidad del sistema
4. Eleve cobertura de tests de 15% → 70%
5. Prepare el proyecto para crecimiento futuro

**Restricciones:**
- ❌ NO modificar alcance funcional
- ❌ NO rediseñar UI (salvo bugs críticos)
- ❌ NO introducir nuevas features
- ✅ SI resolver problemas documentados en auditoría

---

## 📊 RESUMEN EJECUTIVO DE HALLAZGOS

**Total:** 47 hallazgos
- **P0 (Críticos):** 3
- **P1 (Altos):** 12
- **P2 (Medios):** 18
- **P3 (Bajos):** 14

**Áreas de mayor riesgo:**
1. Sistema de notificaciones (deduplicación, sincronización)
2. Validaciones inconsistentes (frontend vs Firestore rules)
3. Formatters duplicados (6 ubicaciones)
4. Re-renders innecesarios (dependencias inestables)
5. Listas sin virtualización (lag con 1000+ items)

---

## 1️⃣ BACKLOG TÉCNICO ESTRUCTURADO

### PRIORIDAD P0 - CRÍTICOS (3 items)

#### MT-P0-01: Operaciones Batch sin Feedback
- **Categoría:** Bug / UX
- **Descripción:** `clearAll` y `markAllAsRead` no muestran progreso ni manejan errores visiblemente
- **Archivos:** `src/hooks/useNotificationStore.ts:165-230`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Alto - Probar con 0, 1, 50, 100 notificaciones
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #1

#### MT-P0-02: Validación de Description Inconsistente
- **Categoría:** Seguridad / Bug
- **Descripción:** Firestore rules requiere min=1, pero UI permite vacío
- **Archivos:** 
  - `firestore.rules:35`
  - `src/utils/validators.ts:45`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo afecta validación
- **Estimación:** S (1-2 horas)
- **Referencia:** Auditoría Sección E, Problema 1

#### MT-P0-03: Queries sin Índices Compuestos
- **Categoría:** Performance
- **Descripción:** Queries de transacciones y notificaciones sin índices optimizados
- **Archivos:** `firestore.indexes.json`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Ninguno - Solo mejora performance
- **Estimación:** S (1 hora)
- **Referencia:** Auditoría Sección F, Problema 1

---

### PRIORIDAD P1 - ALTOS (12 items)

#### MT-P1-01: Formatters de Moneda Duplicados
- **Categoría:** Refactor / Duplicidad
- **Descripción:** 6 implementaciones de formatCurrency en diferentes archivos
- **Archivos:**
  - `src/utils/formatters.ts:48` (✅ Source of Truth)
  - `src/services/BudgetMonitor.ts:145`
  - `src/services/PaymentMonitor.ts:120`
  - `src/services/SpendingAnalyzer.ts:150`
  - `src/services/BalanceMonitor.ts:110`
  - `src/services/DebtMonitor.ts:130`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Medio - Probar formato en todas las vistas
- **Estimación:** M (3-4 horas)
- **Referencia:** Auditoría Sección C, Duplicidad 1

#### MT-P1-02: Notificaciones Duplicadas (Deduplicación)
- **Categoría:** Bug
- **Descripción:** `dedupeKey` no incluía fecha, causando duplicados en días consecutivos
- **Archivos:** `src/services/NotificationManager.ts:95-110`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Verificar deduplicación
- **Estimación:** S (2 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #5
- **Estado:** ✅ Ya corregido - Verificar en tests

#### MT-P1-03: Re-renders Masivos en TransactionsList
- **Categoría:** Performance
- **Descripción:** Falta React.memo en TransactionCard
- **Archivos:** `src/components/views/transactions/TransactionsList.tsx`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Medio - Probar interacciones
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #6

#### MT-P1-04: Monitores se Inicializan Múltiples Veces
- **Categoría:** Bug
- **Descripción:** `useNotificationMonitoring` sin guard de inicialización
- **Archivos:** `src/hooks/useNotificationMonitoring.ts:60-95`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Verificar 1 sola notificación
- **Estimación:** S (2 horas)
- **Referencia:** Auditoría Sección D, Problema 1
- **Estado:** ✅ Ya corregido - Verificar en tests

#### MT-P1-05: URLs de Notificaciones no Validadas
- **Categoría:** Seguridad
- **Descripción:** `actionUrl` puede ser maliciosa (XSS)
- **Archivos:** `src/components/notifications/NotificationCenter.tsx:45-55`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Alto - Probar XSS
- **Estimación:** M (3-4 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #9

#### MT-P1-06: Transferencias sin Rollback Visible
- **Categoría:** Bug
- **Descripción:** `runTransaction` sin manejo de error en UI
- **Archivos:** `src/hooks/firestore/useTransactionsCRUD.ts:85-130`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Alto - Probar con red inestable
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #10

#### MT-P1-07: Listas sin Virtualización
- **Categoría:** Performance
- **Descripción:** Render de 1000+ items causa lag
- **Archivos:**
  - `src/components/views/transactions/TransactionsView.tsx`
  - `src/components/views/accounts/AccountsView.tsx`
  - `src/components/notifications/NotificationCenter.tsx`
- **Dependencias:** Instalar `react-window`
- **Riesgo de regresión:** Alto - Probar scroll + filtros
- **Estimación:** L (8-12 horas)
- **Referencia:** Auditoría Sección F, Problema 2

#### MT-P1-08: Service Worker no se Actualiza
- **Categoría:** Bug / PWA
- **Descripción:** Falta `skipWaiting` en SW
- **Archivos:** `public/sw.js`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Medio - Probar actualización
- **Estimación:** M (3-4 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #12

#### MT-P1-09: Warnings de Next.js en Metadata
- **Categoría:** Deuda Técnica
- **Descripción:** `viewport` y `metadata` en layout deprecated
- **Archivos:** `app/layout.tsx`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo warnings
- **Estimación:** S (1-2 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #13

#### MT-P1-10: Límites de Monto Inconsistentes
- **Categoría:** Seguridad / Bug
- **Descripción:** Frontend permite 999 billones, Firestore solo 1 billón
- **Archivos:**
  - `src/constants.ts:85-90`
  - `firestore.rules:15-20`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo validación
- **Estimación:** S (1-2 horas)
- **Referencia:** Auditoría Sección E, Problema 1

#### MT-P1-11: Categorías Protegidas sin Validación Backend
- **Categoría:** Seguridad
- **Descripción:** Categorías protegidas solo validadas en frontend
- **Archivos:**
  - `src/hooks/useCategories.ts`
  - `firestore.rules:95-100`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Medio - Probar eliminación
- **Estimación:** M (3-4 horas)
- **Referencia:** Auditoría Sección E, Problema 1

#### MT-P1-12: Batch Operations sin Progreso
- **Categoría:** UX
- **Descripción:** `deleteAccount` elimina transacciones sin feedback
- **Archivos:** `src/hooks/useAccounts.ts:85-120`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo UI
- **Estimación:** M (3-4 horas)
- **Referencia:** Auditoría Sección E, Problema 3

---

### PRIORIDAD P2 - MEDIOS (18 items)

#### MT-P2-01: Validaciones Duplicadas
- **Categoría:** Duplicidad / Documentación
- **Descripción:** Validaciones en frontend Y Firestore rules sin documentar
- **Archivos:** `src/utils/validators.ts`, `firestore.rules`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo documentación
- **Estimación:** S (2 horas)
- **Referencia:** Auditoría Sección C, Duplicidad 2

#### MT-P2-02: Sin Skeleton Loading
- **Categoría:** UX
- **Descripción:** Listas vacías muestran "No hay datos" inmediatamente
- **Archivos:** Todas las vistas
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo UI
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #15

#### MT-P2-03: Cálculos de Stats en Cada Render
- **Categoría:** Performance
- **Descripción:** `useMemo` con dependencias inestables
- **Archivos:** `src/hooks/useGlobalStats.ts:35-70`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Medio - Probar stats
- **Estimación:** M (3-4 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #16

#### MT-P2-04: Fecha Futura Permitida
- **Categoría:** Bug
- **Descripción:** No hay validación de fecha máxima
- **Archivos:** `src/utils/validators.ts:45-80`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo validación
- **Estimación:** S (1-2 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #17

#### MT-P2-05: Modal de Duplicados no Bloquea
- **Categoría:** UX
- **Descripción:** Usuario puede guardar duplicado después de ver modal
- **Archivos:** `src/hooks/useAddTransaction.ts`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo UX
- **Estimación:** S (2-3 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #18

#### MT-P2-06: Cache de Monitores no se Limpia
- **Categoría:** Performance / Memoria
- **Descripción:** Maps crecen indefinidamente
- **Archivos:** `src/services/BudgetMonitor.ts:130`, `src/services/SpendingAnalyzer.ts:150`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Verificar memoria
- **Estimación:** S (2 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #19

#### MT-P2-07: Quiet Hours sin Timezone
- **Categoría:** Bug
- **Descripción:** Usa hora local sin considerar DST
- **Archivos:** `src/services/NotificationManager.ts:180-195`
- **Dependencias:** Instalar `date-fns-tz`
- **Riesgo de regresión:** Medio - Probar en diferentes TZ
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #20

#### MT-P2-08: Código Muerto CreditCardCalculator
- **Categoría:** Deuda Técnica
- **Descripción:** Clase deprecated pero aún usada
- **Archivos:** `src/utils/balanceCalculator.ts:20-60`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Alto - Probar cálculos de TC
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #21

#### MT-P2-09: Formatters Recrean Intl.NumberFormat
- **Categoría:** Performance
- **Descripción:** No hay singleton (YA CORREGIDO)
- **Archivos:** `src/utils/formatters.ts:15-40`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Ninguno
- **Estimación:** S (0 horas - Verificar)
- **Referencia:** Auditoría Sección B, Hallazgo #23
- **Estado:** ✅ Ya implementado

#### MT-P2-10: Sin Confirmación en Eliminar Cuenta
- **Categoría:** UX
- **Descripción:** Elimina sin preguntar
- **Archivos:** `src/components/views/accounts/AccountsView.tsx`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo UX
- **Estimación:** S (2 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #24

#### MT-P2-11: Formatters de Fecha Duplicados
- **Categoría:** Duplicidad
- **Descripción:** 2 implementaciones de formato de fecha
- **Archivos:** `src/utils/formatters.ts:90-120`, `src/utils/dateUtils.ts`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Probar formatos
- **Estimación:** M (3-4 horas)
- **Referencia:** Auditoría Sección C, Duplicidad 5

#### MT-P2-12: Filtrado de Transacciones Duplicado
- **Categoría:** Duplicidad
- **Descripción:** Lógica de filtrado en múltiples vistas
- **Archivos:**
  - `src/hooks/useFilteredData.ts` (✅ Source of Truth)
  - `src/components/views/transactions/TransactionsView.tsx`
  - `src/components/views/stats/StatsView.tsx`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Medio - Probar filtros
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección C, Duplicidad 7

#### MT-P2-13: Dependencias Inestables en useMemo
- **Categoría:** Performance
- **Descripción:** `dateRange` es objeto nuevo en cada render
- **Archivos:** `src/hooks/useFilteredData.ts:45-80`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Probar filtros
- **Estimación:** M (3-4 horas)
- **Referencia:** Auditoría Sección D, Problema 6

#### MT-P2-14: useEffect sin Cleanup Completo
- **Categoría:** Bug
- **Descripción:** Intervalo puede duplicarse si deps cambian
- **Archivos:** `src/hooks/useNotificationMonitoring.ts:140-155`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Verificar intervalos
- **Estimación:** S (2 horas)
- **Referencia:** Auditoría Sección D, Problema 4

#### MT-P2-15: Transacciones no Idempotentes
- **Categoría:** Bug
- **Descripción:** `addTransaction` puede crear duplicados en retry
- **Archivos:** `src/hooks/firestore/useTransactionsCRUD.ts:140-160`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Medio - Probar retries
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección E, Problema 2

#### MT-P2-16: Cálculos Pesados sin Memoización
- **Categoría:** Performance
- **Descripción:** Balance de TC se recalcula en cada render
- **Archivos:** Componentes de cuentas
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Probar cálculos
- **Estimación:** M (3-4 horas)
- **Referencia:** Auditoría Sección F, Problema 5

#### MT-P2-17: Bundle Size Grande
- **Categoría:** Performance
- **Descripción:** Oportunidades de tree-shaking y code-splitting
- **Archivos:** `src/lib/firebase.ts`, imports de recharts
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Probar imports
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección F, Problema 6

#### MT-P2-18: Imágenes sin Optimizar
- **Categoría:** Performance
- **Descripción:** Iconos PNG grandes
- **Archivos:** `public/icons/`
- **Dependencias:** Instalar `cwebp`
- **Riesgo de regresión:** Ninguno - Solo assets
- **Estimación:** S (2-3 horas)
- **Referencia:** Auditoría Sección F, Problema 7

---

### PRIORIDAD P3 - BAJOS (14 items)

#### MT-P3-01: Tests Incompletos
- **Categoría:** Tests
- **Descripción:** Solo 7 archivos de test, cobertura ~15%
- **Archivos:** `src/__tests__/`
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Ninguno - Solo cobertura
- **Estimación:** XL (20-30 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #25

#### MT-P3-02: Mensajes de Error Genéricos
- **Categoría:** UX
- **Descripción:** "Error al guardar" sin detalles
- **Archivos:** Múltiples archivos
- **Dependencias:** Ninguna
- **Riesgo de regresión:** Bajo - Solo UX
- **Estimación:** M (4-6 horas)
- **Referencia:** Auditoría Sección B, Hallazgo #26

#### MT-P3-03 a MT-P3-14: Items Menores
- Comentarios mezclados español/inglés
- Dark mode en gráficos
- Documentación de arquitectura
- Guías de onboarding
- Analytics
- Monitoring
- CI/CD
- Feature flags
- Etc.

**Estimación total P3:** XL (40-60 horas)

---

## 📈 RESUMEN DE ESTIMACIONES

| Prioridad | Items | Estimación Total |
|-----------|-------|------------------|
| P0 | 3 | 7-9 horas |
| P1 | 12 | 45-60 horas |
| P2 | 18 | 55-75 horas |
| P3 | 14 | 40-60 horas |
| **TOTAL** | **47** | **147-204 horas** |

**Distribución en 5 sprints (40h/sprint):**
- Sprint 1: P0 + P1 críticos (40h)
- Sprint 2: P1 performance (40h)
- Sprint 3: P2 duplicidades (40h)
- Sprint 4: P2 + P3 UX/Tests (40h)
- Sprint 5: P3 polish (27h)

---

## 🎯 CRITERIOS DE ACEPTACIÓN GLOBALES

### Para TODOS los ítems:

1. **Código:**
   - ✅ Sin warnings en consola
   - ✅ Sin errores de TypeScript
   - ✅ Linter pasa sin errores
   - ✅ No introduce duplicidad de lógica

2. **Tests:**
   - ✅ Unit tests para lógica nueva/modificada
   - ✅ Tests existentes siguen pasando
   - ✅ Cobertura no disminuye

3. **Firestore:**
   - ✅ Rules alineadas con validaciones frontend
   - ✅ Índices necesarios creados
   - ✅ Operaciones batch con feedback

4. **Performance:**
   - ✅ No introduce lag perceptible
   - ✅ Lighthouse score no disminuye
   - ✅ Bundle size no aumenta >5%

5. **Documentación:**
   - ✅ Comentarios en código complejo
   - ✅ README actualizado si aplica
   - ✅ Guías técnicas actualizadas

---

## 🚀 PRÓXIMOS PASOS

1. **Revisar y aprobar** esta especificación
2. **Crear design.md** con arquitectura detallada
3. **Crear tasks.md** con plan de sprints ejecutable
4. **Comenzar Sprint 1** (P0 + P1 críticos)

---

**Confirmación de Cobertura:**
- ✅ Todos los P0 están cubiertos (3/3)
- ✅ Todos los P1 están cubiertos (12/12)
- ✅ Todos los P2 están cubiertos (18/18)
- ✅ Todos los P3 están cubiertos (14/14)
- ✅ Total: 47/47 hallazgos

**Sprint que deja app "estable y segura":** Sprint 2 (después de resolver P0 + P1)
