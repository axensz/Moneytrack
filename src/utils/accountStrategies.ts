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

    return balance;
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
 * - Cupo Utilizado = Gastos NO pagados - Transferencias recibidas (pagos)
 * - NO se incluye en balance total (es deuda, no activo)
 */
export class CreditCardStrategy implements AccountBalanceStrategy {
  /**
   * Calcula el cupo utilizado (deuda pendiente)
   *
   * REGLA DE NEGOCIO:
   * Cupo Usado = Gastos efectivos - Pagos recibidos (ingresos + transferencias)
   *
   * Para compras en cuotas, solo se cuenta el monto de las cuotas vencidas
   * hasta el mes actual (no el monto total de la compra).
   * Para compras de contado, se cuenta el monto completo.
   */
  private calculateUsedCredit(account: Account, transactions: Transaction[]): number {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // 1. Gastos en esta tarjeta — ajustados por cuotas
    const totalExpenses = transactions
      .filter(t =>
        t.accountId === account.id &&
        t.type === 'expense'
      )
      .reduce((sum, t) => {
        // Compra en cuotas: solo contar cuotas vencidas hasta hoy
        // Primera cuota se cobra el mes siguiente a la compra
        if (t.installments && t.installments > 1) {
          const txDate = new Date(t.date);
          const monthsSince = (currentYear - txDate.getFullYear()) * 12 + (currentMonth - txDate.getMonth());
          // monthsSince=0 → mismo mes de compra → 0 cuotas cobradas
          // monthsSince=1 → mes siguiente → 1 cuota cobrada
          const installmentsDue = Math.min(Math.max(0, monthsSince), t.installments);
          const perInstallment = t.monthlyInstallmentAmount ?? (t.amount / t.installments);
          return sum + (installmentsDue * perInstallment);
        }
        return sum + t.amount;
      }, 0);

    // 2. Ingresos directos a esta TC (pagos mediante "Ingreso")
    const directPayments = transactions
      .filter(t =>
        t.accountId === account.id &&
        t.type === 'income'
      )
      .reduce((sum, t) => sum + t.amount, 0);

    // 3. Transferencias HACIA esta TC (pagos desde otra cuenta)
    const transferPayments = transactions
      .filter(t =>
        t.toAccountId === account.id &&
        t.type === 'transfer'
      )
      .reduce((sum, t) => sum + t.amount, 0);

    // 4. Cupo utilizado = gastos efectivos - pagos totales
    const usedCredit = totalExpenses - directPayments - transferPayments;

    return Math.max(0, usedCredit);
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
    // REGLA 1: Validar GASTOS - verificar cupo disponible
    if (transactionType === 'expense') {
      const availableCredit = this.calculateBalance(account, transactions);

      if (amount > availableCredit) {
        return {
          valid: false,
          error: `Cupo insuficiente. Disponible: $${availableCredit.toLocaleString('es-CO')}`
        };
      }
    }

    // REGLA 2: Validar INGRESOS (Pagos a TC) - no se puede pagar más de lo que se debe
    if (transactionType === 'income') {
      const usedCredit = this.calculateUsedCredit(account, transactions);

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
