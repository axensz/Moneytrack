import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { Header } from '../../components/layout/Header';

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
    onOpenLedgerReconciliation: vi.fn(),
    onGoToTransactions: vi.fn(),
    onLogout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    ...render(<Header {...props} />),
    props,
  };
}

describe('Header', () => {
  it('uses the MoneyTrack brand as the accessible return action to Transactions', () => {
    const onGoToTransactions = vi.fn();
    renderHeader({ onGoToTransactions });

    const brandHeading = screen.getByRole('heading', { name: 'MoneyTrack' });
    const brandAction = screen.getByRole('button', { name: 'Ir a Transacciones' });
    expect(brandHeading).toHaveAttribute('aria-label', 'MoneyTrack');
    expect(brandHeading).toContainElement(brandAction);
    expect(brandAction).toHaveTextContent('MoneyTrack');
    expect(brandAction).toHaveClass('min-h-11');

    fireEvent.click(brandAction);

    expect(onGoToTransactions).toHaveBeenCalledTimes(1);
  });

  it('keeps privacy and assistant actions outside the header and settings menu', () => {
    const { container } = renderHeader({ showSettingsMenu: true });

    expect(screen.queryByRole('button', { name: 'Ocultar valores' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar valores' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-header-action="assistant"]')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /asistente IA/i })).not.toBeInTheDocument();
  });

  it('keeps compact utility actions reachable and relocates logout through responsive affordances', () => {
    const { container } = renderHeader();

    for (const name of ['Cambiar tema', 'Abrir notificaciones', 'Abrir menú de ajustes']) {
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
      screen.getByRole('button', { name: 'Abrir notificaciones' }),
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

  it('keeps the guest authentication action available without reintroducing assistant controls', () => {
    const setIsAuthModalOpen = vi.fn();
    renderHeader({ user: null, showSettingsMenu: false, setIsAuthModalOpen });

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(setIsAuthModalOpen).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: /asistente IA/i })).not.toBeInTheDocument();
  });

  it('transfiere el retorno de foco al trigger estable antes de abrir Ayuda', () => {
    let activeElementWhenOpened: Element | null = null;
    const onOpenHelp = vi.fn(() => {
      activeElementWhenOpened = document.activeElement;
    });
    renderHeader({ showSettingsMenu: true, onOpenHelp });
    const settingsTrigger = screen.getByRole('button', { name: 'Abrir menú de ajustes' });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Ayuda' }));

    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    expect(activeElementWhenOpened).toBe(settingsTrigger);
    expect(settingsTrigger).toHaveFocus();
  });

  it('abre Integridad del libro desde ajustes conservando el retorno de foco', () => {
    let activeElementWhenOpened: Element | null = null;
    const onOpenLedgerReconciliation = vi.fn(() => {
      activeElementWhenOpened = document.activeElement;
    });
    renderHeader({ showSettingsMenu: true, onOpenLedgerReconciliation });
    const settingsTrigger = screen.getByRole('button', { name: 'Abrir menú de ajustes' });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Integridad del libro' }));

    expect(onOpenLedgerReconciliation).toHaveBeenCalledTimes(1);
    expect(activeElementWhenOpened).toBe(settingsTrigger);
    expect(settingsTrigger).toHaveFocus();
  });

  it('skips the responsive-hidden logout action during settings keyboard navigation', () => {
    renderHeader({ showSettingsMenu: true });
    const menu = screen.getByRole('menu', { name: 'Opciones de ajustes' });
    const notifications = screen.getByRole('menuitem', { name: 'Notificaciones' });
    const integrity = screen.getByRole('menuitem', { name: 'Integridad del libro' });
    const help = screen.getByRole('menuitem', { name: 'Ayuda' });
    const logout = screen.getByRole('menuitem', { name: 'Cerrar sesión' });
    logout.style.display = 'none';

    notifications.focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(integrity).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'End' });
    expect(help).toHaveFocus();
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

  it('uses pointer cursors for semantic actions and blocked cursors for disabled controls', () => {
    const utilitiesSource = readFileSync(
      resolve(process.cwd(), 'app/styles/utilities.css'),
      'utf8',
    );

    for (const selector of [
      'a[href]:not([aria-disabled="true"])',
      'button:not(:disabled)',
      '[role="button"]:not([aria-disabled="true"])',
      'summary',
    ]) {
      expect(utilitiesSource).toContain(selector);
    }
    expect(utilitiesSource).toContain('cursor: pointer;');
    expect(utilitiesSource).toContain('[aria-disabled="true"]');
    expect(utilitiesSource).toContain('cursor: not-allowed;');
  });
});
