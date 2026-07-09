import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardStatementsModal } from '../../components/views/accounts/components/CardStatementsModal';

vi.mock('@/contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false }),
}));

const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`;

describe('CardStatementsModal - configuración incompleta', () => {
  it('no dice todo al día cuando hay tarjetas sin configuración de extracto', () => {
    render(
      <CardStatementsModal
        isOpen
        onClose={() => {}}
        schedule={[]}
        formatCurrency={fmt}
        cardsNeedingStatementConfig={[{ id: 'tc-old', name: 'Visa vieja', usedCredit: 900_000 }]}
      />,
    );

    expect(screen.getByText(/tarjetas sin/i)).toBeTruthy();
    expect(screen.getByText(/Visa vieja/)).toBeTruthy();
    expect(screen.getByText(/\$900\.000/)).toBeTruthy();
    expect(screen.queryByText(/no tienes pagos de tarjeta/i)).toBeNull();
  });
});
