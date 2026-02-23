# 🏗️ DISEÑO TÉCNICO: Resolución de Deuda Técnica MoneyTrack

**Fecha:** 22 de febrero de 2026  
**Basado en:** requirements.md (47 hallazgos estructurados)  
**Objetivo:** Arquitectura de solución ejecutable en 5 sprints

---

## 📋 ÍNDICE

1. [Overview](#overview)
2. [Plan de 5 Sprints](#plan-de-5-sprints)
3. [Definición de Hecho (DoD)](#definición-de-hecho-dod)
4. [Matriz de Riesgos](#matriz-de-riesgos)
5. [Arquitectura de Solución](#arquitectura-de-solución)
6. [Guías Técnicas Obligatorias](#guías-técnicas-obligatorias)
7. [Components and Interfaces](#components-and-interfaces)
8. [Data Models](#data-models)
9. [Correctness Properties](#correctness-properties)
10. [Error Handling](#error-handling)
11. [Testing Strategy](#testing-strategy)

---

## 1. OVERVIEW

### Contexto

MoneyTrack tiene 47 hallazgos técnicos identificados en auditoría completa:
- 3 bugs críticos (P0) que afectan UX y seguridad
- 12 problemas altos (P1) de performance y estabilidad
- 18 problemas medios (P2) de duplicidad y deuda técnica
- 14 problemas bajos (P3) de polish y cobertura

### Objetivo del Diseño

Proveer arquitectura de solución que:
1. Resuelva P0+P1 en Sprint 1-2 (app estable y segura)
2. Elimine duplicidades sin refactors grandes
3. Mejore performance sin cambiar funcionalidad
4. Eleve cobertura de tests de 15% → 70%
5. Prepare el proyecto para crecimiento futuro

### Restricciones Críticas

- ❌ NO modificar alcance funcional
- ❌ NO rediseñar UI (salvo bugs críticos)
- ❌ NO introducir nuevas features
- ❌ NO refactors grandes en Sprint 1
- ✅ SI resolver problemas documentados
- ✅ SI mantener compatibilidad con código existente

### Principios de Diseño

1. **Incremental:** Cada cambio es pequeño y verificable
2. **Backward Compatible:** No romper funcionalidad existente
3. **Test-First:** Tests antes de refactors grandes
4. **Performance-Aware:** Medir antes y después
5. **Security-First:** Validaciones backend siempre

---

## 2. PLAN DE 5 SPRINTS

### Sprint 1: Estabilización Crítica (40h)
**Objetivo:** Resolver todos los P0 + P1 críticos sin regresiones

**Alcance:**
- MT-P0-01: Operaciones Batch con Feedback (6h)
- MT-P0-02: Validación Description Consistente (2h)
- MT-P0-03: Índices Compuestos Firestore (1h)
- MT-P1-01: Formatters de Moneda Unificados (4h)
- MT-P1-02: Verificar Deduplicación Notificaciones (2h)
- MT-P1-04: Verificar Inicialización Monitores (2h)
- MT-P1-05: Validación URLs Notificaciones (4h)
- MT-P1-06: Rollback Visible en Transferencias (6h)
- MT-P1-09: Fix Warnings Next.js Metadata (2h)
- MT-P1-10: Límites de Monto Consistentes (2h)
- MT-P1-11: Categorías Protegidas Backend (4h)
- MT-P1-12: Batch Operations con Progreso (4h)

**Entregables:**
- ✅ Todos los P0 resueltos
- ✅ 9 de 12 P1 resueltos
- ✅ Tests de regresión para cada fix
- ✅ Sin warnings en consola
- ✅ Firestore rules actualizadas

**Riesgos:**
- Alto: Transferencias (MT-P1-06) puede romper lógica existente
- Medio: Formatters (MT-P1-01) usados en 20+ lugares
- Bajo: Resto son cambios aislados


### Sprint 2: Performance y Estabilidad (40h)
**Objetivo:** App estable, segura y performante

**Alcance:**
- MT-P1-03: React.memo en TransactionCard (6h)
- MT-P1-07: Virtualización de Listas (12h)
- MT-P1-08: Service Worker Auto-Update (4h)
- MT-P2-03: Optimizar useMemo en Stats (4h)
- MT-P2-06: Limpieza de Cache Monitores (2h)
- MT-P2-13: Dependencias Estables en Filtros (4h)
- MT-P2-16: Memoización Cálculos TC (4h)
- MT-P2-17: Bundle Size Optimization (4h)

**Entregables:**
- ✅ Todos los P1 resueltos (12/12)
- ✅ Listas con 1000+ items sin lag
- ✅ Re-renders reducidos 80%
- ✅ Bundle size reducido 15%
- ✅ Lighthouse score >90

**Riesgos:**
- Alto: Virtualización (MT-P1-07) puede romper filtros/scroll
- Medio: React.memo puede causar bugs sutiles
- Bajo: Resto son optimizaciones aisladas

**Checkpoint:** Después de este sprint, la app está "estable y segura"


### Sprint 3: Eliminación de Duplicidades (40h)
**Objetivo:** Código DRY y mantenible

**Alcance:**
- MT-P2-01: Documentar Validaciones (2h)
- MT-P2-08: Eliminar CreditCardCalculator (6h)
- MT-P2-11: Unificar Formatters de Fecha (4h)
- MT-P2-12: Centralizar Filtrado de Transacciones (6h)
- MT-P2-04: Validación Fecha Futura (2h)
- MT-P2-05: Modal Duplicados Bloqueante (3h)
- MT-P2-07: Quiet Hours con Timezone (6h)
- MT-P2-14: Cleanup Completo useEffect (2h)
- MT-P2-15: Transacciones Idempotentes (6h)
- MT-P2-18: Optimizar Imágenes (3h)

**Entregables:**
- ✅ 10 de 18 P2 resueltos
- ✅ Duplicidades críticas eliminadas
- ✅ Documentación de arquitectura actualizada
- ✅ Guías técnicas creadas

**Riesgos:**
- Alto: CreditCardCalculator (MT-P2-08) usado en cálculos críticos
- Medio: Filtrado centralizado puede romper vistas
- Bajo: Resto son cambios aislados


### Sprint 4: UX y Cobertura de Tests (40h)
**Objetivo:** UX pulida y cobertura 50%+

**Alcance:**
- MT-P2-02: Skeleton Loading (6h)
- MT-P2-10: Confirmación Eliminar Cuenta (2h)
- MT-P3-02: Mensajes de Error Específicos (6h)
- MT-P3-01: Tests Críticos (26h)
  - Formatters (2h)
  - Validators (2h)
  - NotificationManager (4h)
  - BudgetMonitor (4h)
  - TransactionsCRUD (6h)
  - Hooks principales (8h)

**Entregables:**
- ✅ 12 de 18 P2 resueltos
- ✅ Cobertura de tests 50%+
- ✅ UX mejorada en flujos críticos
- ✅ Mensajes de error útiles

**Riesgos:**
- Medio: Tests pueden descubrir bugs ocultos
- Bajo: Cambios de UX son aditivos


### Sprint 5: Polish y Cobertura 70% (27h)
**Objetivo:** Proyecto production-ready

**Alcance:**
- MT-P3-01: Tests Restantes (15h)
  - Components (6h)
  - Services (5h)
  - Utils (4h)
- MT-P3-03 a MT-P3-14: Items Menores (12h)
  - Comentarios consistentes (2h)
  - Dark mode en gráficos (3h)
  - Documentación arquitectura (4h)
  - Guías onboarding (3h)

**Entregables:**
- ✅ Todos los P2 resueltos (18/18)
- ✅ Cobertura de tests 70%+
- ✅ Documentación completa
- ✅ Proyecto listo para nuevas features

**Riesgos:**
- Bajo: Solo polish y documentación

---

## 3. DEFINICIÓN DE HECHO (DoD)

### DoD Global (Aplica a TODOS los ítems)

#### Código
- [ ] Sin warnings en consola del navegador
- [ ] Sin errores de TypeScript (`npm run type-check`)
- [ ] Linter pasa sin errores (`npm run lint`)
- [ ] No introduce duplicidad de lógica
- [ ] Comentarios en código complejo (>10 líneas)

#### Tests
- [ ] Unit tests para lógica nueva/modificada
- [ ] Tests existentes siguen pasando (`npm test`)
- [ ] Cobertura no disminuye
- [ ] Tests de regresión para bugs críticos


#### Firestore
- [ ] Rules alineadas con validaciones frontend
- [ ] Índices necesarios creados (`firestore.indexes.json`)
- [ ] Operaciones batch con feedback de progreso
- [ ] Queries optimizadas (sin full scans)

#### Performance
- [ ] No introduce lag perceptible (>100ms)
- [ ] Lighthouse score no disminuye
- [ ] Bundle size no aumenta >5%
- [ ] Re-renders medidos con React DevTools

#### Documentación
- [ ] README actualizado si aplica
- [ ] Guías técnicas actualizadas
- [ ] Comentarios JSDoc en funciones públicas

### DoD Específico por Tipo

#### Para Bugs (P0, P1)
- [ ] Reproducción del bug documentada
- [ ] Test de regresión que falla antes del fix
- [ ] Test de regresión pasa después del fix
- [ ] Verificado en 3 escenarios: normal, edge case, error

#### Para Refactors (Duplicidades)
- [ ] Código duplicado identificado y eliminado
- [ ] Source of Truth documentado
- [ ] Todos los usos migrados al Source of Truth
- [ ] Tests prueban equivalencia funcional


#### Para Performance (P1, P2)
- [ ] Benchmark antes del cambio
- [ ] Benchmark después del cambio
- [ ] Mejora medible (>20% o >100ms)
- [ ] No introduce regresiones funcionales

#### Para Tests (P3)
- [ ] Cobertura aumenta >5%
- [ ] Tests son determinísticos (no flaky)
- [ ] Tests son rápidos (<100ms cada uno)
- [ ] Tests documentan el comportamiento esperado

---

## 4. MATRIZ DE RIESGOS

### Riesgos Alto (Requieren Plan de Mitigación)

| ID | Ítem | Riesgo | Probabilidad | Impacto | Mitigación |
|----|------|--------|--------------|---------|------------|
| R1 | MT-P1-06 | Rollback en transferencias puede romper lógica de balance | Media | Alto | 1. Tests exhaustivos con 10+ escenarios<br>2. Feature flag para rollback gradual<br>3. Backup de datos antes de deploy |
| R2 | MT-P1-07 | Virtualización puede romper filtros y scroll infinito | Alta | Alto | 1. Tests E2E de scroll<br>2. Implementar por vista (incremental)<br>3. Fallback a lista normal si falla |
| R3 | MT-P2-08 | Eliminar CreditCardCalculator puede romper cálculos de TC | Media | Alto | 1. Tests de equivalencia con 100+ casos<br>2. Comparar resultados antes/después<br>3. Rollback plan documentado |
| R4 | MT-P1-01 | Formatters usados en 20+ lugares, cambio puede romper UI | Baja | Medio | 1. Tests visuales de cada vista<br>2. Migración gradual (1 archivo a la vez)<br>3. Verificar con datos reales |


### Riesgos Medio (Monitorear)

| ID | Ítem | Riesgo | Mitigación |
|----|------|--------|------------|
| R5 | MT-P1-03 | React.memo puede causar bugs sutiles de actualización | Tests de interacción + React DevTools |
| R6 | MT-P2-12 | Centralizar filtrado puede romper vistas específicas | Tests por vista + comparación de resultados |
| R7 | MT-P2-15 | Idempotencia puede cambiar comportamiento de retries | Tests de retry + documentación clara |
| R8 | MT-P3-01 | Tests pueden descubrir bugs ocultos | Priorizar fixes antes de continuar |

### Riesgos Bajo (Aceptables)

- Cambios de UX (skeleton, confirmaciones): Solo aditivos
- Optimizaciones de bundle: Reversibles
- Documentación: Sin impacto en código
- Warnings de Next.js: Cambios recomendados por framework

---

## 5. ARQUITECTURA DE SOLUCIÓN

### 5.1 Arquitectura de Formatters (MT-P1-01, MT-P2-11)

**Problema:** 6 implementaciones de `formatCurrency` y 2 de `formatDate`

**Solución:**

```typescript
// src/utils/formatters.ts (Source of Truth)
class CurrencyFormatter {
  private static instance: Intl.NumberFormat;
  
  static format(amount: number, currency: string = 'MXN'): string {
    if (!this.instance) {
      this.instance = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency,
      });
    }
    return this.instance.format(amount);
  }
}

export const formatCurrency = CurrencyFormatter.format;
```


**Plan de Migración:**
1. Verificar que `src/utils/formatters.ts` tiene singleton (✅ ya implementado)
2. Buscar todos los usos: `grep -r "formatCurrency" src/`
3. Reemplazar imports uno por uno:
   - `src/services/BudgetMonitor.ts:145`
   - `src/services/PaymentMonitor.ts:120`
   - `src/services/SpendingAnalyzer.ts:150`
   - `src/services/BalanceMonitor.ts:110`
   - `src/services/DebtMonitor.ts:130`
4. Eliminar implementaciones locales
5. Tests: Comparar output antes/después en cada vista

**Criterios de Éxito:**
- Solo 1 implementación de `formatCurrency`
- Todos los imports apuntan a `src/utils/formatters.ts`
- Tests visuales pasan en todas las vistas

---

### 5.2 Arquitectura de Notificaciones (MT-P0-01, MT-P1-02, MT-P1-05)

**Problemas:**
1. Operaciones batch sin feedback
2. Deduplicación ya corregida (verificar)
3. URLs no validadas (XSS)

**Solución:**

```typescript
// src/hooks/useNotificationStore.ts
interface BatchProgress {
  total: number;
  processed: number;
  errors: string[];
}

const useBatchOperations = () => {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  
  const clearAll = async () => {
    const notifications = await getAll();
    setProgress({ total: notifications.length, processed: 0, errors: [] });
    
    for (let i = 0; i < notifications.length; i++) {
      try {
        await deleteNotification(notifications[i].id);
        setProgress(prev => ({ ...prev!, processed: i + 1 }));
      } catch (error) {
        setProgress(prev => ({
          ...prev!,
          errors: [...prev!.errors, notifications[i].id]
        }));
      }
    }
    
    setProgress(null);
  };
  
  return { clearAll, progress };
};
```


**Validación de URLs:**

```typescript
// src/utils/validators.ts
const ALLOWED_URL_PATTERNS = [
  /^\/transactions\/[a-zA-Z0-9-]+$/,
  /^\/accounts\/[a-zA-Z0-9-]+$/,
  /^\/budgets\/[a-zA-Z0-9-]+$/,
];

export const isValidActionUrl = (url: string): boolean => {
  if (!url) return true; // URLs opcionales
  return ALLOWED_URL_PATTERNS.some(pattern => pattern.test(url));
};

// En NotificationCenter.tsx
const handleNotificationClick = (notification: Notification) => {
  if (notification.actionUrl && isValidActionUrl(notification.actionUrl)) {
    router.push(notification.actionUrl);
  }
};
```

**Tests Requeridos:**
- Batch con 0, 1, 50, 100 notificaciones
- Errores en medio del batch
- URLs maliciosas: `javascript:alert(1)`, `data:text/html,...`
- URLs válidas: `/transactions/123`, `/accounts/abc`

---

### 5.3 Arquitectura de Virtualización (MT-P1-07)

**Problema:** Listas con 1000+ items causan lag

**Solución:** Usar `react-window` con `FixedSizeList`

```typescript
// src/components/common/VirtualizedList.tsx
import { FixedSizeList } from 'react-window';

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function VirtualizedList<T>({ items, itemHeight, renderItem }: VirtualizedListProps<T>) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      {renderItem(items[index], index)}
    </div>
  );
  
  return (
    <FixedSizeList
      height={600}
      itemCount={items.length}
      itemSize={itemHeight}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```


**Plan de Implementación:**
1. Instalar: `npm install react-window`
2. Crear componente genérico `VirtualizedList`
3. Migrar vistas una por una:
   - `TransactionsView` (prioridad alta)
   - `NotificationCenter` (prioridad alta)
   - `AccountsView` (prioridad media)
4. Mantener fallback a lista normal si `items.length < 50`

**Tests Requeridos:**
- Scroll con 1000+ items (debe ser fluido)
- Filtros aplicados (virtualización debe actualizarse)
- Selección de items (debe funcionar)
- Búsqueda (debe mantener posición)

---

### 5.4 Arquitectura de Validaciones (MT-P0-02, MT-P1-10, MT-P1-11)

**Problema:** Validaciones inconsistentes entre frontend y Firestore rules

**Solución:** Validaciones compartidas

```typescript
// src/utils/validators.ts (Source of Truth)
export const VALIDATION_RULES = {
  transaction: {
    description: { min: 1, max: 200 },
    amount: { min: 0.01, max: 1_000_000_000 }, // 1 billón
  },
  account: {
    name: { min: 1, max: 100 },
    balance: { min: -1_000_000_000, max: 1_000_000_000 },
  },
  category: {
    name: { min: 1, max: 50 },
    protected: ['Salario', 'Transferencia', 'Ajuste'],
  },
};

export const validateTransaction = (data: Partial<Transaction>): ValidationResult => {
  const errors: string[] = [];
  
  if (!data.description || data.description.length < VALIDATION_RULES.transaction.description.min) {
    errors.push('La descripción es requerida');
  }
  
  if (data.amount && data.amount > VALIDATION_RULES.transaction.amount.max) {
    errors.push('El monto excede el límite permitido');
  }
  
  return { valid: errors.length === 0, errors };
};
```


**Firestore Rules Actualizadas:**

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Validaciones compartidas
    function isValidAmount(amount) {
      return amount >= 0.01 && amount <= 1000000000;
    }
    
    function isValidDescription(desc) {
      return desc.size() >= 1 && desc.size() <= 200;
    }
    
    function isProtectedCategory(name) {
      return name in ['Salario', 'Transferencia', 'Ajuste'];
    }
    
    match /users/{userId}/transactions/{transactionId} {
      allow create: if request.auth.uid == userId
                    && isValidAmount(request.resource.data.amount)
                    && isValidDescription(request.resource.data.description);
    }
    
    match /users/{userId}/categories/{categoryId} {
      allow delete: if request.auth.uid == userId
                    && !isProtectedCategory(resource.data.name);
    }
  }
}
```

**Documentación Requerida:**
- Tabla de validaciones en `docs/VALIDATIONS.md`
- Comentarios en `firestore.rules` explicando cada regla
- Tests que prueban frontend Y backend

---

### 5.5 Arquitectura de Performance (MT-P1-03, MT-P2-03, MT-P2-13, MT-P2-16)

**Problemas:**
1. Re-renders masivos en listas
2. Cálculos en cada render
3. Dependencias inestables en `useMemo`

**Solución 1: React.memo con comparación custom**

```typescript
// src/components/views/transactions/TransactionCard.tsx
interface TransactionCardProps {
  transaction: Transaction;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const TransactionCard = React.memo(
  ({ transaction, onEdit, onDelete }: TransactionCardProps) => {
    // Componente existente
  },
  (prevProps, nextProps) => {
    // Solo re-render si la transacción cambió
    return prevProps.transaction.id === nextProps.transaction.id
        && prevProps.transaction.updatedAt === nextProps.transaction.updatedAt;
  }
);
```


**Solución 2: Dependencias estables**

```typescript
// src/hooks/useFilteredData.ts
const useFilteredData = (transactions: Transaction[], filters: Filters) => {
  // ❌ ANTES: dateRange es objeto nuevo en cada render
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const inRange = t.date >= filters.dateRange.start && t.date <= filters.dateRange.end;
      return inRange;
    });
  }, [transactions, filters.dateRange]); // dateRange cambia siempre
  
  // ✅ DESPUÉS: Dependencias primitivas
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const inRange = t.date >= filters.startDate && t.date <= filters.endDate;
      return inRange;
    });
  }, [transactions, filters.startDate, filters.endDate]); // Primitivos estables
  
  return filtered;
};
```

**Solución 3: Memoización de cálculos pesados**

```typescript
// src/hooks/useGlobalStats.ts
const useGlobalStats = (transactions: Transaction[], accounts: Account[]) => {
  // Memoizar cálculos pesados
  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }, [accounts]); // Solo recalcular si accounts cambia
  
  const monthlyExpenses = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return transactions
      .filter(t => t.type === 'expense' && t.date >= startOfMonth)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]); // Solo recalcular si transactions cambia
  
  return { totalBalance, monthlyExpenses };
};
```

**Tests de Performance:**
- Medir re-renders con React DevTools Profiler
- Benchmark antes/después con 1000+ items
- Verificar que `useMemo` no recalcula innecesariamente

---

## 6. GUÍAS TÉCNICAS OBLIGATORIAS

### 6.1 Guía de Formatters

**Regla:** SIEMPRE usar `src/utils/formatters.ts`

```typescript
// ✅ CORRECTO
import { formatCurrency, formatDate } from '@/utils/formatters';

const price = formatCurrency(1234.56); // "$1,234.56 MXN"
const date = formatDate(new Date()); // "22 de febrero de 2026"

// ❌ INCORRECTO
const price = `$${amount.toFixed(2)}`; // No usar
const price = new Intl.NumberFormat('es-MX', {...}).format(amount); // No duplicar
```

**Funciones Disponibles:**
- `formatCurrency(amount, currency?)`: Formato de moneda
- `formatDate(date, format?)`: Formato de fecha
- `formatNumber(num, decimals?)`: Formato de número
- `formatPercentage(value)`: Formato de porcentaje

**Tests Requeridos:**
- Probar con valores negativos
- Probar con valores muy grandes (>1M)
- Probar con diferentes locales

---

### 6.2 Guía de Notificaciones

**Regla:** Usar `NotificationManager` para crear notificaciones

```typescript
// ✅ CORRECTO
import { NotificationManager } from '@/services/NotificationManager';

await NotificationManager.create({
  type: 'budget_alert',
  title: 'Presupuesto excedido',
  message: `Has gastado ${formatCurrency(spent)} de ${formatCurrency(limit)}`,
  actionUrl: `/budgets/${budgetId}`, // Validar con isValidActionUrl
  priority: 'high',
});

// ❌ INCORRECTO
await addDoc(collection(db, 'notifications'), {...}); // No usar directamente
```


**Deduplicación:**
- `dedupeKey` DEBE incluir fecha: `${type}_${entityId}_${date}`
- Verificar que no exista notificación con mismo `dedupeKey` en últimas 24h

**Validación de URLs:**
- SIEMPRE validar `actionUrl` con `isValidActionUrl()`
- Solo permitir rutas internas: `/transactions/*`, `/accounts/*`, `/budgets/*`
- Rechazar: `javascript:`, `data:`, URLs externas

**Tests Requeridos:**
- Deduplicación en días consecutivos
- URLs maliciosas rechazadas
- Notificaciones en quiet hours

---

### 6.3 Guía de Effects y Cleanup

**Regla:** SIEMPRE limpiar effects con dependencias

```typescript
// ✅ CORRECTO
useEffect(() => {
  const interval = setInterval(() => {
    checkNotifications();
  }, 60000);
  
  return () => clearInterval(interval); // Cleanup
}, [checkNotifications]); // Dependencias estables

// ❌ INCORRECTO
useEffect(() => {
  setInterval(() => {
    checkNotifications();
  }, 60000);
  // Sin cleanup - memory leak
}, []);
```

**Checklist de Effects:**
- [ ] ¿Tiene cleanup si crea timers/listeners?
- [ ] ¿Dependencias son estables (primitivos o memoizados)?
- [ ] ¿Se ejecuta solo cuando debe?
- [ ] ¿Tiene guard para evitar ejecución múltiple?

---

### 6.4 Guía de Batch Operations

**Regla:** Operaciones batch DEBEN mostrar progreso

```typescript
// ✅ CORRECTO
const deleteAccount = async (accountId: string) => {
  const transactions = await getTransactionsByAccount(accountId);
  
  setProgress({ total: transactions.length + 1, processed: 0 });
  
  for (let i = 0; i < transactions.length; i++) {
    await deleteTransaction(transactions[i].id);
    setProgress(prev => ({ ...prev!, processed: i + 1 }));
  }
  
  await deleteDoc(doc(db, 'accounts', accountId));
  setProgress(prev => ({ ...prev!, processed: prev!.total }));
  
  setProgress(null);
};
```


**UI de Progreso:**

```typescript
// En el componente
{progress && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
    <div className="bg-white p-6 rounded-lg">
      <p>Procesando {progress.processed} de {progress.total}...</p>
      <progress value={progress.processed} max={progress.total} />
    </div>
  </div>
)}
```

**Tests Requeridos:**
- Batch con 0, 1, 50, 100 items
- Errores en medio del batch
- Cancelación de batch

---

## 7. COMPONENTS AND INTERFACES

### 7.1 Interfaces Principales

```typescript
// src/types/index.ts

interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  description: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface Account {
  id: string;
  userId: string;
  name: string;
  type: 'cash' | 'bank' | 'credit_card' | 'savings';
  balance: number;
  creditLimit?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Notification {
  id: string;
  userId: string;
  type: 'budget_alert' | 'payment_reminder' | 'goal_achieved';
  title: string;
  message: string;
  actionUrl?: string;
  priority: 'low' | 'medium' | 'high';
  read: boolean;
  dedupeKey: string;
  createdAt: Date;
}

interface BatchProgress {
  total: number;
  processed: number;
  errors: string[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```


### 7.2 Componentes Clave

```typescript
// src/components/common/VirtualizedList.tsx
interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  fallbackThreshold?: number; // Default: 50
}

// src/components/common/BatchProgressModal.tsx
interface BatchProgressModalProps {
  progress: BatchProgress | null;
  onCancel?: () => void;
}

// src/components/common/SkeletonLoader.tsx
interface SkeletonLoaderProps {
  count?: number;
  height?: number;
  className?: string;
}
```

### 7.3 Hooks Principales

```typescript
// src/hooks/useBatchOperations.ts
interface UseBatchOperationsReturn {
  progress: BatchProgress | null;
  clearAll: () => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
}

// src/hooks/useOptimizedMemo.ts
function useOptimizedMemo<T>(
  factory: () => T,
  deps: React.DependencyList
): T;

// src/hooks/useStableCallback.ts
function useStableCallback<T extends (...args: any[]) => any>(
  callback: T
): T;
```

---

## 8. DATA MODELS

### 8.1 Firestore Collections

```
users/{userId}/
  ├── transactions/{transactionId}
  │   ├── id: string
  │   ├── accountId: string
  │   ├── categoryId: string
  │   ├── type: 'income' | 'expense' | 'transfer'
  │   ├── amount: number (0.01 - 1,000,000,000)
  │   ├── description: string (1-200 chars)
  │   ├── date: timestamp
  │   ├── createdAt: timestamp
  │   └── updatedAt: timestamp
  │
  ├── accounts/{accountId}
  │   ├── id: string
  │   ├── name: string (1-100 chars)
  │   ├── type: 'cash' | 'bank' | 'credit_card' | 'savings'
  │   ├── balance: number (-1B - 1B)
  │   ├── creditLimit?: number
  │   ├── createdAt: timestamp
  │   └── updatedAt: timestamp
  │
  └── notifications/{notificationId}
      ├── id: string
      ├── type: string
      ├── title: string
      ├── message: string
      ├── actionUrl?: string (validated)
      ├── priority: 'low' | 'medium' | 'high'
      ├── read: boolean
      ├── dedupeKey: string (unique per 24h)
      └── createdAt: timestamp
```


### 8.2 Índices Compuestos Requeridos

```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "accountId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "notifications",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "read", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### 8.3 Validaciones de Datos

| Campo | Frontend | Backend (Firestore Rules) | Tests |
|-------|----------|---------------------------|-------|
| `transaction.amount` | 0.01 - 1B | 0.01 - 1B | ✅ Límites, negativos |
| `transaction.description` | 1-200 chars | 1-200 chars | ✅ Vacío, muy largo |
| `account.balance` | -1B - 1B | -1B - 1B | ✅ Límites |
| `category.name` | 1-50 chars | 1-50 chars | ✅ Protegidas |
| `notification.actionUrl` | Validado | N/A | ✅ XSS, rutas válidas |

---

## 9. CORRECTNESS PROPERTIES

### Qué son las Correctness Properties

Una propiedad es una característica o comportamiento que debe mantenerse verdadero en todas las ejecuciones válidas del sistema. Las propiedades sirven como puente entre especificaciones legibles por humanos y garantías de correctitud verificables por máquina.

### Propiedades Identificadas

**Property 1: Batch Operations Progress Tracking**
*Para cualquier* operación batch (clearAll, markAllAsRead, deleteAccount) con N items, el progreso debe actualizarse N veces y el estado final debe reflejar processed === total, con todos los errores capturados en el array de errores.
**Validates: Requirements MT-P0-01, MT-P1-12**

**Property 2: Frontend-Backend Validation Consistency**
*Para cualquier* dato de entrada (descripción, monto, nombre), las validaciones del frontend y las Firestore rules deben producir el mismo resultado (aceptar o rechazar).
**Validates: Requirements MT-P0-02, MT-P1-10**

**Property 3: Formatter Equivalence**
*Para cualquier* valor (monto, fecha), todas las implementaciones de formatters deben producir el mismo output cuando se migran al Source of Truth.
**Validates: Requirements MT-P1-01, MT-P2-11**

**Property 4: Notification Deduplication**
*Para cualquier* conjunto de notificaciones con el mismo dedupeKey creadas dentro de 24 horas, solo debe existir una notificación en el sistema.
**Validates: Requirements MT-P1-02**

**Property 5: Render Proportionality**
*Para cualquier* lista de items, el número de re-renders debe ser proporcional al número de items que realmente cambiaron, no al tamaño total de la lista.
**Validates: Requirements MT-P1-03**


**Property 6: Monitor Initialization Idempotence**
*Para cualquier* secuencia de montajes y desmontajes de componentes, cada monitor debe inicializarse exactamente una vez, independientemente del número de re-renders.
**Validates: Requirements MT-P1-04**

**Property 7: URL Validation Security**
*Para cualquier* URL proporcionada en actionUrl, la validación debe rechazar todas las URLs maliciosas (javascript:, data:, externas) y aceptar solo rutas internas válidas que coincidan con los patrones permitidos.
**Validates: Requirements MT-P1-05**

**Property 8: Transaction Rollback Completeness**
*Para cualquier* transferencia que falle durante la ejecución, el estado de ambas cuentas debe revertirse completamente a su estado anterior, sin cambios parciales.
**Validates: Requirements MT-P1-06**

**Property 9: Virtualization Performance Constancy**
*Para cualquier* lista con N items donde N > 100, el tiempo de render inicial debe ser constante (O(1)) independientemente de N, y el scroll debe mantener 60fps.
**Validates: Requirements MT-P1-07**

**Property 10: Protected Category Enforcement**
*Para cualquier* categoría en la lista de protegidas, tanto el frontend como el backend deben rechazar su eliminación con el mismo mensaje de error.
**Validates: Requirements MT-P1-11**

**Property 11: Memoization Effectiveness**
*Para cualquier* hook con useMemo (useGlobalStats, useFilteredData, cálculos de TC), si las dependencias no cambian entre renders, la función factory no debe ejecutarse nuevamente.
**Validates: Requirements MT-P2-03, MT-P2-13, MT-P2-16**

**Property 12: Future Date Rejection**
*Para cualquier* fecha proporcionada que sea posterior a la fecha actual, la validación debe rechazarla tanto en frontend como en backend.
**Validates: Requirements MT-P2-04**


**Property 13: Cache Bounded Growth**
*Para cualquier* monitor con cache (BudgetMonitor, SpendingAnalyzer), después de N operaciones, el tamaño del cache debe estar acotado por un límite máximo (ej: 1000 entries), con limpieza automática de entries antiguas.
**Validates: Requirements MT-P2-06**

**Property 14: Calculator Equivalence**
*Para cualquier* conjunto de transacciones de tarjeta de crédito, el nuevo cálculo de balance debe producir el mismo resultado que CreditCardCalculator deprecated (dentro de un margen de error de 0.01).
**Validates: Requirements MT-P2-08**

**Property 15: Filter Equivalence**
*Para cualquier* conjunto de transacciones y filtros aplicados, todas las implementaciones de filtrado (centralizada y locales) deben producir el mismo conjunto de resultados.
**Validates: Requirements MT-P2-12**

**Property 16: Transaction Idempotence**
*Para cualquier* transacción, ejecutar la operación de creación N veces con los mismos datos debe resultar en exactamente 1 transacción en el sistema (no N duplicados).
**Validates: Requirements MT-P2-15**

---

## 10. ERROR HANDLING

### 10.1 Estrategia General

**Principios:**
1. **Fail Fast:** Validar inputs antes de operaciones costosas
2. **Fail Safe:** Nunca dejar el sistema en estado inconsistente
3. **Fail Visible:** Mostrar errores útiles al usuario
4. **Fail Recoverable:** Permitir retry cuando sea posible

### 10.2 Categorías de Errores

#### Errores de Validación (4xx)
```typescript
class ValidationError extends Error {
  constructor(
    public field: string,
    public message: string,
    public code: string
  ) {
    super(message);
  }
}

// Ejemplo
throw new ValidationError(
  'amount',
  'El monto debe estar entre $0.01 y $1,000,000,000',
  'AMOUNT_OUT_OF_RANGE'
);
```


#### Errores de Firestore (5xx)
```typescript
const handleFirestoreError = (error: FirestoreError): string => {
  switch (error.code) {
    case 'permission-denied':
      return 'No tienes permisos para realizar esta acción';
    case 'not-found':
      return 'El recurso solicitado no existe';
    case 'already-exists':
      return 'Este recurso ya existe';
    case 'failed-precondition':
      return 'No se cumplen las condiciones para esta operación';
    case 'aborted':
      return 'La operación fue cancelada. Por favor, intenta de nuevo';
    default:
      return 'Error al comunicarse con el servidor';
  }
};
```

#### Errores de Batch Operations
```typescript
interface BatchError {
  itemId: string;
  error: string;
  retryable: boolean;
}

const executeBatch = async (items: T[]): Promise<BatchResult> => {
  const errors: BatchError[] = [];
  
  for (const item of items) {
    try {
      await processItem(item);
    } catch (error) {
      errors.push({
        itemId: item.id,
        error: error.message,
        retryable: isRetryable(error),
      });
    }
  }
  
  return { success: errors.length === 0, errors };
};
```

### 10.3 Manejo de Errores por Componente

| Componente | Error | Acción |
|------------|-------|--------|
| TransactionsCRUD | Validación falla | Mostrar error en campo específico |
| TransactionsCRUD | Firestore falla | Mostrar toast + permitir retry |
| NotificationManager | URL inválida | Rechazar silenciosamente + log |
| Batch Operations | Error parcial | Mostrar progreso + lista de errores |
| Formatters | Valor inválido | Retornar placeholder + log warning |


### 10.4 Rollback Strategy

**Para Transferencias (MT-P1-06):**
```typescript
const executeTransfer = async (from: string, to: string, amount: number) => {
  const batch = writeBatch(db);
  
  try {
    // Preparar operaciones
    batch.update(doc(db, 'accounts', from), { balance: increment(-amount) });
    batch.update(doc(db, 'accounts', to), { balance: increment(amount) });
    
    // Ejecutar atómicamente
    await batch.commit();
    
    return { success: true };
  } catch (error) {
    // Firestore ya hizo rollback automático
    // Solo necesitamos informar al usuario
    return {
      success: false,
      error: handleFirestoreError(error),
      rollbackComplete: true,
    };
  }
};
```

**Para Operaciones Batch:**
- No hay rollback automático
- Mantener lista de operaciones exitosas
- Ofrecer "Deshacer" si es posible
- Mostrar claramente qué falló

---

## 11. TESTING STRATEGY

### 11.1 Enfoque Dual

**Unit Tests (Específicos):**
- Casos concretos y edge cases
- Errores y validaciones
- Integración entre componentes
- Objetivo: 70% cobertura

**Property Tests (Universales):**
- Propiedades que deben cumplirse siempre
- Generación automática de inputs
- 100+ iteraciones por propiedad
- Objetivo: Todas las 16 propiedades implementadas

### 11.2 Configuración de Property-Based Testing

**Librería:** `fast-check` (para TypeScript/JavaScript)

```bash
npm install --save-dev fast-check
```

**Configuración:**
```typescript
// jest.config.js
module.exports = {
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.property.test.ts'],
  testTimeout: 10000, // Property tests pueden tardar más
};
```


### 11.3 Ejemplo de Property Test

```typescript
// src/__tests__/formatters.property.test.ts
import fc from 'fast-check';
import { formatCurrency } from '@/utils/formatters';

describe('Property: Formatter Equivalence', () => {
  it('Feature: technical-debt-resolution, Property 3: All formatter implementations produce same output', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0.01, max: 1_000_000_000 }),
        (amount) => {
          // Source of Truth
          const canonical = formatCurrency(amount);
          
          // Implementaciones antiguas (antes de migrar)
          const legacy1 = legacyFormatCurrency1(amount);
          const legacy2 = legacyFormatCurrency2(amount);
          
          // Todas deben producir el mismo resultado
          expect(legacy1).toBe(canonical);
          expect(legacy2).toBe(canonical);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### 11.4 Tests por Sprint

**Sprint 1 (P0 + P1 críticos):**
- Unit tests para cada fix (15 tests)
- Property tests: 1, 2, 3, 7, 10 (5 tests)
- Tests de regresión para bugs (10 tests)
- **Total:** ~30 tests

**Sprint 2 (Performance):**
- Property tests: 5, 9, 11 (3 tests)
- Performance benchmarks (5 tests)
- Tests de virtualización (8 tests)
- **Total:** ~16 tests

**Sprint 3 (Duplicidades):**
- Property tests: 14, 15 (2 tests)
- Tests de equivalencia (10 tests)
- Tests de idempotencia (5 tests)
- **Total:** ~17 tests

**Sprint 4 (UX + Cobertura):**
- Property tests: 4, 6, 12, 13, 16 (5 tests)
- Tests de componentes (20 tests)
- Tests de hooks (15 tests)
- **Total:** ~40 tests

**Sprint 5 (Polish):**
- Tests de servicios (15 tests)
- Tests de utils (10 tests)
- Tests de integración (10 tests)
- **Total:** ~35 tests

**TOTAL:** ~138 tests (cobertura estimada 70%)


### 11.5 Test Tagging

**Formato obligatorio:**
```typescript
// Para property tests
it('Feature: technical-debt-resolution, Property N: [descripción]', () => {
  // Test implementation
});

// Para unit tests
it('[MT-P0-01] Batch operations show progress', () => {
  // Test implementation
});
```

### 11.6 Criterios de Éxito de Tests

**Para cada ítem resuelto:**
- [ ] Al menos 1 test que falla antes del fix
- [ ] Ese test pasa después del fix
- [ ] Tests existentes siguen pasando
- [ ] Cobertura no disminuye

**Para el proyecto completo:**
- [ ] 70%+ cobertura de código
- [ ] 16 property tests implementados
- [ ] 0 tests flaky (determinísticos)
- [ ] Suite completa corre en <5 minutos

---

## 📊 RESUMEN EJECUTIVO

### Entregables por Sprint

| Sprint | Objetivo | Items | Tests | Cobertura |
|--------|----------|-------|-------|-----------|
| 1 | Estabilización | P0 (3) + P1 (9) | 30 | 25% |
| 2 | Performance | P1 (3) + P2 (5) | 16 | 40% |
| 3 | Duplicidades | P2 (10) | 17 | 50% |
| 4 | UX + Tests | P2 (3) + P3 (1) | 40 | 60% |
| 5 | Polish | P3 (13) | 35 | 70% |

### Checkpoint de Estabilidad

**Después de Sprint 2, la app está:**
- ✅ Sin bugs críticos (P0)
- ✅ Sin bugs altos (P1)
- ✅ Performance optimizada
- ✅ Segura (validaciones consistentes)
- ✅ Lista para nuevas features

### Métricas de Éxito

| Métrica | Antes | Después Sprint 2 | Después Sprint 5 |
|---------|-------|------------------|------------------|
| Bugs P0 | 3 | 0 | 0 |
| Bugs P1 | 12 | 0 | 0 |
| Cobertura Tests | 15% | 40% | 70% |
| Duplicidades | 6 | 2 | 0 |
| Lighthouse Score | 75 | 90+ | 95+ |
| Bundle Size | 450KB | 380KB | 350KB |

---

**Documento completado. Listo para revisión y creación de tasks.md.**
