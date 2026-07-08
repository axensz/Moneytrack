import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// P-goals-isolated: la vista debe divulgar que las metas son seguimiento manual
// y NO mueven dinero (evita la percepcion de doble-conteo).

const mocks = vi.hoisted(() => ({
  addGoal: vi.fn(),
  deleteGoal: vi.fn(),
  addSavings: vi.fn(),
}));

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useGoalsDomain: () => ({
    savingsGoals: [],
    addGoal: mocks.addGoal,
    deleteGoal: mocks.deleteGoal,
    addSavings: mocks.addSavings,
    goalStatuses: [],
    goalStats: { activeCount: 0, completedCount: 0, totalTarget: 0, totalSaved: 0, overallPercentage: 0 },
  }),
}));

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false, setHideBalances: vi.fn() }),
}));

import { GoalsView } from '../../components/views/goals/GoalsView';

describe('GoalsView - divulgacion P-goals-isolated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra que el ahorro registrado no mueve dinero de las cuentas', () => {
    render(<GoalsView />);
    expect(screen.getByText(/Seguimiento manual/i)).toBeInTheDocument();
    expect(screen.getByText(/no mueve dinero/i)).toBeInTheDocument();
  });

  it('descarta el borrador al cancelar una meta nueva', () => {
    render(<GoalsView />);

    fireEvent.click(screen.getByRole('button', { name: /nueva meta/i }));
    fireEvent.change(screen.getByPlaceholderText(/Nombre de la meta/i), { target: { value: 'Viaje' } });
    fireEvent.change(screen.getByPlaceholderText(/Monto objetivo/i), { target: { value: '500000' } });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    fireEvent.click(screen.getByRole('button', { name: /nueva meta/i }));

    expect(screen.getByPlaceholderText(/Nombre de la meta/i)).toHaveValue('');
    expect(screen.getByPlaceholderText(/Monto objetivo/i)).toHaveValue('');
  });

  it('bloquea doble submit y guarda la fecha limite como fecha local', async () => {
    let release!: () => void;
    mocks.addGoal.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const { container } = render(<GoalsView />);

    fireEvent.click(screen.getByRole('button', { name: /nueva meta/i }));
    fireEvent.change(screen.getByPlaceholderText(/Nombre de la meta/i), { target: { value: 'Viaje' } });
    fireEvent.change(screen.getByPlaceholderText(/Monto objetivo/i), { target: { value: '500000' } });
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-12-31' } });

    const submit = screen.getByRole('button', { name: /crear meta/i });
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });

    expect(mocks.addGoal).toHaveBeenCalledTimes(1);
    const savedGoal = mocks.addGoal.mock.calls[0][0];
    expect(savedGoal.targetDate.getFullYear()).toBe(2026);
    expect(savedGoal.targetDate.getMonth()).toBe(11);
    expect(savedGoal.targetDate.getDate()).toBe(31);

    await act(async () => {
      release();
    });
  });
});
