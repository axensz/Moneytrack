# MoneyTrack - Plan de Auditoría y Mejoras

## Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| Total Hallazgos | 28 |
| P0 (Crítico) | 1 |
| P1 (Alto) | 7 |
| P2 (Medio) | 13 |
| P3 (Bajo) | 7 |
| Código Muerto | 7 archivos (~150 líneas) |
| Calidad General | 7/10 |
| Mantenibilidad | 6/10 |
| Accesibilidad | 3/10 |
| Testing | 0/10 |

---

## Sprint 1 - Acciones Inmediatas (8h)

### 1.1 Eliminar Componentes Duplicados [P1] - 1h
**Archivos a eliminar** (están duplicados en subcarpetas):
- `src/components/Header.tsx` → usar `src/components/layout/Header.tsx`
- `src/components/TabNavigation.tsx` → usar `src/components/layout/TabNavigation.tsx`
- `src/components/LoadingScreen.tsx` → usar `src/components/layout/LoadingScreen.tsx`
- `src/components/StatsCards.tsx` → usar `src/components/shared/StatsCards.tsx`
- `src/components/TransactionForm.tsx` → usar `src/components/shared/TransactionForm.tsx`
- `src/components/HelpModal.tsx` → usar `src/components/modals/HelpModal.tsx`
- `src/components/WelcomeModal.tsx` → usar `src/components/modals/WelcomeModal.tsx`

### 1.2 Implementar Error Boundary [P1] - 2h
Crear `src/components/ErrorBoundary.tsx`:
```tsx
class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

### 1.3 Manejo de Errores en Firestore [P1] - 2h
Modificar `src/hooks/firestore/useFirestoreSubscriptions.ts`:
- Agregar estado `error: Error | null`
- Propagar errores de `onSnapshot` al estado
- Retornar `{ ...data, loading, error }`
- Mostrar toast o UI cuando hay error

### 1.4 Timeout para Firestore Loading [P1] - 1h
Agregar timeout de 10s en `useFirestoreSubscriptions`:
```typescript
useEffect(() => {
  const timeout = setTimeout(() => {
    if (loading) {
      setError(new Error('Timeout: No se pudieron cargar los datos'));
      setLoadedForUserId(userId); // Terminar loading
    }
  }, 10000);
  return () => clearTimeout(timeout);
}, [userId, loading]);
```

### 1.5 Validación en Firebase Writes [P1] - 2h
En `useTransactionsCRUD.ts`, `useAccountsCRUD.ts`:
```typescript
const addTransaction = async (data: Transaction) => {
  const validation = TransactionValidator.validate(data);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(', '));
  }
  await addDoc(ref, data);
};
```

---

## Sprint 2 - Refactorización (16h)

### 2.1 Refactorizar useRecurringPayments [P1] - 4h
Seguir el patrón modular existente:
```
src/hooks/firestore/useRecurringPaymentsCRUD.ts
src/hooks/firestore/useRecurringPaymentsSubscriptions.ts (o usar el existente)
```
Integrar con `useFirestoreSubscriptions` en lugar de listener propio.

### 2.2 Extraer Lógica de finance-tracker.tsx [P2] - 6h
Crear hooks especializados:
```typescript
// src/hooks/useAppModals.ts
export function useAppModals() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  // ...handlers
  return { modals, handlers };
}

// src/hooks/useWelcomeFlow.ts
export function useWelcomeFlow(accounts, accountsLoading, authLoading) {
  // Lógica del modal de bienvenida
}
```

### 2.3 Simplificar Props de Views [P2] - 4h
Agrupar props en objetos coherentes:
```typescript
interface AccountsViewProps {
  data: { accounts: Account[]; transactions: Transaction[]; categories: Category[] };
  handlers: { addAccount; updateAccount; deleteAccount; setDefaultAccount };
  utilities: { formatCurrency; getAccountBalance; getTransactionCountForAccount };
}
```

### 2.4 Consolidar Validadores [P2] - 2h
Centralizar toda validación en `src/utils/validators.ts`:
- Mover validación de `TransactionForm.tsx`
- Mover validación de `useAddTransaction.ts`
- Exportar funciones reutilizables

---

## Sprint 3 - Optimización y UX (12h)

### 3.1 Optimizar Re-renders [P2] - 4h
- Agregar `React.memo` a componentes pesados:
  - `StatsCards`
  - `TransactionItem`
  - `AccountCard`
- Envolver filtrados en `useMemo` en `useTransactionsView.tsx`
- Usar `useCallback` en handlers que se pasan como props

### 3.2 Componente Button Reutilizable [P2] - 2h
Crear `src/components/ui/Button.tsx`:
```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  // ...
}
```

### 3.3 Mejorar Accesibilidad [P2] - 4h
- Agregar `aria-label` a todos los botones con solo iconos
- Agregar `aria-required`, `aria-invalid` en inputs
- Agregar `aria-modal` y `aria-labelledby` en modales
- Agregar `role="list"` y `role="listitem"` donde aplique

### 3.4 Validación de Datos de Firestore [P2] - 2h
Crear funciones de validación para datos entrantes:
```typescript
function validateTransaction(data: unknown): Transaction {
  if (!data || typeof data !== 'object') throw new Error('Invalid data');
  // Validar campos requeridos
  return data as Transaction;
}
```

---

## Sprint 4 - Testing (16h)

### 4.1 Setup de Testing - 2h
- Configurar Jest + React Testing Library
- Configurar mocks para Firebase

### 4.2 Tests Unitarios para Utils - 4h
```typescript
// src/utils/__tests__/balanceCalculator.test.ts
describe('BalanceCalculator', () => {
  it('calculates account balance correctly', () => {});
  it('handles credit card balance', () => {});
  it('calculates total balance', () => {});
});

// src/utils/__tests__/interestCalculator.test.ts
// src/utils/__tests__/validators.test.ts
```

### 4.3 Tests de Hooks - 6h
```typescript
// src/hooks/__tests__/useTransactions.test.ts
describe('useTransactions', () => {
  it('returns empty array initially', () => {});
  it('adds transaction correctly', () => {});
  it('deletes transaction correctly', () => {});
});
```

### 4.4 Tests de Componentes Críticos - 4h
```typescript
// TransactionForm.test.tsx
// AccountFormModal.test.tsx
```

---

## Mejoras Futuras (Backlog)

### Features Nuevas
| Feature | Prioridad | Esfuerzo |
|---------|-----------|----------|
| Importar datos desde backup | P3 | M |
| Notificaciones de vencimiento | P3 | S |
| Presupuestos por categoría | P3 | L |
| Modo offline con sync | P3 | XL |
| Dashboard personalizable | P3 | L |
| Reportes exportables (PDF) | P3 | M |

### Deuda Técnica
| Item | Prioridad | Esfuerzo |
|------|-----------|----------|
| Consolidar useFirebaseData | P2 | L |
| Migrar a React Query | P3 | XL |
| Implementar Zustand/Jotai | P3 | L |
| PWA completa | P3 | M |

---

## Patrones y Estándares a Seguir

### KISS (Keep It Simple)
- Funciones < 50 líneas
- Componentes < 200 líneas
- Props < 7 parámetros (agrupar en objetos si necesario)
- Un hook = una responsabilidad

### DRY (Don't Repeat Yourself)
- Validación centralizada en `validators.ts`
- Formateo centralizado en `formatters.ts`
- Cálculos centralizados en `balanceCalculator.ts`
- Componentes UI reutilizables en `src/components/ui/`

### Estructura de Archivos
```
src/
├── components/
│   ├── layout/          # Header, Footer, Navigation
│   ├── modals/          # Todos los modales
│   ├── shared/          # Componentes compartidos
│   ├── ui/              # Primitivos (Button, Input, Card)
│   └── views/           # Vistas por dominio
├── hooks/
│   ├── firestore/       # Hooks de Firebase
│   └── *.ts             # Hooks de dominio
├── utils/               # Funciones puras
├── types/               # TypeScript types
├── config/              # Constantes y configuración
└── lib/                 # Servicios externos (Firebase)
```

### Convenciones de Naming
- Componentes: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utils: `camelCase.ts`
- Types: `PascalCase` para interfaces, `camelCase` para tipos
- Constantes: `UPPER_SNAKE_CASE`

---

## Métricas de Éxito

| Métrica | Actual | Objetivo |
|---------|--------|----------|
| Lighthouse Performance | ~70 | >90 |
| Lighthouse Accessibility | ~50 | >90 |
| Test Coverage | 0% | >70% |
| Bundle Size | ~500KB | <400KB |
| Time to Interactive | ~3s | <2s |
| Errores en Producción | ? | 0 críticos |

---

## Timeline Estimado

| Sprint | Duración | Horas | Prioridad |
|--------|----------|-------|-----------|
| Sprint 1 | 1 semana | 8h | P1 |
| Sprint 2 | 2 semanas | 16h | P1-P2 |
| Sprint 3 | 1 semana | 12h | P2 |
| Sprint 4 | 2 semanas | 16h | P1-P2 |
| **Total** | **6 semanas** | **52h** | |

---

*Documento generado: 2026-01-16*
*Última auditoría: 2026-01-16*
