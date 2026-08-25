import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkPaidModal } from '../../components/views/recurring/components/MarkPaidModal';
import type { Account, RecurringPayment } from '../../types/finance';

const payment: RecurringPayment = {
  id: 'rent', name: 'Arriendo', amount: 1_200_000, category: 'Vivienda',
  dueDay: 5, frequency: 'monthly', isActive: true,
};
const account: Account = {
  id: 'cash', name: 'Efectivo', type: 'cash', isDefault: true, initialBalance: 2_000_000,
};

describe('MarkPaidModal submit guard', () => {
  it('dispatches one recurring post for two clicks in the same render', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const onRegister = vi.fn(async () => pending);

    render(
      <MarkPaidModal
        isOpen
        payment={payment}
        accounts={[account]}
        transactions={[]}
        defaultAccountId="cash"
        formatCurrency={(amount) => `$${amount}`}
        onClose={vi.fn()}
        onRegister={onRegister}
        onLinkExisting={vi.fn(async () => undefined)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /registrar pago ahora/i }));
    const submit = screen.getByRole('button', { name: /registrar \$1200000/i });

    await act(async () => {
      submit.click();
      submit.click();
      release();
      await pending;
    });

    expect(onRegister).toHaveBeenCalledTimes(1);
  });
});
