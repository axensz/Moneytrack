import { describe, expect, it } from 'vitest';
import { buildFinancialContext, parseActionFromFunctionCall, parseActionFromInteractionPayload } from '../../lib/gemini';
import type { Account, Categories, Transaction } from '../../types/finance';

const account: Account = {
  id: 'acc-1',
  name: 'Bancolombia',
  type: 'savings',
  isDefault: true,
  initialBalance: 1_000_000,
};

const categories: Categories = {
  expense: ['Alimentacion', 'Transporte', 'Otros'],
  income: ['Salario'],
};

const transaction: Transaction = {
  id: 'tx-1',
  type: 'expense',
  amount: 35_000,
  category: 'Otros',
  description: 'Almuerzo cerca a la oficina',
  date: new Date(),
  paid: true,
  accountId: account.id!,
};

describe('Gemini chat actions', () => {
  it('parses a structured add_transaction function call', () => {
    const action = parseActionFromFunctionCall({
      name: 'add_transaction',
      args: {
        txType: 'expense',
        amount: 35000,
        category: 'Alimentacion',
        description: 'Almuerzo',
        accountId: 'acc-1',
        accountName: 'Bancolombia',
        paid: true,
      },
    });

    expect(action).toEqual({
      type: 'add_transaction',
      data: {
        txType: 'expense',
        amount: 35000,
        category: 'Alimentacion',
        description: 'Almuerzo',
        accountId: 'acc-1',
        accountName: 'Bancolombia',
        paid: true,
      },
    });
  });

  it('rejects malformed function call arguments', () => {
    expect(parseActionFromFunctionCall({
      name: 'add_transaction',
      args: {
        txType: 'expense',
        amount: '35000',
        category: 'Alimentacion',
        description: 'Almuerzo',
        accountId: 'acc-1',
        accountName: 'Bancolombia',
        paid: true,
      },
    })).toBeUndefined();
  });

  it('parses Interactions API function_call steps', () => {
    const action = parseActionFromInteractionPayload({
      steps: [
        {
          type: 'function_call',
          name: 'add_category',
          arguments: {
            categoryType: 'expense',
            name: 'Mascotas',
          },
          id: 'call-1',
        },
      ],
    });

    expect(action).toEqual({
      type: 'add_category',
      data: {
        categoryType: 'expense',
        name: 'Mascotas',
      },
    });
  });

  it('parses add_transfer, upsert_budget, and add_recurring_payment function calls', () => {
    const transferAction = parseActionFromFunctionCall({
      name: 'add_transfer',
      args: {
        fromAccountId: 'acc-1',
        fromAccountName: 'Bancolombia',
        toAccountId: 'acc-2',
        toAccountName: 'Nequi',
        amount: 120000,
        description: 'Paso a Nequi',
      },
    });
    expect(transferAction).toEqual({
      type: 'add_transfer',
      data: {
        fromAccountId: 'acc-1',
        fromAccountName: 'Bancolombia',
        toAccountId: 'acc-2',
        toAccountName: 'Nequi',
        amount: 120000,
        description: 'Paso a Nequi',
      },
    });

    const budgetAction = parseActionFromFunctionCall({
      name: 'upsert_budget',
      args: {
        category: 'Alimentacion',
        amount: 600000,
      },
    });
    expect(budgetAction).toEqual({
      type: 'upsert_budget',
      data: {
        category: 'Alimentacion',
        amount: 600000,
      },
    });

    const recurringAction = parseActionFromFunctionCall({
      name: 'add_recurring_payment',
      args: {
        name: 'Netflix',
        amount: 45000,
        category: 'Suscripciones',
        dueDay: 15,
        frequency: 'monthly',
        accountId: 'acc-1',
        accountName: 'Bancolombia',
      },
    });
    expect(recurringAction).toEqual({
      type: 'add_recurring_payment',
      data: {
        name: 'Netflix',
        amount: 45000,
        category: 'Suscripciones',
        dueDay: 15,
        frequency: 'monthly',
        accountId: 'acc-1',
        accountName: 'Bancolombia',
      },
    });
  });
});

describe('buildFinancialContext privacy mode and 360° domains', () => {
  it('omits recent transaction descriptions when includeRecentTransactions is false', () => {
    const context = buildFinancialContext([transaction], [account], categories, {
      includeRecentTransactions: false,
    });

    expect(context).not.toContain('Almuerzo cerca a la oficina');
    expect(context).toContain('Omitidas para minimizar datos');
  });

  it('keeps recent transaction details by default for backwards compatibility', () => {
    const context = buildFinancialContext([transaction], [account], categories);

    expect(context).toContain('Almuerzo cerca a la oficina');
    expect(context).toContain('[ID:tx-1]');
  });

  it('includes budgets, recurring payments, debts, and savings goals in 360° context', () => {
    const context = buildFinancialContext([transaction], [account], categories, {
      budgets: [
        { id: 'b-1', category: 'Otros', monthlyLimit: 40_000, isActive: true, createdAt: new Date() },
      ],
      recurringPayments: [
        {
          id: 'r-1',
          name: 'Spotify',
          amount: 24_900,
          category: 'Suscripciones',
          dueDay: 10,
          frequency: 'monthly',
          isActive: true,
          createdAt: new Date(),
        },
      ],
      debts: [
        {
          id: 'd-1',
          type: 'lent',
          personName: 'Carlos',
          originalAmount: 200_000,
          remainingAmount: 150_000,
          description: 'Viaje',
          isSettled: false,
          createdAt: new Date(),
        },
      ],
      savingsGoals: [
        {
          id: 'g-1',
          name: 'Fondo Emergencia',
          targetAmount: 5_000_000,
          currentAmount: 2_500_000,
          isCompleted: false,
          createdAt: new Date(),
        },
      ],
    });

    expect(context).toContain('PRESUPUESTOS ACTIVOS ESTE MES');
    expect(context).toContain('CERCA DEL LÍMITE');
    expect(context).toContain('PAGOS PERIÓDICOS Y SUSCRIPCIONES');
    expect(context).toContain('Spotify');
    expect(context).toContain('PRÉSTAMOS Y DEUDAS ACTIVAS');
    expect(context).toContain('Carlos');
    expect(context).toContain('METAS DE AHORRO ACTIVAS');
    expect(context).toContain('Fondo Emergencia');
  });
});
