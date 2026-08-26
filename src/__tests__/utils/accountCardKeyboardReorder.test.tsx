import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// UI-dnd-keyboard (WCAG 2.1.1): alternativa de teclado al drag & drop.
// jsdom no soporta dnd nativo; aquí se cubre la ruta de teclado (botones).
vi.mock('@/contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false }),
}));

import { AccountCard } from '../../components/views/accounts/components/AccountCard';
import type { Account } from '../../types/finance';

const account: Account = {
  id: 'acc-1',
  name: 'Cuenta Ahorros',
  type: 'savings',
  isDefault: false,
  initialBalance: 0,
  order: 1,
} as Account;

const noop = () => {};

function renderCard(overrides: Partial<React.ComponentProps<typeof AccountCard>> = {}) {
  const onMoveUp = vi.fn();
  const onMoveDown = vi.fn();
  render(
    <AccountCard
      account={account}
      balance={1000}
      creditUsed={0}
      nextCutoff={null}
      nextPayment={null}
      isDragging={false}
      isDragOver={false}
      formatCurrency={(n) => `$${n}`}
      onEdit={noop}
      onSetDefault={noop}
      onDelete={noop}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      canMoveUp
      canMoveDown
      onDragStart={noop}
      onDragOver={noop}
      onDragLeave={noop}
      onDrop={noop}
      onDragEnd={noop}
      onTouchStart={noop}
      onTouchMove={noop}
      onTouchEnd={noop}
      {...overrides}
    />
  );
  return { onMoveUp, onMoveDown };
}

describe('AccountCard alternativa de teclado (WCAG 2.1.1)', () => {
  it('renderiza botones accesibles de subir/bajar con aria-label', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /mover .* hacia arriba/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mover .* hacia abajo/i })).toBeInTheDocument();
  });

  it('invoca onMoveUp/onMoveDown al activar los botones', () => {
    const { onMoveUp, onMoveDown } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /hacia arriba/i }));
    fireEvent.click(screen.getByRole('button', { name: /hacia abajo/i }));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
  });

  it('nombra de forma accesible la accion de eliminar', () => {
    const onDelete = vi.fn();
    renderCard({ onDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Cuenta Ahorros' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('ofrece la gestion de medios como un boton de icono que abre un dialogo', () => {
    const onManagePaymentInstruments = vi.fn();
    renderCard({ onManagePaymentInstruments });

    const trigger = screen.getByRole('button', {
      name: 'Gestionar medios de pago de Cuenta Ahorros',
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('title', 'Medios de pago');
    expect(trigger).toHaveClass('min-h-[44px]', 'min-w-[44px]');
    expect(trigger).not.toHaveTextContent(/medios/i);

    fireEvent.click(trigger);
    expect(onManagePaymentInstruments).toHaveBeenCalledTimes(1);
  });

  it('deshabilita subir en el primer elemento y bajar en el último', () => {
    renderCard({ canMoveUp: false, canMoveDown: true });
    expect(screen.getByRole('button', { name: /hacia arriba/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /hacia abajo/i })).not.toBeDisabled();
  });

  it('permite partir nombres largos dentro del card', () => {
    const longName = 'Cuenta larguisima de pruebas con nombre absurdamente largo 1234567890 ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    renderCard({ account: { ...account, name: longName } });

    expect(screen.getByRole('heading', { name: longName })).toHaveClass('break-words');
  });

  it('no renderiza los botones sin callbacks (compatibilidad)', () => {
    renderCard({ onMoveUp: undefined, onMoveDown: undefined });
    expect(screen.queryByRole('button', { name: /hacia arriba/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hacia abajo/i })).not.toBeInTheDocument();
  });
});

describe('AccountCard autoridad de tarjeta', () => {
  const card: Account = {
    ...account,
    id: 'card',
    name: 'Visa',
    type: 'credit',
    creditLimit: 5_000,
  };

  it('expone conciliación y bloquea acciones financieras cuando usedCredit falta', () => {
    renderCard({ account: card, balance: 5_000, creditUsed: 0, onMerge: vi.fn() });

    expect(screen.getByRole('status')).toHaveTextContent(/requiere conciliación/i);
    expect(screen.getByText(/por conciliar/i)).toBeInTheDocument();
    expect(screen.queryByText(/cupo utilizado/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unificar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /eliminar visa/i })).toBeDisabled();
  });

  it('muestra la autoridad normal y habilita acciones cuando usedCredit es válido', () => {
    renderCard({
      account: { ...card, usedCredit: 500 },
      balance: 4_500,
      creditUsed: 500,
      onMerge: vi.fn(),
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(/cupo utilizado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unificar/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /eliminar visa/i })).toBeEnabled();
  });
});
