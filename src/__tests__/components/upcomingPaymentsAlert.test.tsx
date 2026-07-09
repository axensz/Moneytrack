import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UpcomingPaymentsAlert } from '../../components/views/recurring/components/UpcomingPaymentsAlert';
import type { RecurringPayment } from '../../types/finance';

const payment: RecurringPayment = {
  id: 'rp-1',
  name: 'Netflix',
  amount: 45000,
  category: 'Entretenimiento',
  dueDay: 1,
  frequency: 'monthly',
  isActive: true,
};

describe('UpcomingPaymentsAlert', () => {
  it('separa el nombre del estado en el texto renderizado', () => {
    const { container } = render(
      <UpcomingPaymentsAlert
        title="Pagos vencidos"
        payments={[payment]}
        getLabel={() => 'vence pronto'}
        formatCurrency={(amount) => `$ ${amount.toLocaleString('es-CO')}`}
        tone="destructive"
      />,
    );

    expect(container).toHaveTextContent('Netflix vence pronto');
    expect(container).not.toHaveTextContent('Netflixvence pronto');
  });
});
