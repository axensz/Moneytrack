# 🟢 EJEMPLO: Cómo Agregar un Nuevo Tipo de Cuenta

Este documento muestra cómo el **Strategy Pattern** permite agregar nuevos tipos de cuenta **sin modificar código existente** (Open/Closed Principle).

---

## 📝 ESCENARIO: Agregar Cuenta de Inversión

Supongamos que queremos agregar un nuevo tipo de cuenta: **"Cuenta de Inversión"** que:
- Calcula el balance incluyendo rendimientos
- Valida que no se puedan retirar más de cierto porcentaje
- Muestra el balance total PERO con rendimientos proyectados

---

## 🚀 PASO 1: Actualizar el Tipo TypeScript

```typescript
// src/types/finance.ts
export interface Account {
  id?: string;
  name: string;
  type: 'savings' | 'credit' | 'cash' | 'investment'; // ✅ Agregar 'investment'
  isDefault: boolean;
  initialBalance: number;
  creditLimit?: number;
  cutoffDay?: number;
  paymentDay?: number;
  bankAccountId?: string;

  // 🆕 Campos específicos de inversión
  investmentType?: 'stocks' | 'bonds' | 'mixed';
  annualYield?: number; // Rendimiento anual esperado (%)
  lockPeriod?: number; // Días de bloqueo
}
```

---

## 🚀 PASO 2: Crear la Nueva Estrategia

```typescript
// src/utils/accountStrategies.ts

/**
 * 🆕 ESTRATEGIA PARA CUENTA DE INVERSIÓN
 *
 * LÓGICA:
 * - Balance = Saldo Inicial + Movimientos + Rendimientos Acumulados
 * - Solo permite retiros del 80% del balance disponible
 * - Aplica rendimientos según el tiempo transcurrido
 */
export class InvestmentAccountStrategy implements AccountBalanceStrategy {
  /**
   * Calcula rendimientos acumulados desde creación de la cuenta
   */
  private calculateYield(account: Account): number {
    if (!account.annualYield || !account.createdAt) return 0;

    const daysSinceCreation = Math.floor(
      (Date.now() - account.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    const dailyYield = account.annualYield / 365;
    const currentBalance = account.initialBalance;

    // Interés simple diario
    return currentBalance * (dailyYield / 100) * daysSinceCreation;
  }

  calculateBalance(account: Account, transactions: Transaction[]): number {
    // Calcular balance base (igual que savings)
    const paidTransactions = transactions.filter(t => t.paid);
    let balance = account.initialBalance;

    paidTransactions.forEach(t => {
      if (t.accountId === account.id) {
        if (t.type === 'income') balance += t.amount;
        if (t.type === 'expense') balance -= t.amount;
        if (t.type === 'transfer') balance -= t.amount;
      }

      if (t.toAccountId === account.id && t.type === 'transfer') {
        balance += t.amount;
      }
    });

    // ✅ Agregar rendimientos acumulados
    const yieldEarned = this.calculateYield(account);

    return balance + yieldEarned;
  }

  validateTransaction(
    account: Account,
    amount: number,
    transactions: Transaction[]
  ): { valid: boolean; error?: string } {
    const currentBalance = this.calculateBalance(account, transactions);

    // ✅ Solo se puede retirar 80% del balance (dejar 20% invertido)
    const maxWithdrawal = currentBalance * 0.8;

    if (amount > maxWithdrawal) {
      return {
        valid: false,
        error: `Solo puedes retirar hasta el 80% del balance. Máximo: $${maxWithdrawal.toLocaleString('es-CO')}`
      };
    }

    return { valid: true };
  }

  includeInTotalBalance(): boolean {
    return true; // Las cuentas de inversión SÍ se incluyen en el total
  }

  /**
   * 🆕 Método específico: Obtener rendimientos proyectados
   */
  getProjectedYield(account: Account, months: number): number {
    if (!account.annualYield) return 0;

    const monthlyYield = account.annualYield / 12;
    const currentBalance = this.calculateBalance(account, []);

    return currentBalance * (monthlyYield / 100) * months;
  }
}
```

---

## 🚀 PASO 3: Registrar la Estrategia

```typescript
// src/utils/accountStrategies.ts

// En el Factory, agregar al Map
export class AccountStrategyFactory {
  private static strategies: Map<Account['type'], AccountBalanceStrategy> = new Map([
    ['savings', new SavingsAccountStrategy()],
    ['cash', new CashAccountStrategy()],
    ['credit', new CreditCardStrategy()],
    ['investment', new InvestmentAccountStrategy()] // ✅ Agregar aquí
  ]);

  // ... resto del código sin cambios
}
```

---

## 🚀 PASO 4: Actualizar Constantes (UI)

```typescript
// src/config/constants.ts

export const ACCOUNT_TYPES = [
  { value: 'savings' as const, label: 'Cuenta de Ahorros' },
  { value: 'credit' as const, label: 'Tarjeta de Crédito' },
  { value: 'cash' as const, label: 'Efectivo' },
  { value: 'investment' as const, label: 'Inversión' } // ✅ Agregar
] as const;
```

---

## 🚀 PASO 5: Actualizar Validadores (Opcional)

```typescript
// src/utils/validators.ts

// Si la cuenta de inversión necesita validaciones especiales al crear
export class AccountValidator {
  static validate(account: NewAccount, isEditing: boolean = false): ValidationResult {
    const errors: string[] = [];

    // ... validaciones existentes ...

    // ✅ Validación para inversión
    if (account.type === 'investment') {
      if (!account.annualYield || account.annualYield < 0 || account.annualYield > 100) {
        errors.push('El rendimiento anual debe estar entre 0% y 100%');
      }

      if (!account.investmentType) {
        errors.push('Debes seleccionar un tipo de inversión');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
```

---

## 🚀 PASO 6: Actualizar UI (Formulario)

```typescript
// src/components/views/AccountsView.tsx

// Agregar campos al formulario cuando type === 'investment'
{newAccount.type === 'investment' && (
  <>
    <div>
      <label className="label-base">Tipo de inversión</label>
      <select
        value={newAccount.investmentType || 'stocks'}
        onChange={(e) => setNewAccount({...newAccount, investmentType: e.target.value as any})}
        className="input-base"
      >
        <option value="stocks">Acciones</option>
        <option value="bonds">Bonos</option>
        <option value="mixed">Mixto</option>
      </select>
    </div>

    <div>
      <label className="label-base">Rendimiento anual (%)</label>
      <input
        type="number"
        min="0"
        max="100"
        step="0.1"
        value={newAccount.annualYield || 0}
        onChange={(e) => setNewAccount({...newAccount, annualYield: parseFloat(e.target.value)})}
        className="input-base"
      />
    </div>

    <div>
      <label className="label-base">Periodo de bloqueo (días)</label>
      <input
        type="number"
        min="0"
        value={newAccount.lockPeriod || 0}
        onChange={(e) => setNewAccount({...newAccount, lockPeriod: parseInt(e.target.value)})}
        className="input-base"
      />
    </div>
  </>
)}
```

---

## ✅ RESULTADO FINAL

### **Código Modificado**:
1. ✅ `types/finance.ts` - Agregar tipo al union
2. ✅ `accountStrategies.ts` - Agregar nueva clase
3. ✅ `accountStrategies.ts` - Registrar en Factory (1 línea)
4. ✅ `constants.ts` - Agregar a ACCOUNT_TYPES
5. ✅ `validators.ts` - Validaciones específicas (opcional)
6. ✅ `AccountsView.tsx` - Campos del formulario

### **Código NO Modificado** (Open/Closed Principle):
- ❌ `balanceCalculator.ts` - **Sin cambios**
- ❌ `useAccounts.ts` - **Sin cambios**
- ❌ `useGlobalStats.ts` - **Sin cambios**
- ❌ `finance-tracker.tsx` - **Sin cambios**
- ❌ Todo el cálculo de balances - **Sin cambios**

---

## 🎯 USO EN PRODUCCIÓN

```typescript
// Crear cuenta de inversión
const newInvestment = {
  name: 'CDT Banco',
  type: 'investment' as const,
  initialBalance: 10000000,
  investmentType: 'bonds',
  annualYield: 12.5, // 12.5% anual
  lockPeriod: 365, // 1 año
  isDefault: false
};

await addAccount(newInvestment);

// El sistema automáticamente:
// ✅ Usa InvestmentAccountStrategy para calcular balance
// ✅ Aplica validación de retiro (máx 80%)
// ✅ Calcula rendimientos acumulados
// ✅ Incluye en balance total
```

---

## 🔥 VENTAJAS DEL STRATEGY PATTERN

| Aspecto | Sin Pattern | Con Pattern |
|---------|-------------|-------------|
| **Agregar tipo** | Modificar 10+ archivos | Modificar 4 archivos |
| **Lógica hardcoded** | `if (type === 'investment')` en todo el código | 1 clase, 1 registro |
| **Testear** | Difícil (lógica dispersa) | Fácil (clase aislada) |
| **Mantenimiento** | Buscar en todos lados | Todo en 1 archivo |
| **Riesgo de bugs** | Alto (olvidar un if) | Bajo (todo centralizado) |

---

## 📚 DOCUMENTACIÓN ADICIONAL

- **Strategy Pattern**: https://refactoring.guru/design-patterns/strategy
- **Open/Closed Principle**: https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle
- **SOLID Principles**: https://www.digitalocean.com/community/conceptual_articles/s-o-l-i-d-the-first-five-principles-of-object-oriented-design
