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
});

describe('buildFinancialContext privacy mode', () => {
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
});
