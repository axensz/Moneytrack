# Extractos de tarjetas (calendario de pagos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón "Extractos" en la vista Cuentas que abre un modal con la proyección mes a mes de pagos de tarjetas (cuotas + periódicos), histórico con estado pagado/parcial/pendiente, mostrando solo meses con deuda.

**Architecture:** Lógica pura en `src/utils/` (helpers de ciclo + constructor del calendario), un hook delgado `useCardPaymentSchedule` que la envuelve en `useMemo`, y un modal presentacional `CardStatementsModal` cableado en `AccountsView`. Sin cambios de modelo de datos ni Firestore.

**Tech Stack:** Next 16 / React 19 / TypeScript, Vitest + @testing-library/react, Tailwind, lucide-react.

## Global Constraints

- **Estilo de trabajo:** ponytail (la solución más simple que funcione). No caveman. No dependencias nuevas. (CLAUDE.md)
- **Moneda/locale:** `APP_CONFIG.locale = 'es-CO'`, `currency = 'COP'`. Usar `formatCurrency` existente; nunca hardcodear formato.
- **Fuente de transacciones:** historial COMPLETO `balanceTransactions` (vía `useTransactionDomain()`), NUNCA la ventana paginada `transactions`. Subreportaría cuotas viejas (ver `docs/AUDITORIA-PROFUNDA.md`, clase `balance-pagination-corruption`).
- **Excluir de cargos:** categorías de ajuste `SPECIAL_CATEGORIES.adjustmentCategories` (ajustes de saldo, préstamos, etc.) no son compras reales. Pagos de tarjeta ('Pago Crédito'/'Pago TC') SÍ cuentan como pagos.
- **Fin de mes:** acotar día de corte/pago al último día real del mes con `effectiveDueDay` (corte 31 en feb → 28/29).
- **Comando de test:** `npm run test:run -- <ruta-del-archivo>`.
- **Solo lectura:** esta feature no registra ni modifica pagos.

---

### Task 1: Helpers puros de ciclo de facturación

Generaliza la lógica de `getCycleDates` (hoy solo ciclo actual en `useCreditCardStatement.ts`) a cualquier ciclo, indexado por entero relativo al ciclo actual: `index 0` = ciclo actual (cierra en el próximo corte), `<0` pasados, `>0` futuros.

**Files:**
- Create: `src/utils/creditCycles.ts`
- Test: `src/__tests__/utils/creditCycles.test.ts`

**Interfaces:**
- Consumes: `effectiveDueDay` de `src/utils/recurringDates.ts`.
- Produces:
  - `interface CreditCycle { index: number; cycleStart: Date; cycleEnd: Date; paymentDueDate: Date; }`
  - `getCycleByIndex(cutoffDay: number, paymentDay: number, index: number, now?: Date): CreditCycle`
  - `cycleIndexOf(cutoffDay: number, date: Date, now?: Date): number`

- [ ] **Step 1: Write the failing test**

Crear `src/__tests__/utils/creditCycles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getCycleByIndex, cycleIndexOf } from '../../utils/creditCycles';

// Tarjeta: corte día 15, pago día 5. "Ahora" = 20 jun 2026 (ya pasó el corte de junio).
const NOW = new Date(2026, 5, 20); // 20 jun 2026
const CUTOFF = 15;
const PAY = 5;

describe('getCycleByIndex', () => {
  it('index 0 = ciclo actual: cierra 15 jul, paga 5 ago (corte ya pasó este mes)', () => {
    const c = getCycleByIndex(CUTOFF, PAY, 0, NOW);
    expect(c.cycleEnd.getFullYear()).toBe(2026);
    expect(c.cycleEnd.getMonth()).toBe(6);  // julio
    expect(c.cycleEnd.getDate()).toBe(15);
    expect(c.cycleStart.getMonth()).toBe(5); // 16 jun
    expect(c.cycleStart.getDate()).toBe(16);
    expect(c.paymentDueDate.getMonth()).toBe(7); // agosto
    expect(c.paymentDueDate.getDate()).toBe(5);
  });

  it('index -1 = ciclo anterior: cierra 15 jun, paga 5 jul', () => {
    const c = getCycleByIndex(CUTOFF, PAY, -1, NOW);
    expect(c.cycleEnd.getMonth()).toBe(5); // junio
    expect(c.paymentDueDate.getMonth()).toBe(6); // julio
  });

  it('acota corte de fin de mes: corte 31 en febrero → 28 (2026 no bisiesto)', () => {
    const c = getCycleByIndex(31, 15, 0, new Date(2026, 1, 10)); // 10 feb, antes del corte
    expect(c.cycleEnd.getMonth()).toBe(1); // febrero
    expect(c.cycleEnd.getDate()).toBe(28);
  });

  it('cruza año: index +6 desde julio cae en el año siguiente', () => {
    const c = getCycleByIndex(CUTOFF, PAY, 6, NOW); // base cierre jul 2026 + 6 = ene 2027
    expect(c.cycleEnd.getFullYear()).toBe(2027);
    expect(c.cycleEnd.getMonth()).toBe(0);
  });
});

describe('cycleIndexOf', () => {
  it('una fecha dentro del ciclo actual → 0', () => {
    expect(cycleIndexOf(CUTOFF, new Date(2026, 5, 20), NOW)).toBe(0); // 20 jun, post-corte → ciclo que cierra jul
  });
  it('una compra de mayo (antes del corte de jun) → -1', () => {
    expect(cycleIndexOf(CUTOFF, new Date(2026, 4, 10), NOW)).toBe(-1);
  });
  it('coherencia: la fecha del cierre del index i pertenece al ciclo i', () => {
    const c = getCycleByIndex(CUTOFF, PAY, -2, NOW);
    expect(cycleIndexOf(CUTOFF, c.cycleEnd, NOW)).toBe(-2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/__tests__/utils/creditCycles.test.ts`
Expected: FAIL — `Failed to resolve import "../../utils/creditCycles"`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/utils/creditCycles.ts`:

```ts
/**
 * Helpers PUROS de ciclos de facturación de tarjetas, generalizados a CUALQUIER
 * ciclo, indexado por entero relativo al ciclo actual:
 *   index 0 = ciclo actual (el que cierra en el próximo corte); <0 pasados; >0 futuros.
 * Reusa effectiveDueDay para acotar el día de corte/pago a fin de mes.
 */
import { effectiveDueDay } from './recurringDates';

export interface CreditCycle {
  index: number;
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
}

/** Mes/año del cierre (cutoff) del ciclo ACTUAL respecto a `now`. */
function currentCycleEndMonth(cutoffDay: number, now: Date): { y: number; m: number } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const cutoff = effectiveDueDay(cutoffDay, y, m);
  if (now.getDate() <= cutoff) return { y, m }; // antes/igual al corte → cierra este mes
  const nm = m + 1;
  return nm > 11 ? { y: y + 1, m: 0 } : { y, m: nm };
}

/** Normaliza un mes absoluto (puede ser negativo o >11) a {y, m}. */
function normMonth(baseY: number, monthAbs: number): { y: number; m: number } {
  const y = baseY + Math.floor(monthAbs / 12);
  const m = ((monthAbs % 12) + 12) % 12;
  return { y, m };
}

/** Ciclo en el offset `index` relativo al ciclo actual. */
export function getCycleByIndex(
  cutoffDay: number,
  paymentDay: number,
  index: number,
  now: Date = new Date(),
): CreditCycle {
  const base = currentCycleEndMonth(cutoffDay, now);
  const endAbs = base.m + index;

  const end = normMonth(base.y, endAbs);
  const cycleEnd = new Date(end.y, end.m, effectiveDueDay(cutoffDay, end.y, end.m), 23, 59, 59, 999);

  const start = normMonth(base.y, endAbs - 1); // corte del mes anterior
  const cycleStart = new Date(start.y, start.m, effectiveDueDay(cutoffDay, start.y, start.m) + 1, 0, 0, 0, 0);

  const pay = normMonth(base.y, endAbs + 1); // pago: mes siguiente al cierre
  const paymentDueDate = new Date(pay.y, pay.m, effectiveDueDay(paymentDay, pay.y, pay.m));

  return { index, cycleStart, cycleEnd, paymentDueDate };
}

/** Índice del ciclo cuya ventana contiene `date` (relativo al ciclo actual a `now`). */
export function cycleIndexOf(cutoffDay: number, date: Date, now: Date = new Date()): number {
  const base = currentCycleEndMonth(cutoffDay, now);
  const d = new Date(date);
  let dy = d.getFullYear();
  let dm = d.getMonth();
  const cutoff = effectiveDueDay(cutoffDay, dy, dm);
  if (d.getDate() > cutoff) {
    dm += 1;
    if (dm > 11) { dm = 0; dy += 1; }
  }
  return (dy - base.y) * 12 + (dm - base.m);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/__tests__/utils/creditCycles.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/utils/creditCycles.ts src/__tests__/utils/creditCycles.test.ts
git commit -m "feat(tarjetas): helpers puros de ciclo de facturación (cualquier ciclo)"
```

---

### Task 2: Cargo por ciclo (cuotas → mes correcto)

Calcula, para una tarjeta y un ciclo `index`, el total de cargos y el desglose de cuotas. Cada gasto se trata como cuotas (contado = 1 cuota): la cuota *k* cae en el ciclo `firstIndex + (k-1)`.

**Files:**
- Create: `src/utils/cardPaymentSchedule.ts`
- Test: `src/__tests__/utils/cardPaymentSchedule.test.ts`

**Interfaces:**
- Consumes: `cycleIndexOf` (Task 1), `roundMoney` de `src/utils/formatters.ts`, tipo `Transaction`.
- Produces:
  - `interface InstallmentItem { description: string; cuota: number; total: number; amount: number; }`
  - `cardStatementForCycle(cutoffDay: number, index: number, charges: Transaction[], now: Date): { total: number; items: InstallmentItem[] }`

- [ ] **Step 1: Write the failing test**

Crear `src/__tests__/utils/cardPaymentSchedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Transaction } from '../../types/finance';
import { cardStatementForCycle } from '../../utils/cardPaymentSchedule';

const NOW = new Date(2026, 5, 20); // 20 jun 2026; corte 15 → ciclo actual cierra jul (index 0)
const CUTOFF = 15;

const tx = (o: Partial<Transaction>): Transaction => ({
  id: 'x', type: 'expense', amount: 0, category: 'Compras', description: 'Compra',
  date: new Date(2026, 4, 10), paid: false, accountId: 'tc', ...o,
} as Transaction);

describe('cardStatementForCycle', () => {
  it('compra a 12 cuotas de mayo: cuota 1 en index -1, cuota 2 en index 0', () => {
    // mayo (10/05) cae en cycleIndexOf = -1 respecto a NOW.
    const charges = [tx({ amount: 1_200_000, installments: 12, monthlyInstallmentAmount: 100_000 })];
    expect(cardStatementForCycle(CUTOFF, -1, charges, NOW).total).toBe(100_000);
    const cur = cardStatementForCycle(CUTOFF, 0, charges, NOW);
    expect(cur.total).toBe(100_000);
    expect(cur.items[0].cuota).toBe(2);
    expect(cur.items[0].total).toBe(12);
  });

  it('compra a 12 cuotas: ya no aporta en index 12 (fuera de rango)', () => {
    const charges = [tx({ amount: 1_200_000, installments: 12, monthlyInstallmentAmount: 100_000 })];
    expect(cardStatementForCycle(CUTOFF, 11, charges, NOW).total).toBe(100_000); // cuota 12 (última)
    expect(cardStatementForCycle(CUTOFF, 12, charges, NOW).total).toBe(0);
  });

  it('compra de contado solo aparece en su propio ciclo', () => {
    const charges = [tx({ amount: 50_000, installments: 1 })]; // mayo → index -1
    expect(cardStatementForCycle(CUTOFF, -1, charges, NOW).total).toBe(50_000);
    expect(cardStatementForCycle(CUTOFF, 0, charges, NOW).total).toBe(0);
  });

  it('sin monthlyInstallmentAmount: divide el monto entre cuotas', () => {
    const charges = [tx({ amount: 300_000, installments: 3 })];
    expect(cardStatementForCycle(CUTOFF, -1, charges, NOW).total).toBe(100_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/__tests__/utils/cardPaymentSchedule.test.ts`
Expected: FAIL — `Failed to resolve import "../../utils/cardPaymentSchedule"`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/utils/cardPaymentSchedule.ts`:

```ts
/**
 * Constructor PURO del calendario de pagos de tarjetas (extractos).
 * Proyecta cuotas mes a mes desde el historial COMPLETO de transacciones.
 */
import type { Transaction } from '../types/finance';
import { cycleIndexOf } from './creditCycles';
import { roundMoney } from './formatters';

export interface InstallmentItem {
  description: string;
  cuota: number;   // número de cuota (1-based)
  total: number;   // total de cuotas
  amount: number;  // monto de esta cuota
}

/** Cargos de una tarjeta que caen en el ciclo `index` (cuotas + contado). */
export function cardStatementForCycle(
  cutoffDay: number,
  index: number,
  charges: Transaction[],
  now: Date,
): { total: number; items: InstallmentItem[] } {
  const items: InstallmentItem[] = [];
  let total = 0;
  for (const tx of charges) {
    const first = cycleIndexOf(cutoffDay, new Date(tx.date), now);
    const n = tx.installments && tx.installments > 1 ? tx.installments : 1;
    const k = index - first; // offset 0-based de la cuota
    if (k < 0 || k >= n) continue;
    const amount = n > 1 ? (tx.monthlyInstallmentAmount ?? tx.amount / n) : tx.amount;
    total += amount;
    items.push({
      description: tx.description || 'Compra',
      cuota: k + 1,
      total: n,
      amount: roundMoney(amount),
    });
  }
  return { total: roundMoney(total), items };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/__tests__/utils/cardPaymentSchedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cardPaymentSchedule.ts src/__tests__/utils/cardPaymentSchedule.test.ts
git commit -m "feat(tarjetas): cargo por ciclo con desglose de cuotas"
```

---

### Task 3: Estado de pago del ciclo (pagado / parcial / pendiente / proyectado)

Suma de pagos a la tarjeta dentro de la ventana de pago del ciclo, y clasificación de estado. Heurística documentada: los pagos no están etiquetados a un ciclo concreto.

**Files:**
- Modify: `src/utils/cardPaymentSchedule.ts` (append)
- Test: `src/__tests__/utils/cardPaymentSchedule.test.ts` (append)

**Interfaces:**
- Consumes: `getCycleByIndex` (Task 1), tipo `Transaction`.
- Produces:
  - `type CycleStatus = 'paid' | 'partial' | 'pending' | 'projected'`
  - `paidForCycle(cutoffDay: number, paymentDay: number, index: number, payments: Transaction[], now: Date): number`
  - `cycleStatus(index: number, total: number, paid: number): CycleStatus`

- [ ] **Step 1: Write the failing test**

Append a `src/__tests__/utils/cardPaymentSchedule.test.ts`:

```ts
import { paidForCycle, cycleStatus } from '../../utils/cardPaymentSchedule';

describe('paidForCycle + cycleStatus', () => {
  const NOW2 = new Date(2026, 5, 20);
  const CUT = 15, PAY = 5;
  const pay = (date: Date, amount: number): Transaction => ({
    id: 'p', type: 'transfer', amount, category: 'Pago Crédito', description: '',
    date, paid: true, accountId: 'banco', toAccountId: 'tc',
  } as Transaction);

  it('cuenta pagos en la ventana (cierre, próximo cierre]', () => {
    // ciclo -1 cierra 15 jun; ventana de pago = (15 jun, 15 jul]. Un pago el 5 jul cuenta.
    const sum = paidForCycle(CUT, PAY, -1, [pay(new Date(2026, 6, 5), 100_000)], NOW2);
    expect(sum).toBe(100_000);
    // un pago el 20 jun (dentro de otra ventana) NO cuenta para el ciclo -1... cuenta para el 0.
    const none = paidForCycle(CUT, PAY, -1, [pay(new Date(2026, 5, 20), 100_000)], NOW2);
    expect(none).toBe(0);
  });

  it('estado: futuro=projected, total pagado=paid, parcial=partial, cero=pending', () => {
    expect(cycleStatus(1, 100_000, 0)).toBe('projected');
    expect(cycleStatus(-1, 100_000, 100_000)).toBe('paid');
    expect(cycleStatus(-1, 100_000, 40_000)).toBe('partial');
    expect(cycleStatus(-1, 100_000, 0)).toBe('pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/__tests__/utils/cardPaymentSchedule.test.ts`
Expected: FAIL — `paidForCycle`/`cycleStatus` no exportados.

- [ ] **Step 3: Write minimal implementation**

Append a `src/utils/cardPaymentSchedule.ts` (añade el import de `getCycleByIndex` arriba):

```ts
// (al inicio del archivo, junto al import de cycleIndexOf)
import { cycleIndexOf, getCycleByIndex } from './creditCycles';
```

```ts
export type CycleStatus = 'paid' | 'partial' | 'pending' | 'projected';

/**
 * Pagos a la tarjeta dentro de la ventana de pago del ciclo `index`:
 * (cierre del ciclo, cierre del ciclo siguiente].
 *
 * // ponytail: heurística — los pagos no se etiquetan a un ciclo concreto; un
 * // pago podría cubrir parte de otro. Suficiente para visualización.
 * // Upgrade path: etiquetar pagos a su ciclo (como recurringCycle) si se necesita exactitud.
 */
export function paidForCycle(
  cutoffDay: number,
  paymentDay: number,
  index: number,
  payments: Transaction[],
  now: Date,
): number {
  const cyc = getCycleByIndex(cutoffDay, paymentDay, index, now);
  const next = getCycleByIndex(cutoffDay, paymentDay, index + 1, now);
  let sum = 0;
  for (const p of payments) {
    const d = new Date(p.date);
    if (d > cyc.cycleEnd && d <= next.cycleEnd) sum += p.amount;
  }
  return roundMoney(sum);
}

export function cycleStatus(index: number, total: number, paid: number): CycleStatus {
  if (index > 0) return 'projected';
  if (paid >= total - 0.01) return 'paid';
  if (paid <= 0.01) return 'pending';
  return 'partial';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/__tests__/utils/cardPaymentSchedule.test.ts`
Expected: PASS (Task 2 + Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cardPaymentSchedule.ts src/__tests__/utils/cardPaymentSchedule.test.ts
git commit -m "feat(tarjetas): estado de pago por ciclo (heurística documentada)"
```

---

### Task 4: Constructor del calendario + hook

Une todo: por tarjeta enumera ciclos (pasado acotado + futuro hasta agotar cuotas), suma periódicos solo a meses futuros, filtra ajustes, omite meses sin deuda y agrupa por mes calendario de la fecha de pago. Más el hook `useCardPaymentSchedule`.

**Files:**
- Modify: `src/utils/cardPaymentSchedule.ts` (append)
- Create: `src/hooks/useCardPaymentSchedule.ts`
- Test: `src/__tests__/hooks/useCardPaymentSchedule.test.ts`

**Interfaces:**
- Consumes: todo lo anterior; `getAccountReferenceIds` de `src/utils/accountTransactions.ts`; `getYearlyAnchorMonth` de `src/utils/recurringDates.ts`; `SPECIAL_CATEGORIES`, `APP_CONFIG` de `src/config/constants.ts`; tipos `Account`, `RecurringPayment`.
- Produces:
  - `interface RecurringItem { name: string; amount: number; }`
  - `interface CardMonthPayment { cardId: string; cardName: string; statementTotal: number; paidAmount: number; status: CycleStatus; installmentItems: InstallmentItem[]; recurringItems: RecurringItem[]; cycleStart: Date; cycleEnd: Date; paymentDueDate: Date; }`
  - `interface MonthGroup { monthKey: string; label: string; total: number; isCurrent: boolean; isFuture: boolean; cards: CardMonthPayment[]; }`
  - `buildCardPaymentSchedule(accounts: Account[], transactions: Transaction[], recurringPayments: RecurringPayment[], now?: Date): MonthGroup[]`
  - hook `useCardPaymentSchedule(accounts, transactions, recurringPayments): MonthGroup[]`

- [ ] **Step 1: Write the failing test**

Crear `src/__tests__/hooks/useCardPaymentSchedule.test.ts` (prueba el constructor puro directamente; el hook es un `useMemo` trivial):

```ts
import { describe, it, expect } from 'vitest';
import type { Account, Transaction, RecurringPayment } from '../../types/finance';
import { buildCardPaymentSchedule } from '../../utils/cardPaymentSchedule';

const NOW = new Date(2026, 5, 20); // 20 jun 2026
const card: Account = {
  id: 'tc', name: 'Visa', type: 'credit', isDefault: false,
  initialBalance: 0, creditLimit: 5_000_000, cutoffDay: 15, paymentDay: 5,
};

const charge = (o: Partial<Transaction>): Transaction => ({
  id: 'c', type: 'expense', amount: 0, category: 'Compras', description: 'Compra',
  date: new Date(2026, 4, 10), paid: false, accountId: 'tc', ...o,
} as Transaction);

describe('buildCardPaymentSchedule', () => {
  it('proyecta cuotas a varios meses y omite meses sin deuda', () => {
    // Compra de mayo a 3 cuotas de 100k → cuotas en index -1, 0, 1.
    const groups = buildCardPaymentSchedule(
      [card],
      [charge({ amount: 300_000, installments: 3, monthlyInstallmentAmount: 100_000 })],
      [], NOW,
    );
    // 3 meses con deuda, todos con total 100k.
    expect(groups.length).toBe(3);
    expect(groups.every(g => g.total === 100_000)).toBe(true);
    // Ordenados ascendente por monthKey.
    const keys = groups.map(g => g.monthKey);
    expect([...keys].sort()).toEqual(keys);
  });

  it('estado: cuota pasada pagada=paid, futura=projected', () => {
    const payment: Transaction = {
      id: 'p', type: 'transfer', amount: 100_000, category: 'Pago Crédito', description: '',
      date: new Date(2026, 6, 5), paid: true, accountId: 'banco', toAccountId: 'tc',
    } as Transaction;
    const groups = buildCardPaymentSchedule(
      [card],
      [charge({ amount: 300_000, installments: 3, monthlyInstallmentAmount: 100_000 }), payment],
      [], NOW,
    );
    const past = groups.find(g => g.cards[0].cycleEnd.getMonth() === 5); // ciclo -1 (cierra jun)
    expect(past?.cards[0].status).toBe('paid');
    const future = groups[groups.length - 1];
    expect(future.cards[0].status).toBe('projected');
  });

  it('periódico de la tarjeta se suma SOLO a meses futuros (no duplica el pasado)', () => {
    const rec: RecurringPayment = {
      id: 'r', name: 'Netflix', amount: 40_000, category: 'Entretenimiento',
      accountId: 'tc', dueDay: 10, frequency: 'monthly', isActive: true,
    };
    // Compra a 3 cuotas (index -1,0,1) + periódico. Futuro (index 1) = 100k + 40k.
    const groups = buildCardPaymentSchedule(
      [card],
      [charge({ amount: 300_000, installments: 3, monthlyInstallmentAmount: 100_000 })],
      [rec], NOW,
    );
    const future = groups[groups.length - 1]; // index 1
    expect(future.cards[0].statementTotal).toBe(140_000);
    expect(future.cards[0].recurringItems[0].name).toBe('Netflix');
    const past = groups[0]; // index -1
    expect(past.cards[0].statementTotal).toBe(100_000); // sin periódico
  });

  it('excluye ajustes de saldo de los cargos', () => {
    const groups = buildCardPaymentSchedule(
      [card],
      [charge({ amount: 999_000, installments: 1, category: 'Ajuste de saldo' })],
      [], NOW,
    );
    expect(groups.length).toBe(0); // el ajuste no es un cargo real
  });

  it('consolida dos tarjetas que pagan el mismo mes', () => {
    const card2: Account = { ...card, id: 'tc2', name: 'Amex' };
    const groups = buildCardPaymentSchedule(
      [card, card2],
      [
        charge({ id: 'a', amount: 100_000, installments: 1 }),                 // tc, mayo → index -1
        charge({ id: 'b', accountId: 'tc2', amount: 70_000, installments: 1 }), // tc2, mayo → index -1
      ],
      [], NOW,
    );
    const g = groups[0];
    expect(g.total).toBe(170_000);
    expect(g.cards.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/__tests__/hooks/useCardPaymentSchedule.test.ts`
Expected: FAIL — `buildCardPaymentSchedule` no exportado.

- [ ] **Step 3: Write minimal implementation**

Append a `src/utils/cardPaymentSchedule.ts` (añade imports arriba):

```ts
// (imports adicionales al inicio del archivo)
import type { Account, RecurringPayment } from '../types/finance';
import { getAccountReferenceIds } from './accountTransactions';
import { getYearlyAnchorMonth } from './recurringDates';
import { SPECIAL_CATEGORIES, APP_CONFIG } from '../config/constants';
```

(`getCycleByIndex`/`cycleIndexOf` ya se importan de `./creditCycles` desde Tasks 2-3 — abajo solo se amplía ese import con el tipo `CreditCycle`.)

```ts
export interface RecurringItem { name: string; amount: number; }

export interface CardMonthPayment {
  cardId: string;
  cardName: string;
  statementTotal: number;
  paidAmount: number;
  status: CycleStatus;
  installmentItems: InstallmentItem[];
  recurringItems: RecurringItem[];
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
}

export interface MonthGroup {
  monthKey: string;   // 'YYYY-MM' de la fecha de pago
  label: string;      // 'julio de 2026'
  total: number;
  isCurrent: boolean;
  isFuture: boolean;
  cards: CardMonthPayment[];
}

const PAST_MONTHS = 6;            // ponytail: tope de histórico; configurable si se pide
const MAX_FUTURE = 12;            // ponytail: tope duro de proyección
const MIN_FUTURE_RECURRING = 3;   // si solo hay periódicos (sin cuotas), proyecta 3 meses

// Cargos: excluir categorías de ajuste/préstamo (no son compras reales).
const CHARGE_EXCLUDED = new Set<string>(SPECIAL_CATEGORIES.adjustmentCategories);
// Pagos: excluir solo ajustes de saldo; 'Pago Crédito'/'Pago TC' SÍ son pagos.
const PAYMENT_EXCLUDED = new Set<string>(SPECIAL_CATEGORIES.groupedAdjustmentCategories);

const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const labelOf = (d: Date): string =>
  d.toLocaleDateString(APP_CONFIG.locale, { month: 'long', year: 'numeric' });

function isCardCharge(tx: Transaction, refIds: Set<string>): boolean {
  return tx.type === 'expense' && refIds.has(tx.accountId) && !CHARGE_EXCLUDED.has(tx.category);
}
function isCardPayment(tx: Transaction, refIds: Set<string>): boolean {
  if (PAYMENT_EXCLUDED.has(tx.category)) return false;
  return (tx.type === 'income' && refIds.has(tx.accountId)) ||
    (tx.type === 'transfer' && !!tx.toAccountId && refIds.has(tx.toAccountId));
}

function recurringForCycle(
  refIds: Set<string>,
  cycle: CreditCycle,
  recurringPayments: RecurringPayment[],
): { total: number; items: RecurringItem[] } {
  if (cycle.index <= 0) return { total: 0, items: [] }; // pasado/actual ya está en txs reales
  const items: RecurringItem[] = [];
  let total = 0;
  for (const r of recurringPayments) {
    if (!r.isActive || !r.accountId || !refIds.has(r.accountId)) continue;
    if (r.frequency === 'yearly') {
      const anchor = getYearlyAnchorMonth(r, cycle.cycleEnd.getMonth());
      if (cycle.cycleEnd.getMonth() !== anchor) continue; // anual: solo su mes
    }
    total += r.amount;
    items.push({ name: r.name, amount: r.amount });
  }
  return { total: roundMoney(total), items };
}

function computeFutureHorizon(
  cutoffDay: number,
  charges: Transaction[],
  refIds: Set<string>,
  recurringPayments: RecurringPayment[],
  now: Date,
): number {
  let maxIdx = 0;
  for (const tx of charges) {
    const n = tx.installments && tx.installments > 1 ? tx.installments : 1;
    const last = cycleIndexOf(cutoffDay, new Date(tx.date), now) + n - 1;
    if (last > maxIdx) maxIdx = last;
  }
  const hasRecurring = recurringPayments.some(r => r.isActive && r.accountId && refIds.has(r.accountId));
  if (hasRecurring && maxIdx < MIN_FUTURE_RECURRING) maxIdx = MIN_FUTURE_RECURRING;
  return Math.min(maxIdx, MAX_FUTURE);
}

export function buildCardPaymentSchedule(
  accounts: Account[],
  transactions: Transaction[],
  recurringPayments: RecurringPayment[],
  now: Date = new Date(),
): MonthGroup[] {
  const cards = accounts.filter(a => a.type === 'credit' && a.cutoffDay && a.paymentDay && a.id);
  const groups = new Map<string, MonthGroup>();
  const currentKey = monthKeyOf(now);

  for (const card of cards) {
    const refIds = new Set(getAccountReferenceIds(card));
    const charges = transactions.filter(t => isCardCharge(t, refIds));
    const payments = transactions.filter(t => isCardPayment(t, refIds));
    const horizon = computeFutureHorizon(card.cutoffDay!, charges, refIds, recurringPayments, now);

    for (let index = -PAST_MONTHS; index <= horizon; index++) {
      const cycle = getCycleByIndex(card.cutoffDay!, card.paymentDay!, index, now);
      const stmt = cardStatementForCycle(card.cutoffDay!, index, charges, now);
      const rec = recurringForCycle(refIds, cycle, recurringPayments);
      const statementTotal = roundMoney(stmt.total + rec.total);
      if (statementTotal <= 0) continue;

      const paid = index <= 0
        ? paidForCycle(card.cutoffDay!, card.paymentDay!, index, payments, now)
        : 0;

      const cardMonth: CardMonthPayment = {
        cardId: card.id!,
        cardName: card.name,
        statementTotal,
        paidAmount: paid,
        status: cycleStatus(index, statementTotal, paid),
        installmentItems: stmt.items,
        recurringItems: rec.items,
        cycleStart: cycle.cycleStart,
        cycleEnd: cycle.cycleEnd,
        paymentDueDate: cycle.paymentDueDate,
      };

      const key = monthKeyOf(cycle.paymentDueDate);
      const group = groups.get(key) ?? {
        monthKey: key,
        label: labelOf(cycle.paymentDueDate),
        total: 0,
        isCurrent: key === currentKey,
        isFuture: key > currentKey,
        cards: [],
      };
      group.total = roundMoney(group.total + statementTotal);
      group.cards.push(cardMonth);
      groups.set(key, group);
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}
```

Nota: el tipo `CreditCycle` se usa en `recurringForCycle`; añade `CreditCycle` al import existente de `./creditCycles`:
```ts
import { cycleIndexOf, getCycleByIndex, type CreditCycle } from './creditCycles';
```

Crear `src/hooks/useCardPaymentSchedule.ts`:

```ts
import { useMemo } from 'react';
import type { Account, Transaction, RecurringPayment } from '../types/finance';
import { buildCardPaymentSchedule } from '../utils/cardPaymentSchedule';

export type {
  MonthGroup, CardMonthPayment, CycleStatus, InstallmentItem, RecurringItem,
} from '../utils/cardPaymentSchedule';

/** Calendario de pagos de tarjetas (extractos), memoizado. */
export function useCardPaymentSchedule(
  accounts: Account[],
  transactions: Transaction[],
  recurringPayments: RecurringPayment[],
) {
  return useMemo(
    () => buildCardPaymentSchedule(accounts, transactions, recurringPayments),
    [accounts, transactions, recurringPayments],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/__tests__/hooks/useCardPaymentSchedule.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cardPaymentSchedule.ts src/hooks/useCardPaymentSchedule.ts src/__tests__/hooks/useCardPaymentSchedule.test.ts
git commit -m "feat(tarjetas): constructor del calendario de pagos + hook useCardPaymentSchedule"
```

---

### Task 5: Modal de extractos (presentacional)

Modal que lista los meses con su total y permite expandir el desglose por tarjeta. Presentacional: recibe el `schedule` por props.

**Files:**
- Create: `src/components/views/accounts/components/CardStatementsModal.tsx`
- Test: `src/__tests__/components/cardStatementsModal.test.tsx`

**Interfaces:**
- Consumes: `BaseModal` de `src/components/modals/BaseModal.tsx`; `useUIPreferences` de `@/contexts/UIPreferencesContext`; tipos `MonthGroup`, `CardMonthPayment`, `CycleStatus` de `src/hooks/useCardPaymentSchedule.ts`.
- Produces: `CardStatementsModal` con props `{ isOpen: boolean; onClose: () => void; schedule: MonthGroup[]; formatCurrency: (n: number) => string; }`.

- [ ] **Step 1: Write the failing test**

Crear `src/__tests__/components/cardStatementsModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MonthGroup } from '../../hooks/useCardPaymentSchedule';
import { CardStatementsModal } from '../../components/views/accounts/components/CardStatementsModal';

vi.mock('@/contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false }),
}));

const schedule: MonthGroup[] = [{
  monthKey: '2026-07', label: 'julio de 2026', total: 100_000, isCurrent: true, isFuture: false,
  cards: [{
    cardId: 'tc', cardName: 'Visa', statementTotal: 100_000, paidAmount: 0, status: 'pending',
    installmentItems: [{ description: 'TV', cuota: 2, total: 12, amount: 100_000 }],
    recurringItems: [],
    cycleStart: new Date(2026, 5, 16), cycleEnd: new Date(2026, 6, 15), paymentDueDate: new Date(2026, 7, 5),
  }],
}];

const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`;

describe('CardStatementsModal', () => {
  it('muestra el mes y el total', () => {
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={schedule} formatCurrency={fmt} />);
    expect(screen.getByText(/julio de 2026/i)).toBeTruthy();
    expect(screen.getAllByText(/\$100\.000/).length).toBeGreaterThan(0);
  });

  it('al expandir un mes muestra el desglose por tarjeta', () => {
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={schedule} formatCurrency={fmt} />);
    fireEvent.click(screen.getByRole('button', { name: /julio de 2026/i }));
    expect(screen.getByText('Visa')).toBeTruthy();
    expect(screen.getByText(/cuota 2\/12/i)).toBeTruthy();
  });

  it('estado vacío cuando no hay meses con deuda', () => {
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={[]} formatCurrency={fmt} />);
    expect(screen.getByText(/no tienes pagos de tarjeta/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/__tests__/components/cardStatementsModal.test.tsx`
Expected: FAIL — `Failed to resolve import ".../CardStatementsModal"`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/components/views/accounts/components/CardStatementsModal.tsx`:

```tsx
'use client';

import React, { useMemo, useState } from 'react';
import { Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import { BaseModal } from '@/components/modals/BaseModal';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import type { MonthGroup, CardMonthPayment, CycleStatus } from '@/hooks/useCardPaymentSchedule';

interface CardStatementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: MonthGroup[];
  formatCurrency: (n: number) => string;
}

const STATUS_META: Record<CycleStatus, { label: string; cls: string }> = {
  paid: { label: 'Pagado', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  partial: { label: 'Parcial', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  pending: { label: 'Pendiente', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  projected: { label: 'Proyectado', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
};

export function CardStatementsModal({ isOpen, onClose, schedule, formatCurrency }: CardStatementsModalProps) {
  const [filter, setFilter] = useState<'all' | string>('all');

  const cardOptions = useMemo(() => {
    const m = new Map<string, string>();
    schedule.forEach(g => g.cards.forEach(c => m.set(c.cardId, c.cardName)));
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [schedule]);

  const view = useMemo(() => {
    if (filter === 'all') return schedule;
    return schedule
      .map(g => {
        const cards = g.cards.filter(c => c.cardId === filter);
        return { ...g, cards, total: cards.reduce((s, c) => s + c.statementTotal, 0) };
      })
      .filter(g => g.cards.length > 0);
  }, [schedule, filter]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Extractos de tarjetas"
      titleIcon={<Receipt size={20} className="text-purple-600 dark:text-purple-400" />}
      maxWidth="max-w-lg"
    >
      {cardOptions.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todas</FilterChip>
          {cardOptions.map(c => (
            <FilterChip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>{c.name}</FilterChip>
          ))}
        </div>
      )}

      {view.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No tienes pagos de tarjeta pendientes.
        </p>
      ) : (
        <div className="space-y-2">
          {view.map(g => <MonthPaymentRow key={g.monthKey} group={g} formatCurrency={formatCurrency} />)}
        </div>
      )}
    </BaseModal>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

function MonthPaymentRow({ group, formatCurrency }: { group: MonthGroup; formatCurrency: (n: number) => string }) {
  const { hideBalances } = useUIPreferences();
  const [open, setOpen] = useState(group.isCurrent);
  const show = (n: number) => (hideBalances ? '••••••' : formatCurrency(n));

  return (
    <div
      className={`rounded-xl border ${
        group.isCurrent
          ? 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-900/20'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-xl"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          <span className="font-semibold capitalize text-gray-900 dark:text-gray-100">{group.label}</span>
          {group.isCurrent && (
            <span className="rounded-full bg-purple-600 px-2 py-0.5 text-xs font-medium text-white">Este mes</span>
          )}
        </span>
        <span className="font-bold text-gray-900 dark:text-gray-100">{show(group.total)}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-gray-100 px-3 pb-3 pt-2 dark:border-gray-700">
          {group.cards.map((c, i) => <CardRow key={c.cardId + i} card={c} show={show} />)}
        </div>
      )}
    </div>
  );
}

function CardRow({ card, show }: { card: CardMonthPayment; show: (n: number) => string }) {
  const meta = STATUS_META[card.status];
  return (
    <div className="rounded-lg bg-white/70 p-2.5 text-sm dark:bg-gray-800/60">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">{card.cardName}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
        </span>
        <span className="font-semibold text-gray-900 dark:text-gray-100">{show(card.statementTotal)}</span>
      </div>

      {card.status === 'partial' && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Pagaste {show(card.paidAmount)} de {show(card.statementTotal)}
        </p>
      )}

      {(card.installmentItems.length > 0 || card.recurringItems.length > 0) && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
          {card.installmentItems.map((it, i) => (
            <li key={'i' + i} className="flex justify-between gap-2">
              <span className="truncate">{it.description} · cuota {it.cuota}/{it.total}</span>
              <span>{show(it.amount)}</span>
            </li>
          ))}
          {card.recurringItems.map((it, i) => (
            <li key={'r' + i} className="flex justify-between gap-2">
              <span className="truncate">{it.name} (periódico)</span>
              <span>{show(it.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/__tests__/components/cardStatementsModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/accounts/components/CardStatementsModal.tsx src/__tests__/components/cardStatementsModal.test.tsx
git commit -m "feat(tarjetas): modal de extractos (calendario de pagos)"
```

---

### Task 6: Botón "Extractos" en AccountsView

Cablea el botón (visible solo si hay tarjetas de crédito), el estado de apertura, el hook y el modal.

**Files:**
- Modify: `src/components/views/accounts/AccountsView.tsx`

**Interfaces:**
- Consumes: `useCardPaymentSchedule` (Task 4), `CardStatementsModal` (Task 5), `balanceTransactions` de `useTransactionDomain()`, `recurringPayments` de `useRecurringDomain()` (ya importado), `formatCurrency`.

- [ ] **Step 1: Añadir imports**

En `src/components/views/accounts/AccountsView.tsx`:

- En el import de `lucide-react` (línea 4) añade `Receipt`:
```tsx
import { Plus, Wallet, CreditCard, Banknote, Receipt } from 'lucide-react';
```
- Tras los imports de componentes locales añade:
```tsx
import { CardStatementsModal } from './components/CardStatementsModal';
import { useCardPaymentSchedule } from '../../../hooks/useCardPaymentSchedule';
```

- [ ] **Step 2: Tomar `balanceTransactions`, calcular el schedule y el estado del modal**

- En la desestructuración de `useTransactionDomain()` (línea 47) añade `balanceTransactions`:
```tsx
  const { addTransaction, balanceTransactions } = useTransactionDomain();
```
- Tras `const formatCurrency = useFormatCurrency();` añade:
```tsx
  const [showStatements, setShowStatements] = useState(false);
  const paymentSchedule = useCardPaymentSchedule(accounts, balanceTransactions, recurringPayments);
```
(`useState` ya está importado.)

- [ ] **Step 3: Añadir el botón en el header**

Reemplaza el botón "Nueva Cuenta" del header (líneas ~370-382) envolviéndolo con el botón "Extractos" en un contenedor flex. El bloque queda:

```tsx
        <div className="flex flex-wrap items-center gap-2">
          {creditCards.length > 0 && (
            <button
              type="button"
              onClick={() => setShowStatements(true)}
              className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 min-h-[44px]"
            >
              <Receipt size={18} />
              Extractos
            </button>
          )}

          <button
            onClick={() => {
              if (accountsLoading) return;
              accountForm.openCreateForm();
            }}
            disabled={accountsLoading}
            className="btn-primary"
          >
            <Plus size={18} />
            Nueva Cuenta
          </button>
        </div>
```

Nota: `creditCards` ya está definido (línea 146).

- [ ] **Step 4: Renderizar el modal**

Tras `<CreditCardsConsolidatedSummary ... />` (≈línea 444) añade:

```tsx
      <CardStatementsModal
        isOpen={showStatements}
        onClose={() => setShowStatements(false)}
        schedule={paymentSchedule}
        formatCurrency={formatCurrency}
      />
```

- [ ] **Step 5: Verificar typecheck, lint y suite completa**

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores nuevos.

Run: `npm run test:run`
Expected: toda la suite en verde (incluye los nuevos tests).

- [ ] **Step 6: Verificación manual**

Run: `npm run dev`, abre la vista **Cuentas** con al menos una tarjeta de crédito que tenga una compra a cuotas. Confirma:
- Aparece el botón "Extractos" (solo si hay tarjetas).
- Al pulsarlo abre el modal con meses ordenados, "Este mes" resaltado, badges de estado, y desglose al expandir.
- Meses sin deuda no aparecen.

- [ ] **Step 7: Commit**

```bash
git add src/components/views/accounts/AccountsView.tsx
git commit -m "feat(tarjetas): botón Extractos en Cuentas que abre el calendario de pagos"
```

---

## Self-Review

**1. Spec coverage:**
- §2 botón + modal → Task 5, 6 ✓
- §5.1 historial completo (`balanceTransactions`) → Task 6 (cableado), Global Constraints ✓
- §5.2 ciclos generalizados + fin de mes → Task 1 ✓
- §5.3 cuotas → mes (statementTotal) → Task 2 ✓
- §5.4 periódicos solo futuro → Task 4 (`recurringForCycle`, test) ✓
- §5.5 estado pagado/parcial/pendiente/proyectado (heurística) → Task 3 ✓
- §5.6 horizonte pasado/futuro → Task 4 (`computeFutureHorizon`, `PAST_MONTHS`) ✓
- §5.7 agrupación por mes de pago + `isCurrent` → Task 4 ✓
- §6 tipos → Task 4 ✓
- §7 UI (filtro, fila mes, expand, badges, hideBalances, vacío) → Task 5 ✓
- §9 pruebas (cuota→mes, vacíos, estados, fin de mes, historial completo, consolidado) → Tasks 1-5 ✓
  - Exclusión de ajustes (memoria `adjustments-excluded-from-stats`) → Task 4 test ✓

**2. Placeholder scan:** sin TBD/TODO; todo el código está completo.

**3. Type consistency:** `MonthGroup`/`CardMonthPayment`/`CycleStatus`/`InstallmentItem`/`RecurringItem` definidos en Task 4 y reexportados por el hook; el modal (Task 5) los importa desde el hook. `getCycleByIndex`/`cycleIndexOf` (Task 1) usados por Tasks 2-4 con firmas idénticas. `cardStatementForCycle(cutoffDay, index, charges, now)`, `paidForCycle(cutoffDay, paymentDay, index, payments, now)`, `cycleStatus(index, total, paid)` consistentes entre definición y uso.

## Notas

- No se refactoriza `useCreditCardStatement` (sin uso en UI; fuera de alcance). Podría migrarse a `creditCycles.ts` luego sin tocar esta feature.
- `useCardPaymentSchedule` recibe `balanceTransactions`; en modo invitado ese array ya es el historial completo (ver `useBalanceTransactions`).
