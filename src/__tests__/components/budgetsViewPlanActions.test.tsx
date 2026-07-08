import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringPayment, Transaction } from '../../types/finance';
import { BudgetsView } from '../../components/views/budgets/BudgetsView';

const mocks = vi.hoisted(() => ({
  addBudget: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  saveConfig: vi.fn(),
  clearConfig: vi.fn(),
  transactions: [] as Transaction[],
  recurringPayments: [] as RecurringPayment[],
  hideBalances: false,
}));

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense',
  amount: 0,
  category: 'Otros',
  description: 'Test',
  date: new Date('2026-06-10'),
  paid: true,
  accountId: 'acc-1',
  ...overrides,
});

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useBudgetsDomain: () => ({
    budgets: [],
    addBudget: mocks.addBudget,
    updateBudget: mocks.updateBudget,
    deleteBudget: mocks.deleteBudget,
    budgetStatuses: [],
    budgetStats: { active: 0, exceeded: 0, warning: 0, totalBudgeted: 0, totalSpent: 0 },
  }),
  useCategoryDomain: () => ({
    categories: {
      expense: ['Alimentación', 'Entretenimiento', 'Educacion'],
      income: ['Salario'],
    },
  }),
  useTransactionDomain: () => ({ transactions: mocks.transactions, balanceTransactions: mocks.transactions }),
  useAccountDomain: () => ({
    accounts: [],
    getAccountBalance: () => 0,
    getCreditUsed: () => 0,
    balancesReady: true,
  }),
  useRecurringDomain: () => ({
    recurringPayments: mocks.recurringPayments,
  }),
}));

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: mocks.hideBalances }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock('../../hooks/usePlanConfig', () => ({
  usePlanConfig: () => ({
    config: { startMonth: '2026-06', declaredIncome: 1_000_000 },
    loading: false,
    saveConfig: mocks.saveConfig,
    clearConfig: mocks.clearConfig,
  }),
}));

vi.mock('../../lib/gemini', () => ({
  isGeminiConfigured: () => false,
}));

describe('BudgetsView — plan financiero accionable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00'));
    mocks.hideBalances = false;
    mocks.recurringPayments = [];
    mocks.transactions = [
      tx({ type: 'income', amount: 1_000_000, category: 'Salario' }),
      tx({ amount: 600_000, category: 'Alimentación' }),
      tx({ amount: 250_000, category: 'Entretenimiento' }),
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('muestra brechas accionables y recomendaciones visibles', () => {
    render(<BudgetsView />);

    expect(screen.getByText('Tu prioridad este mes')).toBeInTheDocument();
    expect(screen.getByText(/Faltan .*50\.000.* para llegar/)).toBeInTheDocument();
    expect(screen.getByText(/Te pasas por .*100\.000/)).toBeInTheDocument();
    expect(screen.getByText('Acciones recomendadas')).toBeInTheDocument();
    expect(screen.getAllByText('Usar sugerencia').length).toBeGreaterThan(0);
  });

  it('muestra presupuestos antes del plan financiero', () => {
    const { container } = render(<BudgetsView />);
    const content = container.textContent || '';

    expect(content.indexOf('Presupuestos')).toBeGreaterThanOrEqual(0);
    expect(content.indexOf('Plan financiero')).toBeGreaterThanOrEqual(0);
    expect(content.indexOf('Presupuestos')).toBeLessThan(content.indexOf('Plan financiero'));
  });

  it('permite colapsar presupuestos y reabrirlos desde nuevo', () => {
    render(<BudgetsView />);

    const budgetsToggle = screen.getByRole('button', { name: /presupuestos/i });
    expect(budgetsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('No hay presupuestos configurados')).toBeInTheDocument();

    fireEvent.click(budgetsToggle);

    expect(budgetsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('No hay presupuestos configurados')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /nuevo/i }));

    expect(budgetsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Nuevo presupuesto')).toBeInTheDocument();
  });

  it('permite colapsar el plan financiero', () => {
    render(<BudgetsView />);

    const planToggle = screen.getByRole('button', { name: /plan financiero/i });
    expect(planToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Distribución mensual')).toBeInTheDocument();

    fireEvent.click(planToggle);

    expect(planToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Distribución mensual')).not.toBeInTheDocument();
  });

  it('prellena el formulario al usar una sugerencia', () => {
    render(<BudgetsView />);

    fireEvent.click(screen.getAllByText('Usar sugerencia')[0]);

    expect(screen.getByText('Nuevo presupuesto')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alimentación')).toBeInTheDocument();
    expect(screen.getByDisplayValue('540.000')).toBeInTheDocument();
  });

  it('oculta montos de brechas y acciones cuando balances ocultos esta activo', () => {
    mocks.hideBalances = true;

    render(<BudgetsView />);

    expect(screen.getByText(/Te pasas por .*••••••/)).toBeInTheDocument();
    expect(screen.getByText(/Faltan .*••••••.* para llegar/)).toBeInTheDocument();
    expect(screen.queryByText(/100\.000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/50\.000/)).not.toBeInTheDocument();
  });

  it('muestra pagos periodicos pendientes y cierre estimado del mes', () => {
    mocks.recurringPayments = [{
      id: 'rp-internet',
      name: 'Internet hogar',
      amount: 120_000,
      category: 'Servicios',
      accountId: 'acc-1',
      dueDay: 20,
      frequency: 'monthly',
      isActive: true,
      createdAt: new Date('2026-01-01'),
    }];

    render(<BudgetsView />);

    expect(screen.getByText('Gastos programados del mes')).toBeInTheDocument();
    expect(screen.getByText('Internet hogar')).toBeInTheDocument();
    expect(screen.getByText('Por venir')).toBeInTheDocument();
    expect(screen.getByText('Cierre estimado')).toBeInTheDocument();
    expect(screen.getAllByText(/120\.000/).length).toBeGreaterThan(0);
  });
});
