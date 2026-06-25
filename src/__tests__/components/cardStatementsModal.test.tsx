import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MonthGroup } from '../../hooks/useCardPaymentSchedule';
import { CardStatementsModal } from '../../components/views/accounts/components/CardStatementsModal';

let mockHideBalances = false;
vi.mock('@/contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: mockHideBalances }),
}));

afterEach(() => { mockHideBalances = false; });

const cardRow = {
  cardId: 'tc', cardName: 'Visa', statementTotal: 100_000, paidAmount: 0, remaining: 100_000, status: 'pending' as const,
  installmentItems: [{ description: 'TV', cuota: 2, total: 12, amount: 100_000 }],
  recurringItems: [],
  cycleStart: new Date(2026, 5, 16), cycleEnd: new Date(2026, 6, 15), paymentDueDate: new Date(2026, 7, 5),
};
const monthGroup = (over: Partial<MonthGroup> = {}): MonthGroup => ({
  monthKey: '2026-07', label: 'julio de 2026', total: 100_000, remaining: 100_000, isCurrent: true, isFuture: false,
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

  it('pago parcial muestra el saldo restante (lo que debes), no el total', () => {
    const partial = monthGroup({
      monthKey: '2026-08', label: 'agosto de 2026', isCurrent: false, isFuture: false,
      remaining: 1_201_136.09,
      cards: [{
        ...cardRow,
        statementTotal: 2_729_586.9, paidAmount: 1_528_450.81, remaining: 1_201_136.09,
        status: 'partial', installmentItems: [], recurringItems: [],
      }],
    });
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={[partial]} formatCurrency={fmt} />);
    // El header muestra el saldo restante (no el total facturado).
    expect(screen.getAllByText(/\$1\.201\.136,09/).length).toBeGreaterThan(0);
    expect(screen.queryByText('$2.729.586,9')).toBeNull(); // el total no se muestra como cifra principal
    // Al expandir, aparece el contexto "Pagaste X de Y".
    fireEvent.click(screen.getByRole('button', { name: /agosto de 2026/i }));
    expect(screen.getByText(/Pagaste \$1\.528\.450,81 de \$2\.729\.586,9/)).toBeTruthy();
    expect(screen.getAllByText(/\$1\.201\.136,09/).length).toBeGreaterThan(1); // header + fila
  });

  it('estado vacío cuando no hay meses con deuda', () => {
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={[]} formatCurrency={fmt} />);
    expect(screen.getByText(/no tienes pagos de tarjeta/i)).toBeTruthy();
  });

  it('hideBalances: muestra •••••• en lugar de la moneda', () => {
    mockHideBalances = true;
    render(<CardStatementsModal isOpen onClose={() => {}} schedule={[monthGroup({ isCurrent: true })]} formatCurrency={fmt} />);
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$100\.000/)).toBeNull();
  });
});
