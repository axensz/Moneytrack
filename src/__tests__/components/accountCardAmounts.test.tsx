import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AccountCard } from '../../components/views/accounts/components/AccountCard';
import type { Account } from '../../types/finance';

let mockHideBalances = false;
vi.mock('@/contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: mockHideBalances }),
}));

afterEach(() => {
  mockHideBalances = false;
});

const mockFormatCurrency = (amount: number) => `$ ${amount.toLocaleString('es-CO')}`;
const noop = () => {};

function renderAccountCard(props: Partial<React.ComponentProps<typeof AccountCard>> = {}) {
  const defaultAccount: Account = {
    id: 'test-acc',
    name: 'Cuenta Principal',
    type: 'savings',
    isDefault: false,
    initialBalance: 1_000_000,
  };

  return render(
    <AccountCard
      account={defaultAccount}
      balance={1_000_000}
      creditUsed={0}
      nextCutoff={null}
      nextPayment={null}
      isDragging={false}
      isDragOver={false}
      formatCurrency={mockFormatCurrency}
      onEdit={noop}
      onSetDefault={noop}
      onDelete={noop}
      onDragStart={noop}
      onDragOver={noop}
      onDragLeave={noop}
      onDrop={noop}
      onDragEnd={noop}
      onTouchStart={noop}
      onTouchMove={noop}
      onTouchEnd={noop}
      {...props}
    />
  );
}

describe('AccountCard presentación de montos (The Confident Ledger)', () => {
  it('cuenta de ahorros positiva usa font-mono y text-success', () => {
    const { container } = renderAccountCard({ balance: 2_500_000 });

    const balanceEl = container.querySelector('.font-mono.text-success');
    expect(balanceEl).toBeInTheDocument();
    expect(balanceEl).toHaveTextContent('$ 2.500.000');
  });

  it('cuenta de ahorros en cero usa font-mono y text-foreground (no verde de éxito)', () => {
    const { container } = renderAccountCard({ balance: 0 });

    const balanceEl = container.querySelector('.font-mono.text-foreground');
    expect(balanceEl).toBeInTheDocument();
    expect(balanceEl).toHaveTextContent('$ 0');
    expect(container.querySelector('.font-mono.text-success')).not.toBeInTheDocument();
  });

  it('cuenta de ahorros negativa (sobregiro) usa font-mono y text-destructive', () => {
    const { container } = renderAccountCard({ balance: -50_000 });

    const balanceEl = container.querySelector('.font-mono.text-destructive');
    expect(balanceEl).toBeInTheDocument();
    expect(balanceEl).toHaveTextContent('$ -50.000');
  });

  it('tarjeta de crédito con cupo agotado ($0 disponible) usa text-warning, no text-success', () => {
    const creditCard: Account = {
      id: 'cc-1',
      name: 'Mastercard',
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      creditLimit: 3_000_000,
      usedCredit: 3_000_000,
    };

    const { container } = renderAccountCard({
      account: creditCard,
      balance: 0,
      creditUsed: 3_000_000,
    });

    const balanceEl = container.querySelector('.font-mono.text-warning');
    expect(balanceEl).toBeInTheDocument();
    expect(balanceEl).toHaveTextContent('$ 0');
    expect(container.querySelector('.font-mono.text-success')).not.toBeInTheDocument();

    const progressBar = container.querySelector('.bg-warning');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle({ width: '100%' });
  });

  it('tarjeta de crédito en sobrecupo usa text-destructive y barra destructive', () => {
    const creditCard: Account = {
      id: 'cc-over',
      name: 'Visa Oro',
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      creditLimit: 2_000_000,
      usedCredit: 2_200_000,
    };

    const { container } = renderAccountCard({
      account: creditCard,
      balance: 0,
      creditUsed: 2_200_000,
    });

    const balanceEl = container.querySelector('.font-mono.text-destructive');
    expect(balanceEl).toBeInTheDocument();

    const progressBar = container.querySelector('.bg-destructive');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle({ width: '100%' });
  });

  it('en modo hideBalances enmascara textos y oculta la barra de porcentaje (width: 0%)', () => {
    mockHideBalances = true;

    const creditCard: Account = {
      id: 'cc-priv',
      name: 'Visa Platinum',
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      creditLimit: 10_000_000,
      usedCredit: 6_000_000,
    };

    const { container } = renderAccountCard({
      account: creditCard,
      balance: 4_000_000,
      creditUsed: 6_000_000,
    });

    expect(screen.getByText('••••••')).toBeInTheDocument(); // Saldo principal
    expect(screen.getByText('•••••• / ••••••')).toBeInTheDocument(); // Cupo utilizado / Cupo límite
    expect(screen.queryByText('$ 4.000.000')).not.toBeInTheDocument();

    const progressBar = container.querySelector('[style="width: 0%;"]');
    expect(progressBar).toBeInTheDocument();
  });
});
