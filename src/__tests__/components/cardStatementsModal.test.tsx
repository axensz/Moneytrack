import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MonthGroup } from '../../hooks/useCardPaymentSchedule';
import { CardStatementsModal } from '../../components/views/accounts/components/CardStatementsModal';

vi.mock('@/contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false }),
}));

const cardRow = {
  cardId: 'tc', cardName: 'Visa', statementTotal: 100_000, paidAmount: 0, status: 'pending' as const,
  installmentItems: [{ description: 'TV', cuota: 2, total: 12, amount: 100_000 }],
  recurringItems: [],
  cycleStart: new Date(2026, 5, 16), cycleEnd: new Date(2026, 6, 15), paymentDueDate: new Date(2026, 7, 5),
};
const monthGroup = (over: Partial<MonthGroup> = {}): MonthGroup => ({
  monthKey: '2026-07', label: 'julio de 2026', total: 100_000, isCurrent: true, isFuture: false,
  cards: [cardRow], ...over,
});

const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`;

describe('CardStatementsModal', () => {
  it('muestra el mes y el total', () => {
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={[monthGroup()]} formatCurrency={fmt} />);
    expect(screen.getByText(/julio de 2026/i)).toBeTruthy();
    expect(screen.getAllByText(/\$100\.000/).length).toBeGreaterThan(0);
  });

  it('el mes actual arranca expandido (desglose visible sin click)', () => {
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={[monthGroup({ isCurrent: true })]} formatCurrency={fmt} />);
    expect(screen.getByText('Visa')).toBeTruthy();
    expect(screen.getByText(/cuota 2\/12/i)).toBeTruthy();
  });

  it('un mes no actual arranca colapsado y se expande al hacer click', () => {
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={[monthGroup({ monthKey: '2026-09', label: 'septiembre de 2026', isCurrent: false, isFuture: true })]} formatCurrency={fmt} />);
    expect(screen.queryByText('Visa')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /septiembre de 2026/i }));
    expect(screen.getByText('Visa')).toBeTruthy();
    expect(screen.getByText(/cuota 2\/12/i)).toBeTruthy();
  });

  it('estado vacío cuando no hay meses con deuda', () => {
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={[]} formatCurrency={fmt} />);
    expect(screen.getByText(/no tienes pagos de tarjeta/i)).toBeTruthy();
  });
});
