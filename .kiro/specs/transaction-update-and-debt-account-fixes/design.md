# Design Document

## Overview

Este diseño aborda dos problemas críticos en la aplicación de finanzas:

1. **Actualización de transacciones fallando silenciosamente**: Implementaremos validación robusta y manejo de errores detallado en la capa de actualización de transacciones.

2. **Funcionalidad faltante en préstamos**: Agregaremos selección de cuenta funcional y capacidad de modificar el saldo de préstamos existentes.

La solución se enfoca en:
- Validación explícita de campos antes de operaciones Firestore
- Filtrado de valores undefined para evitar errores silenciosos
- Mensajes de error descriptivos para el usuario
- UI mejorada para selección de cuenta en préstamos
- Nueva funcionalidad para modificar saldos de préstamos

## Architecture

### Current Architecture

```
FinanceContext (Provider)
  ├── useTransactions (hook)
  │   └── useTransactionsCRUD (Firestore operations)
  ├── useDebts (hook)
  └── Components
      ├── TransactionsView
      │   └── useTransactionsView (UI logic)
      └── DebtsView
```

### Modified Architecture

```
FinanceContext (Provider)
  ├── useTransactions (hook)
  │   └── useTransactionsCRUD (Firestore operations)
  │       └── validateTransactionUpdate (NEW - validation layer)
  ├── useDebts (hook)
  │   ├── cleanDebtData (ENHANCED - undefined filtering)
  │   └── modifyDebtBalance (NEW - balance modification)
  └── Components
      ├── TransactionsView
      │   └── useTransactionsView (ENHANCED - error handling)
      └── DebtsView (ENHANCED - account selector + balance modifier UI)
```

### Key Design Decisions

1. **Validation Layer Placement**: Validación en useTransactionsCRUD antes de llamar Firestore, no en el componente UI
2. **Undefined Handling**: Filtrado centralizado de undefined en todas las operaciones CRUD
3. **Error Propagation**: Errores específicos propagados desde la capa de datos hasta la UI
4. **Balance Modification**: Nueva función separada para modificar saldos sin afectar pagos existentes

## Components and Interfaces

### 1. Transaction Update Validation

**Location**: `src/hooks/firestore/useTransactionsCRUD.ts`

**New Function**: `validateTransactionUpdate`

```typescript
interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

function validateTransactionUpdate(updates: Partial<Transaction>): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate amount if present
  if ('amount' in updates) {
    if (updates.amount === undefined || updates.amount === null) {
      errors.push({ field: 'amount', message: 'El monto es requerido' });
    } else if (typeof updates.amount !== 'number' || isNaN(updates.amount)) {
      errors.push({ field: 'amount', message: 'El monto debe ser un número válido' });
    } else if (updates.amount <= 0) {
      errors.push({ field: 'amount', message: 'El monto debe ser mayor a 0' });
    }
  }

  // Validate description if present
  if ('description' in updates) {
    if (updates.description === undefined || updates.description === null) {
      errors.push({ field: 'description', message: 'La descripción es requerida' });
    } else if (typeof updates.description !== 'string') {
      errors.push({ field: 'description', message: 'La descripción debe ser texto' });
    } else if (updates.description.trim() === '') {
      errors.push({ field: 'description', message: 'La descripción no puede estar vacía' });
    }
  }

  // Validate date if present
  if ('date' in updates) {
    if (updates.date === undefined || updates.date === null) {
      errors.push({ field: 'date', message: 'La fecha es requerida' });
    } else if (!(updates.date instanceof Date)) {
      errors.push({ field: 'date', message: 'La fecha debe ser un objeto Date válido' });
    } else if (isNaN(updates.date.getTime())) {
      errors.push({ field: 'date', message: 'La fecha no es válida' });
    }
  }

  // Validate category if present
  if ('category' in updates) {
    if (updates.category === undefined || updates.category === null) {
      errors.push({ field: 'category', message: 'La categoría es requerida' });
    } else if (typeof updates.category !== 'string') {
      errors.push({ field: 'category', message: 'La categoría debe ser texto' });
    } else if (updates.category.trim() === '') {
      errors.push({ field: 'category', message: 'La categoría no puede estar vacía' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
```

**Modified Function**: `updateTransaction`

```typescript
const updateTransaction = useCallback(
  async (id: string, updates: Partial<Transaction>) => {
    if (!userId) return;

    // Validate updates
    const validation = validateTransactionUpdate(updates);
    if (!validation.isValid) {
      const errorMessage = validation.errors.map(e => e.message).join(', ');
      throw new Error(`Validación fallida: ${errorMessage}`);
    }

    // Filter undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    // Update in Firestore
    await updateDoc(
      doc(db, `users/${userId}/transactions`, id),
      cleanUpdates
    );
  },
  [userId]
);
```

### 2. Enhanced Error Handling in UI

**Location**: `src/components/views/transactions/hooks/useTransactionsView.tsx`

**Modified Function**: `handleSaveEdit`

```typescript
const handleSaveEdit = useCallback(
  async (id: string) => {
    // Parse amount
    const amountStr = editForm.amount.toString().replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(amountStr);

    // Client-side validation
    if (isNaN(amount) || amount <= 0) {
      showToast.error('El monto debe ser un número válido mayor a 0');
      return;
    }

    if (!editForm.description.trim()) {
      showToast.error('La descripción no puede estar vacía');
      return;
    }

    if (!editForm.category) {
      showToast.error('Debes seleccionar una categoría');
      return;
    }

    try {
      await updateTransaction(id, {
        description: editForm.description.trim(),
        amount,
        date: parseDateFromInput(editForm.date),
        category: editForm.category,
      });

      setEditingTransaction(null);
      setEditForm({ description: '', amount: '', date: '', category: '' });
      showToast.success(SUCCESS_MESSAGES.TRANSACTION_UPDATED);
    } catch (error) {
      // Enhanced error handling
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Error desconocido al actualizar la transacción';
      
      console.error('Error updating transaction:', error);
      showToast.error(errorMessage);
      // Form state is preserved for user to correct
    }
  },
  [editForm, updateTransaction]
);
```

### 3. Debt Account Selection Fix

**Location**: `src/components/views/debts/DebtsView.tsx`

**Modified**: Account selector in form

```typescript
// In form state initialization
const [formData, setFormData] = useState({
  personName: '',
  type: 'lent' as 'lent' | 'borrowed',
  originalAmount: '',
  description: '',
  accountId: '', // Empty string in UI state
});

// In handleSubmit - convert empty string to undefined
const handleSubmit = async () => {
  const amount = parseFloat(unformatNumber(formData.originalAmount));
  
  if (!formData.personName.trim()) {
    showToast.error('Ingresa el nombre de la persona');
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    showToast.error('El monto debe ser mayor a 0');
    return;
  }

  await addDebt({
    personName: formData.personName.trim(),
    type: formData.type,
    originalAmount: amount,
    remainingAmount: amount,
    description: formData.description.trim() || undefined,
    accountId: formData.accountId || undefined, // Convert empty string to undefined
    isSettled: false,
  });

  showToast.success(formData.type === 'lent' ? 'Préstamo registrado' : 'Deuda registrada');
  setFormData({ personName: '', type: 'lent', originalAmount: '', description: '', accountId: '' });
  setShowForm(false);
};
```

**Enhanced**: Account selector UI

```typescript
<select
  value={formData.accountId}
  onChange={e => setFormData(f => ({ ...f, accountId: e.target.value }))}
  className="input-base"
>
  <option value="">Sin cuenta asociada (opcional)</option>
  {accounts.filter(a => a.type !== 'credit').map(a => (
    <option key={a.id} value={a.id}>{a.name}</option>
  ))}
</select>
```

### 4. Debt Balance Modification

**Location**: `src/hooks/useDebts.ts`

**New Function**: `modifyDebtBalance`

```typescript
const modifyDebtBalance = useCallback(async (
  debtId: string, 
  amount: number, 
  operation: 'add' | 'subtract'
) => {
  const debt = debts.find(d => d.id === debtId);
  if (!debt) {
    throw new Error('Préstamo no encontrado');
  }

  if (debt.isSettled) {
    throw new Error('No puedes modificar un préstamo ya saldado');
  }

  let newOriginalAmount: number;
  let newRemainingAmount: number;

  if (operation === 'add') {
    newOriginalAmount = debt.originalAmount + amount;
    newRemainingAmount = debt.remainingAmount + amount;
  } else {
    // Subtract
    if (amount > debt.remainingAmount) {
      throw new Error('No puedes restar más del saldo pendiente');
    }
    newOriginalAmount = debt.originalAmount - amount;
    newRemainingAmount = debt.remainingAmount - amount;
  }

  // Check if debt becomes settled
  const isSettled = newRemainingAmount === 0;

  await updateDebt(debtId, {
    originalAmount: newOriginalAmount,
    remainingAmount: newRemainingAmount,
    isSettled,
    ...(isSettled ? { settledAt: new Date() } : {}),
  });
}, [debts, updateDebt]);
```

**Location**: `src/components/views/debts/DebtsView.tsx`

**New UI Component**: Balance modifier in DebtCard

```typescript
const [showBalanceModifier, setShowBalanceModifier] = useState<string | null>(null);
const [modifierAmount, setModifierAmount] = useState('');
const [modifierOperation, setModifierOperation] = useState<'add' | 'subtract'>('add');

// In DebtCard component
{showBalanceModifier === debt.id && (
  <div className="mt-3 space-y-2">
    <div className="flex gap-2">
      <button
        onClick={() => setModifierOperation('add')}
        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
          modifierOperation === 'add'
            ? 'bg-green-500 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        }`}
      >
        Agregar
      </button>
      <button
        onClick={() => setModifierOperation('subtract')}
        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
          modifierOperation === 'subtract'
            ? 'bg-red-500 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        }`}
      >
        Restar
      </button>
    </div>
    <div className="flex gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={formatNumberForInput(modifierAmount)}
        onChange={e => setModifierAmount(unformatNumber(e.target.value))}
        placeholder="Monto"
        className="input-base flex-1 text-sm"
        autoFocus
      />
      <button
        onClick={() => handleModifyBalance(debt.id!, modifierOperation)}
        className="btn-submit text-sm px-3"
      >
        Aplicar
      </button>
      <button
        onClick={() => setShowBalanceModifier(null)}
        className="p-2 text-gray-400 hover:text-gray-600"
      >
        <X size={16} />
      </button>
    </div>
  </div>
)}
```

## Data Models

### Transaction (existing, no changes)

```typescript
interface Transaction {
  id?: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  date: Date;
  paid: boolean;
  accountId: string;
  toAccountId?: string;
  createdAt?: Date;
  // ... other fields
}
```

### Debt (existing, no changes to schema)

```typescript
interface Debt {
  id?: string;
  personName: string;
  type: 'lent' | 'borrowed';
  originalAmount: number;
  remainingAmount: number;
  description?: string;
  accountId?: string; // Optional - can be undefined
  isSettled: boolean;
  createdAt?: Date;
  settledAt?: Date;
}
```

### ValidationError (new)

```typescript
interface ValidationError {
  field: string;
  message: string;
}
```

### ValidationResult (new)

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Validation verifies all required fields

*For any* transaction update object, when passed to the validation layer, the validator should check that all required fields (amount, description, date, category) that are present in the update are valid according to their type and constraints.

**Validates: Requirements 1.1**

### Property 2: Invalid field values are rejected

*For any* transaction update containing an invalid field value (undefined amount, null description, invalid date, empty category, negative amount, NaN amount, whitespace-only description), the validation layer should reject the update and return an error identifying the invalid field.

**Validates: Requirements 1.2, 1.3, 1.4, 1.5**

### Property 3: Multiple validation errors are collected

*For any* transaction update with multiple invalid fields, the validation layer should return all validation errors in a single response rather than stopping at the first error.

**Validates: Requirements 2.5**

### Property 4: Account selection is stored correctly

*For any* debt creation with a selected accountId, the stored debt record should contain that exact accountId value.

**Validates: Requirements 3.2**

### Property 5: Empty accountId becomes undefined

*For any* debt creation or update where accountId is an empty string, the system should convert it to undefined before storing in Firestore.

**Validates: Requirements 3.3, 3.4**

### Property 6: Add operation increases debt amounts

*For any* active debt and any positive amount, applying the add operation should increase both originalAmount and remainingAmount by exactly that amount.

**Validates: Requirements 4.2**

### Property 7: Subtract operation decreases debt amounts

*For any* active debt and any positive amount less than or equal to remainingAmount, applying the subtract operation should decrease both originalAmount and remainingAmount by exactly that amount.

**Validates: Requirements 4.3**

### Property 8: Invalid subtraction is rejected

*For any* active debt and any amount greater than the debt's remainingAmount, attempting to subtract that amount should be rejected with an error and the debt should remain unchanged.

**Validates: Requirements 4.4**

### Property 9: Undefined values are filtered from Firestore operations

*For any* data object being sent to Firestore (transaction update, debt creation, debt update), all fields with undefined values should be removed from the object before the Firestore operation is executed.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 10: Validation precedes filtering

*For any* operation with both validation errors and undefined values, the validation layer should reject the operation and throw validation errors before any undefined filtering occurs.

**Validates: Requirements 5.5**

## Error Handling

### Validation Errors

**Strategy**: Fail fast with descriptive errors

- Validation occurs before any Firestore operations
- All validation errors are collected and returned together
- Error messages are user-friendly and field-specific
- Validation errors are thrown as Error objects with structured messages

**Example Error Messages**:
- "Validación fallida: El monto debe ser mayor a 0"
- "Validación fallida: La descripción no puede estar vacía, La categoría es requerida"

### Firestore Errors

**Strategy**: Log detailed errors, show generic messages to users

- Catch all Firestore errors in CRUD operations
- Log full error details to console for debugging
- Display generic user-friendly messages
- Preserve form state on error for user correction

**Example Error Handling**:
```typescript
try {
  await updateDoc(docRef, cleanData);
} catch (error) {
  console.error('Firestore error:', error);
  throw new Error('Error al actualizar. Por favor intenta de nuevo.');
}
```

### UI Error Display

**Strategy**: Toast notifications with context preservation

- Validation errors: Show specific field errors
- Firestore errors: Show generic error message
- Success: Show confirmation and clear form
- Error: Show message and preserve form state

### Balance Modification Errors

**Strategy**: Pre-validation with clear rejection messages

- Check debt exists before modification
- Check debt is not settled
- Check subtraction doesn't exceed remaining amount
- Throw descriptive errors for each failure case

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and UI integration
- Specific validation error scenarios (empty string, null, undefined)
- Firestore error mocking and error message verification
- UI state preservation on error
- Success flow with form clearing
- Account selector rendering with filtered accounts
- Balance modifier UI interactions

**Property-Based Tests**: Verify universal properties across all inputs
- Validation behavior across random transaction updates
- Undefined filtering across random data objects
- Balance modification arithmetic across random debts and amounts
- Error collection across random invalid updates

### Property-Based Testing Configuration

**Library**: Use `fast-check` for TypeScript property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `// Feature: transaction-update-and-debt-account-fixes, Property N: [property text]`

**Example Test Structure**:
```typescript
import fc from 'fast-check';

describe('Transaction Update Validation', () => {
  it('Property 2: Invalid field values are rejected', () => {
    // Feature: transaction-update-and-debt-account-fixes, Property 2: Invalid field values are rejected
    fc.assert(
      fc.property(
        fc.record({
          amount: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(0), fc.double({ max: -0.01 })),
          description: fc.string(),
          date: fc.date(),
          category: fc.string()
        }),
        (invalidUpdate) => {
          const result = validateTransactionUpdate(invalidUpdate);
          expect(result.isValid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage Goals

**Validation Layer**: 100% coverage
- All validation rules tested with property tests
- All error paths tested with unit tests

**CRUD Operations**: 90%+ coverage
- Undefined filtering tested with property tests
- Firestore integration tested with unit tests (mocked)

**UI Components**: 80%+ coverage
- Error handling tested with unit tests
- Form state management tested with unit tests
- Balance modifier interactions tested with unit tests

### Testing Priority

1. **High Priority**: Validation layer and undefined filtering (core correctness)
2. **Medium Priority**: Balance modification logic (new functionality)
3. **Lower Priority**: UI error display (user experience)
