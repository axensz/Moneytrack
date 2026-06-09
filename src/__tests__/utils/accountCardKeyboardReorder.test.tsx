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

  it('deshabilita subir en el primer elemento y bajar en el último', () => {
    renderCard({ canMoveUp: false, canMoveDown: true });
    expect(screen.getByRole('button', { name: /hacia arriba/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /hacia abajo/i })).not.toBeDisabled();
  });

  it('no renderiza los botones sin callbacks (compatibilidad)', () => {
    renderCard({ onMoveUp: undefined, onMoveDown: undefined });
    expect(screen.queryByRole('button', { name: /hacia arriba/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hacia abajo/i })).not.toBeInTheDocument();
  });
});
