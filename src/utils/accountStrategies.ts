/**
 * 🟢 STRATEGY PATTERN PARA TIPOS DE CUENTA
 *
 * Implementa el patrón Strategy para manejar diferentes tipos de cuentas
 * sin usar if/switch hardcodeados.
 *
 * PRINCIPIOS APLICADOS:
 * ✅ Open/Closed Principle: Abierto para extensión, cerrado para modificación
 * ✅ Single Responsibility: Cada estrategia maneja UN tipo de cuenta
 * ✅ Strategy Pattern: Algoritmos intercambiables
 *
 * BENEFICIOS:
 * - Agregar nuevos tipos de cuenta sin modificar código existente
 * - Lógica encapsulada por tipo
 * - Fácil de testear individualmente
 * - Elimina complejidad ciclomática
 */

import type { Account, Transaction } from '../types/finance';
import { transactionAccountIs, transactionDestinationIs, getAccountReferenceIds } from './accountTransactions';
import { getCreditDelta } from './creditDeltas';
import { roundMoney } from './formatters';

/**
 * Interfaz base para estrategias de cuenta
 * Define el contrato que todas las estrategias deben cumplir
 */
export interface AccountBalanceStrategy {
  /**
   * Calcula el balance de una cuenta específica
   * @param account - La cuenta a calcular
   * @param transactions - Lista de todas las transacciones
   * @returns Balance calculado según la lógica del tipo de cuenta
   */
  calculateBalance(account: Account, transactions: Transaction[]): number;

  /**
   * Valida si se puede realizar una transacción
   * @param account - Cuenta origen
   * @param amount - Monto de la transacción
   * @param transactions - Lista de transacciones para contexto
   * @param transactionType - Tipo de transacción (income, expense, transfer)
   * @returns Objeto con validación y mensaje de error si aplica
   */
  validateTransaction(
    account: Account,
    amount: number,
    transactions: Transaction[],
    transactionType?: 'income' | 'expense' | 'transfer'
  ): { valid: boolean; error?: string };

  /**
   * Indica si este tipo de cuenta se incluye en el balance total
   * (Las TC no se incluyen porque representan deuda)
   */
  includeInTotalBalance(): boolean;
}

/**
 * 🟢 ESTRATEGIA PARA CUENTAS DE AHORRO
 *
 * LÓGICA:
 * Balance = Saldo Inicial + Ingresos - Gastos - Transferencias Salientes + Transferencias Entrantes
 */
export class SavingsAccountStrategy implements AccountBalanceStrategy {
  calculateBalance(account: Account, transactions: Transaction[]): number {
    // Solo considerar transacciones pagadas
    const paidTransactions = transactions.filter(t => t.paid);

    // Calcular movimientos de la cuenta
    let balance = account.initialBalance;

    paidTransactions.forEach(t => {
      // Transacciones donde esta cuenta es origen
      if (t.accountId === account.id) {
        if (t.type === 'income') balance += t.amount;
        if (t.type === 'expense') balance -= t.amount;
        if (t.type === 'transfer') balance -= t.amount;
      }

      // Transferencias donde esta cuenta es destino
      if (t.toAccountId === account.id && t.type === 'transfer') {
        balance += t.amount;
      }
    });

    // Redondear a centavos para eliminar residuos IEEE-754 acumulados al sumar
    // floats (ej: 0.1 * 3 - 0.3). No cambia la semántica, solo limpia el total.
    return roundMoney(balance);
  }

  validateTransaction(
    account: Account,
    amount: number,
    transactions: Transaction[],
    transactionType?: 'income' | 'expense' | 'transfer'
  ): { valid: boolean; error?: string } {
    // Solo validar saldo para gastos y transferencias salientes
    if (transactionType === 'expense' || transactionType === 'transfer') {
      const currentBalance = this.calculateBalance(account, transactions);

      if (amount > currentBalance) {
        return {
          valid: false,
          error: `Saldo insuficiente. Disponible: $${currentBalance.toLocaleString('es-CO')}`
        };
      }
    }

    return { valid: true };
  }

  includeInTotalBalance(): boolean {
    return true; // Las cuentas de ahorro SÍ se incluyen en el balance total
  }
}

/**
 * 🟢 ESTRATEGIA PARA EFECTIVO
 *
 * LÓGICA: Idéntica a cuentas de ahorro
 * (Separada por si en el futuro se necesita lógica diferente)
 */
export class CashAccountStrategy implements AccountBalanceStrategy {
  private savingsStrategy = new SavingsAccountStrategy();

  calculateBalance(account: Account, transactions: Transaction[]): number {
    // Por ahora, efectivo funciona igual que ahorro
    return this.savingsStrategy.calculateBalance(account, transactions);
  }

  validateTransaction(
    account: Account,
    amount: number,
    transactions: Transaction[],
    transactionType?: 'income' | 'expense' | 'transfer'
  ): { valid: boolean; error?: string } {
    return this.savingsStrategy.validateTransaction(account, amount, transactions, transactionType);
  }

  includeInTotalBalance(): boolean {
    return true; // El efectivo SÍ se incluye en el balance total
  }
}

/**
 * 🟢 ESTRATEGIA PARA TARJETAS DE CRÉDITO
 *
 * LÓGICA:
 * - Balance mostrado = Cupo Disponible = Límite - Cupo Utilizado
 * - Cupo Utilizado = Capital pendiente = Σ compras - Σ pagos (ingresos + transferencias)
 * - NO se incluye en balance total (es deuda, no activo)
 *
 * MODELO DE CUOTAS (decisión de negocio):
 * Una compra a cuotas ocupa el CUPO COMPLETO desde el momento de la compra
 * (igual que los bancos reservan el total contra el cupo disponible) y se libera
 * a medida que se registran pagos hacia la TC. El monto por cuota mensual NO se
 * usa aquí; eso pertenece al estado de cuenta del ciclo (useCreditCardStatement),
 * que responde una pregunta distinta: "cuánto debo pagar este mes".
 *
 * Esta regla mantiene consistencia con el valor persistido (account.usedCredit),
 * la migración (useCreditMigration) y la importación (useImportTransactions),
 * que también acumulan el monto completo de cada compra.
 */
export class CreditCardStrategy implements AccountBalanceStrategy {
  /**
   * Calcula el cupo utilizado (capital pendiente por pagar)
   *
   * REGLA DE NEGOCIO:
   * Cupo Usado = Σ compras (monto completo) - Σ pagos (ingresos + transferencias)
   */
  private calculateUsedCredit(account: Account, transactions: Transaction[]): number {
    // RUTA DE DISPLAY/BALANCE: preferir el campo persistido (no depende de
    // paginación). Es la fuente autoritativa para mostrar cupo disponible.
    if (account.usedCredit != null) {
      return Math.max(0, account.usedCredit);
    }

    // Fallback: recalcular desde las transacciones en memoria.
    return this.recomputeUsedCreditFromTransactions(account, transactions);
  }

  /**
   * Recalcula el cupo utilizado SOLO desde el array de transacciones, ignorando
   * el campo persistido account.usedCredit.
   *
   * POR QUÉ: el campo persistido va por detrás del listener de Firestore. Justo
   * tras un add/delete reciente, account.usedCredit todavía refleja el estado
   * anterior (la actualización atómica ya se escribió, pero el snapshot aún no
   * llegó al cliente), causando falsos "Cupo insuficiente" o aceptaciones
   * inválidas. Para VALIDAR conviene usar el array de transacciones más fresco,
   * que se actualiza optimistamente en el mismo render.
   *
   * Suma getCreditDelta (la MISMA función que usan las escrituras atómicas para
   * ajustar usedCredit), sobre todas las referencias de id de la tarjeta (cubre
   * tarjetas fusionadas). Positivo = compra (sube deuda); negativo = pago.
   *
   * TRADE-OFF DE PAGINACIÓN: si las transacciones están paginadas y el array no
   * contiene todo el historial de la tarjeta, esta suma subestima el cupo usado.
   * Para la ruta de validación se prefiere igual, porque el escenario real que
   * rompe la UX es el desfase momentáneo del campo persistido tras una escritura
   * reciente (las transacciones recién creadas SÍ están en memoria). El display
   * de balance sigue usando el campo persistido, que sí es completo.
   */
  private recomputeUsedCreditFromTransactions(account: Account, transactions: Transaction[]): number {
    const accountIds = new Set(getAccountReferenceIds(account));

    const usedCredit = transactions.reduce((sum, t) => {
      // getCreditDelta espera el id de cuenta concreto; probamos contra cada
      // referencia (origen para gasto/ingreso, destino para transferencia).
      let delta = 0;
      if (t.accountId && accountIds.has(t.accountId)) {
        delta += getCreditDelta(t, t.accountId);
      }
      if (t.toAccountId && accountIds.has(t.toAccountId)) {
        delta += getCreditDelta(t, t.toAccountId);
      }
      return sum + delta;
    }, 0);

    // Redondear a centavos: la suma de deltas float puede dejar residuos IEEE-754.
    return Math.max(0, roundMoney(usedCredit));
  }

  calculateBalance(account: Account, transactions: Transaction[]): number {
    // Para TC, el "balance" es el cupo disponible
    const creditLimit = account.creditLimit || 0;
    const usedCredit = this.calculateUsedCredit(account, transactions);

    return Math.max(0, creditLimit - usedCredit);
  }

  validateTransaction(
    account: Account,
    amount: number,
    transactions: Transaction[],
    transactionType?: 'income' | 'expense' | 'transfer'
  ): { valid: boolean; error?: string } {
    // RUTA DE VALIDACIÓN: el cupo usado se recalcula desde el array de transacciones
    // más fresco (no del campo persistido, que va por detrás del listener tras un
    // add/delete reciente y produce falsos rechazos/aceptaciones). Ver
    // recomputeUsedCreditFromTransactions para el trade-off de paginación.
    //
    // PERF (R-recompute-submit): el recompute es O(N) sobre TODAS las transacciones.
    // Se difiere detrás de un getter memoizado y solo se invoca cuando el campo
    // persistido por sí solo NO basta para decidir el resultado. La semántica
    // Math.max(persisted, recompute) de F-tc-cupo se preserva INTACTA en todo camino
    // donde el recompute puede cambiar la decisión; los short-circuits de abajo solo
    // omiten el recompute en casos donde es DEMOSTRABLE que no altera el outcome.
    const persisted = account.usedCredit != null ? Math.max(0, account.usedCredit) : 0;
    let cachedRecompute: number | undefined;
    const recompute = (): number => {
      if (cachedRecompute === undefined) {
        cachedRecompute = this.recomputeUsedCreditFromTransactions(account, transactions);
      }
      return cachedRecompute;
    };

    // REGLA 1: Validar GASTOS - verificar cupo disponible
    if (transactionType === 'expense') {
      const creditLimit = account.creditLimit || 0;
      // Tomar el máximo entre el persistido (completo) y el recompute (fresco), igual
      // que la rama de PAGOS: en una TC con historial largo paginado el recompute solo
      // ve una fracción de las transacciones y SUBESTIMA la deuda → sin esto, el
      // validador sobreestimaba el cupo disponible y ACEPTABA un gasto sobre el límite.
      // El persistido cubre el subconteo por paginación; el recompute cubre un add
      // reciente aún no reflejado en el persistido. Audit F-tc-cupo.
      //
      // SHORT-CIRCUIT seguro: como recompute >= 0 y persisted >= 0, siempre
      // max(persisted, recompute) >= persisted, luego el disponible con el max NUNCA
      // es mayor que el disponible con solo el persistido. Si con SOLO el persistido
      // ya se rechaza, el recompute solo puede bajar más el disponible → el rechazo
      // se mantiene SIEMPRE. Rechazamos sin recomputar (outcome idéntico). Solo si el
      // persistido aceptaría hace falta el recompute fresco (caso #10: add reciente).
      const availableFromPersisted = Math.max(0, roundMoney(creditLimit - persisted));
      if (amount > availableFromPersisted) {
        return {
          valid: false,
          error: `Cupo insuficiente. Disponible: $${availableFromPersisted.toLocaleString('es-CO')}`
        };
      }
      const usedCredit = Math.max(persisted, recompute());
      const availableCredit = Math.max(0, roundMoney(creditLimit - usedCredit));

      if (amount > availableCredit) {
        return {
          valid: false,
          error: `Cupo insuficiente. Disponible: $${availableCredit.toLocaleString('es-CO')}`
        };
      }
    }

    // REGLA 2: Validar INGRESOS (Pagos a TC) - no se puede pagar más de lo que se debe
    if (transactionType === 'income') {
      // Para PAGOS preferimos el campo persistido (completo) cuando exista, en
      // lugar del recompute paginado. El recompute opera sobre el array en memoria,
      // que en una TC con historial largo paginado solo trae una fracción de las
      // transacciones; subestimar usedCredit haría rechazar PAGOS LEGÍTIMOS con
      // 'No hay deuda pendiente' / 'No puedes pagar más de lo que debes'. El campo
      // persistido (account.usedCredit) sí refleja la deuda total. Si no existe,
      // caemos al recompute. Tomamos el máximo para no subestimar la deuda en
      // ningún caso (un add reciente aún no reflejado en el persistido se cubre con
      // el recompute fresco; el subconteo por paginación se cubre con el persistido).
      // SHORT-CIRCUIT seguro: usedCredit = max(persisted, recompute) >= persisted.
      // Si persisted > 0 y persisted >= amount, entonces usedCredit >= persisted >=
      // amount > 0 → el pago se ACEPTA sin importar el recompute. Aceptamos sin
      // recomputar (outcome idéntico). En cualquier otro caso (persisted 0/bajo o
      // persisted < amount) sí hace falta el recompute fresco: cubre la deuda recién
      // creada en memoria que el persistido stale aún no refleja.
      if (persisted > 0 && persisted >= amount) {
        return { valid: true };
      }
      const usedCredit = Math.max(persisted, recompute());

      if (usedCredit === 0) {
        return {
          valid: false,
          error: 'No hay deuda pendiente en esta tarjeta'
        };
      }

      if (amount > usedCredit) {
        return {
          valid: false,
          error: `No puedes pagar más de lo que debes. Deuda actual: $${usedCredit.toLocaleString('es-CO')}`
        };
      }
    }

    // REGLA 3: Las transferencias DESDE TC están bloqueadas
    // (esto se maneja en el TransactionForm, pero validamos por seguridad)
    if (transactionType === 'transfer') {
      return {
        valid: false,
        error: 'No se pueden realizar transferencias desde una cuenta de Crédito'
      };
    }

    return { valid: true };
  }

  includeInTotalBalance(): boolean {
    return false; // Las TC NO se incluyen (representan deuda, no activo)
  }

  /**
   * 🆕 Método específico de TC: Obtener cupo utilizado
   */
  getUsedCredit(account: Account, transactions: Transaction[]): number {
    return this.calculateUsedCredit(account, transactions);
  }
}

/**
 * 🟢 FACTORY PARA ESTRATEGIAS
 *
 * Crea la estrategia correcta según el tipo de cuenta
 * Centraliza la creación y elimina if/switch del código cliente
 */
export class AccountStrategyFactory {
  private static strategies: Map<Account['type'], AccountBalanceStrategy> = new Map([
    ['savings', new SavingsAccountStrategy()],
    ['cash', new CashAccountStrategy()],
    ['credit', new CreditCardStrategy()]
  ]);

  /**
   * Obtiene la estrategia para un tipo de cuenta
   * @param accountType - Tipo de cuenta ('savings' | 'credit' | 'cash')
   * @returns Estrategia correspondiente
   * @throws Error si el tipo no está registrado
   */
  static getStrategy(accountType: Account['type']): AccountBalanceStrategy {
    const strategy = this.strategies.get(accountType);

    if (!strategy) {
      throw new Error(`No existe estrategia para el tipo de cuenta: ${accountType}`);
    }

    return strategy;
  }

  /**
   * 🆕 Registra una nueva estrategia (para extensibilidad futura)
   * Permite agregar nuevos tipos de cuenta sin modificar el factory
   *
   * @example
   * ```typescript
   * class InvestmentAccountStrategy implements AccountBalanceStrategy { ... }
   * AccountStrategyFactory.registerStrategy('investment', new InvestmentAccountStrategy());
   * ```
   */
  static registerStrategy(accountType: string, strategy: AccountBalanceStrategy): void {
    this.strategies.set(accountType as Account['type'], strategy);
  }

  /**
   * Verifica si existe estrategia para un tipo
   */
  static hasStrategy(accountType: string): boolean {
    return this.strategies.has(accountType as Account['type']);
  }
}

/**
 * 🆕 HELPER: Obtener estrategia específica de TC
 * Útil cuando se necesita acceder a métodos específicos de CreditCardStrategy
 */
export function getCreditCardStrategy(): CreditCardStrategy {
  const strategy = AccountStrategyFactory.getStrategy('credit');
  if (!(strategy instanceof CreditCardStrategy)) {
    throw new Error('La estrategia de crédito no es del tipo esperado');
  }
  return strategy;
}

/**
 * API ÚNICA y viva para el cupo utilizado (deuda pendiente) de una TC.
 * Reemplaza la capa @deprecated CreditCardCalculator. Conserva el guard de tipo:
 * una cuenta que no es de crédito devuelve 0.
 */
export function getCreditCardUsedCredit(account: Account, transactions: Transaction[]): number {
  if (account.type !== 'credit') return 0;
  return getCreditCardStrategy().getUsedCredit(account, transactions);
}
