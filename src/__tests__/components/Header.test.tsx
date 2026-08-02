import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { Header } from '../../components/layout/Header';
import { UIPreferencesProvider, useUIPreferences } from '../../contexts/UIPreferencesContext';

vi.mock('../../components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button" aria-label="Cambiar tema" className="header-icon" />,
}));

vi.mock('../../components/notifications/NotificationCenter', () => ({
  NotificationBell: () => (
    <button type="button" aria-label="Abrir notificaciones" className="header-icon" />
  ),
  NotificationCenter: () => null,
}));

const authenticatedUser = {
  uid: 'user-1',
  displayName: 'Camilo',
  email: 'camilo@example.com',
  photoURL: null,
} as User;

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
    user: authenticatedUser,
    setIsAuthModalOpen: vi.fn(),
    showSettingsMenu: true,
    setShowSettingsMenu: vi.fn(),
    showNotifications: false,
    setShowNotifications: vi.fn(),
    onOpenHelp: vi.fn(),
    onOpenCategories: vi.fn(),
    onOpenNotificationPreferences: vi.fn(),
    onOpenAISettings: vi.fn(),
    aiReady: false,
    onOpenAssistant: vi.fn(),
    onLogout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    ...render(<UIPreferencesProvider><Header {...props} /></UIPreferencesProvider>),
    props,
  };
}

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
          aiReady={false}
          onOpenAssistant={vi.fn()}
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

  it('keeps compact utility actions reachable and relocates logout through responsive affordances', () => {
    const { container } = renderHeader();

    for (const name of ['Cambiar tema', 'Ocultar valores', 'Abrir notificaciones', 'Abrir menú de ajustes']) {
      expect(screen.getByRole('button', { name })).toHaveClass('header-icon');
    }

    expect(container.querySelector('[data-header-action="logout"]'))
      .toHaveClass('hidden', 'sm:inline-flex');
    expect(container.querySelector('[data-settings-action="logout"]'))
      .toHaveTextContent('Cerrar sesión');
    expect(container.querySelector('[data-settings-action="logout"]'))
      .toHaveClass('sm:hidden');
    expect(container.querySelector('header'))
      .toHaveClass('min-w-0', 'max-w-full', 'overflow-x-clip');

    const orderedExistingActions = [
      screen.getByRole('button', { name: 'Cambiar tema' }),
      screen.getByRole('button', { name: 'Ocultar valores' }),
      screen.getByRole('button', { name: 'Abrir notificaciones' }),
      container.querySelector<HTMLElement>('[data-header-action="assistant"]')!,
      screen.getByRole('button', { name: 'Abrir menú de ajustes' }),
      container.querySelector<HTMLElement>('[data-header-action="logout"]')!,
    ];
    orderedExistingActions.slice(1).forEach((action, index) => {
      expect(
        orderedExistingActions[index].compareDocumentPosition(action)
        & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  it('routes the guest assistant entry to authentication', () => {
    const setIsAuthModalOpen = vi.fn();
    const { container } = renderHeader({ user: null, showSettingsMenu: false, setIsAuthModalOpen });
    const entry = container.querySelector<HTMLElement>('[data-header-action="assistant"]')!;

    expect(entry).toHaveAccessibleName('Inicia sesión para usar el asistente IA');
    fireEvent.click(entry);

    expect(setIsAuthModalOpen).toHaveBeenCalledWith(true);
  });

  it('routes the unconfigured authenticated assistant entry to AI settings', () => {
    const onOpenAISettings = vi.fn();
    const { container } = renderHeader({ aiReady: false, showSettingsMenu: false, onOpenAISettings });
    const entry = container.querySelector<HTMLElement>('[data-header-action="assistant"]')!;

    expect(entry).toHaveAccessibleName('Activar asistente IA');
    fireEvent.click(entry);

    expect(onOpenAISettings).toHaveBeenCalledTimes(1);
  });

  it('routes a configured assistant entry to the controlled panel trigger', () => {
    const onOpenAssistant = vi.fn();
    const { container } = renderHeader({ aiReady: true, showSettingsMenu: false, onOpenAssistant });
    const entry = container.querySelector<HTMLElement>('[data-header-action="assistant"]')!;

    expect(entry).toHaveAccessibleName('Abrir asistente IA');
    fireEvent.click(entry);

    expect(onOpenAssistant).toHaveBeenCalledWith(entry);
    expect(entry).toHaveClass('hidden', 'lg:inline-flex');
  });

  it('uses the labeled Settings action as the compact configured entry', () => {
    const onOpenAssistant = vi.fn();
    renderHeader({ aiReady: true, showSettingsMenu: true, onOpenAssistant });
    const settingsTrigger = screen.getByRole('button', { name: 'Abrir menú de ajustes' });

    const compactEntry = screen.getByRole('menuitem', { name: 'Abrir asistente IA' });

    expect(compactEntry).toHaveClass('lg:hidden');
    fireEvent.click(compactEntry);

    expect(onOpenAssistant).toHaveBeenCalledWith(settingsTrigger);
  });

  it('keeps the desktop button floor from overriding 44px header targets', () => {
    const utilitiesSource = readFileSync(
      resolve(process.cwd(), 'app/styles/utilities.css'),
      'utf8',
    );

    expect(utilitiesSource).toContain(
      'button:not(.btn-type):not(.header-icon)',
    );
  });
});
