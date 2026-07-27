import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../../components/layout/Header';
import { UIPreferencesProvider, useUIPreferences } from '../../contexts/UIPreferencesContext';

vi.mock('../../components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button" aria-label="Cambiar tema" />,
}));

function PreferenceValue() {
  const { hideBalances } = useUIPreferences();
  return <output>{String(hideBalances)}</output>;
}

describe('Header', () => {
  beforeEach(() => localStorage.removeItem('moneytrack_hide_values'));

  it('toggles the shared privacy preference independently of the Transactions view', () => {
    render(
      <UIPreferencesProvider>
        <Header
          user={null}
          setIsAuthModalOpen={vi.fn()}
          showSettingsMenu={false}
          setShowSettingsMenu={vi.fn()}
          showNotifications={false}
          setShowNotifications={vi.fn()}
          onOpenHelp={vi.fn()}
          onOpenCategories={vi.fn()}
          onOpenNotificationPreferences={vi.fn()}
          onOpenAISettings={vi.fn()}
          onLogout={vi.fn()}
        />
        <PreferenceValue />
      </UIPreferencesProvider>,
    );

    const toggle = screen.getByRole('button', { name: 'Ocultar valores' });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveClass('min-w-[44px]', 'min-h-[44px]');
    expect(screen.getByRole('status')).toHaveTextContent('false');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Mostrar valores' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('true');
  });
});
