import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// P-goals-isolated: la vista debe divulgar que las metas son seguimiento manual
// y NO mueven dinero (evita la percepción de doble-conteo). Test de presencia.

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useGoalsDomain: () => ({
    savingsGoals: [],
    addGoal: vi.fn(),
    deleteGoal: vi.fn(),
    addSavings: vi.fn(),
    goalStatuses: [],
    goalStats: { activeCount: 0, completedCount: 0, totalTarget: 0, totalSaved: 0, overallPercentage: 0 },
  }),
}));

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false, setHideBalances: vi.fn() }),
}));

import { GoalsView } from '../../components/views/goals/GoalsView';

describe('GoalsView — divulgación P-goals-isolated', () => {
  it('muestra que el ahorro registrado no mueve dinero de las cuentas', () => {
    render(<GoalsView />);
    expect(screen.getByText(/Seguimiento manual/i)).toBeInTheDocument();
    expect(screen.getByText(/no mueve dinero/i)).toBeInTheDocument();
  });
});
