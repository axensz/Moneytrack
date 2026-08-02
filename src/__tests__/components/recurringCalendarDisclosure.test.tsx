import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringPayment } from '../../types/finance';
import { RecurringCalendar } from '../../components/views/recurring/components/RecurringCalendar';

const payments: RecurringPayment[] = [
  { id: 'paid', name: 'Arriendo', amount: 100, category: 'Hogar', dueDay: 15, frequency: 'monthly', isActive: true },
  { id: 'overdue', name: 'Internet', amount: 200, category: 'Servicios', dueDay: 15, frequency: 'monthly', isActive: true },
  { id: 'soon', name: 'Seguro', amount: 300, category: 'Seguros', dueDay: 15, frequency: 'monthly', isActive: true },
  { id: 'normal', name: 'Gimnasio', amount: 400, category: 'Salud', dueDay: 15, frequency: 'monthly', isActive: true },
];

describe('divulgación de pagos periódicos por día', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 12));
  });

  afterEach(() => vi.useRealTimers());

  it('permite revisar cada pago que excede el preview de escritorio', () => {
    const { container } = render(
      <RecurringCalendar
        payments={payments}
        formatCurrency={(amount) => `$${amount}`}
        isPaidForMonth={(id) => id === 'paid'}
        getDaysOverdue={(payment) => payment.id === 'overdue' ? 2 : 0}
        getDaysUntilDue={(payment) => payment.id === 'soon' ? 2 : 10}
      />
    );

    expect(screen.getByText('Arriendo')).toBeInTheDocument();
    expect(screen.getByText('Internet')).toBeInTheDocument();

    const summary = screen.getByText('+2 más').closest('summary');
    expect(summary).not.toBeNull();
    expect(summary?.tabIndex).toBe(0);
    const details = summary?.closest('details');
    expect(details).not.toHaveAttribute('open');

    fireEvent.click(summary!);
    expect(details).toHaveAttribute('open');
    expect(within(details!).getByText('Seguro')).toBeInTheDocument();
    expect(within(details!).getByText('$300')).toBeInTheDocument();
    expect(within(details!).getByText('Próximo')).toBeInTheDocument();
    expect(within(details!).getByText('Gimnasio')).toBeInTheDocument();
    expect(within(details!).getByText('$400')).toBeInTheDocument();
    expect(within(details!).getByText('Programado')).toBeInTheDocument();

    const mobileDots = container.querySelectorAll('span[title]');
    expect(mobileDots).toHaveLength(4);
  });
});
