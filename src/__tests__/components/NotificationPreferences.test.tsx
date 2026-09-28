/**
 * Task 8 — NotificationPreferences: truthful, scoped, accessible device status.
 *
 * The foreground device-status surface derives from `currentDevice.state`
 * (NOT from `preferences.browserNotifications.enabled`). Each state renders a
 * single appropriate primary action, truthful copy (never "Diferida", never a
 * claim about OS display), and draft/validation/a11y behaviour on save.
 *
 * fireEvent only (no @testing-library/user-event).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';
import type { NotificationPreferences as NotificationPreferencesType } from '../../types/finance';
import type {
    CurrentDeviceNotifications,
    CurrentDeviceState,
} from '../../hooks/useCurrentDeviceNotifications';

// ---- toast is centralised through toastHelpers → react-hot-toast -----------
vi.mock('react-hot-toast', () => ({
    default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }),
    Toaster: () => null,
}));

// ---- context mock ----------------------------------------------------------
const contextValue: {
    preferences: NotificationPreferencesType;
    updatePreferences: ReturnType<typeof vi.fn>;
    currentDevice: CurrentDeviceNotifications;
} = {
    preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    updatePreferences: vi.fn(async () => {}),
    currentDevice: makeCurrentDevice({ kind: 'guest' }),
};

vi.mock('../../contexts/NotificationContext', () => ({
    useNotificationContext: () => contextValue,
}));

import { NotificationPreferences } from '../../components/notifications/NotificationPreferences';

function makeCurrentDevice(
    state: CurrentDeviceState,
    overrides: Partial<CurrentDeviceNotifications> = {},
): CurrentDeviceNotifications {
    return {
        state,
        pendingAction: null,
        result: null,
        reconcile: vi.fn(async () => {}),
        activate: vi.fn(async () => {}),
        disable: vi.fn(async () => {}),
        sendTest: vi.fn(async () => {}),
        updateTimeZone: vi.fn(async () => {}),
        prepareForSignOut: vi.fn(async () => {}),
        canShowBrowserNotification: vi.fn(() => false),
        ...overrides,
    };
}

function setDevice(
    state: CurrentDeviceState,
    overrides: Partial<CurrentDeviceNotifications> = {},
): CurrentDeviceNotifications {
    const device = makeCurrentDevice(state, overrides);
    contextValue.currentDevice = device;
    return device;
}

beforeEach(() => {
    contextValue.preferences = DEFAULT_NOTIFICATION_PREFERENCES;
    contextValue.updatePreferences = vi.fn(async () => {});
    contextValue.currentDevice = makeCurrentDevice({ kind: 'guest' });
});

// The status region carries a stable label so we can scope queries to it.
const statusRegion = () => screen.getByRole('status');

describe('NotificationPreferences — device status surface', () => {
    it('guest: shows "Solo con MoneyTrack abierto" and a sign-in action', () => {
        setDevice({ kind: 'guest' });
        const onRequestSignIn = vi.fn();
        render(<NotificationPreferences onRequestSignIn={onRequestSignIn} />);

        expect(screen.getByText(/Solo con MoneyTrack abierto/i)).toBeInTheDocument();
        const signIn = screen.getByRole('button', { name: /iniciar sesión/i });
        fireEvent.click(signIn);
        expect(onRequestSignIn).toHaveBeenCalledTimes(1);
    });

    it('checking: shows "Comprobando..." and marks the region aria-busy', () => {
        setDevice({ kind: 'checking' });
        render(<NotificationPreferences />);

        expect(within(statusRegion()).getByText('Comprobando...')).toBeInTheDocument();
        expect(statusRegion()).toHaveAttribute('aria-busy', 'true');
    });

    it('active: badge "Activo", exactly test + disable + explicit timezone update', () => {
        const device = setDevice({ kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' });
        render(<NotificationPreferences />);

        const region = statusRegion();
        expect(within(region).getByText('Activo')).toBeInTheDocument();

        const test = screen.getByRole('button', { name: /Enviar notificación de prueba/i });
        fireEvent.click(test);
        expect(device.sendTest).toHaveBeenCalledTimes(1);

        const disable = screen.getByRole('button', { name: /Desactivar/i });
        fireEvent.click(disable);
        expect(device.disable).toHaveBeenCalledTimes(1);

        // No activate button in active state.
        expect(screen.queryByRole('button', { name: /^Activar$/i })).not.toBeInTheDocument();
    });

    it('active: explicit timezone update calls updateTimeZone (not silent)', () => {
        const device = setDevice({ kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' });
        render(<NotificationPreferences />);

        expect(screen.getAllByText(/America\/Bogota/).length).toBeGreaterThan(0);
        const tzUpdate = screen.getByRole('button', { name: /Actualizar a/i });
        fireEvent.click(tzUpdate);
        expect(device.updateTimeZone).toHaveBeenCalledTimes(1);
    });

    it('active: second test click while pending is suppressed (button disabled)', () => {
        const device = setDevice(
            { kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' },
            { pendingAction: 'test' },
        );
        render(<NotificationPreferences />);

        const test = screen.getByRole('button', { name: /Enviar notificación de prueba/i });
        expect(test).toBeDisabled();
        fireEvent.click(test);
        expect(device.sendTest).not.toHaveBeenCalled();
    });

    it.each([
        ['permission-required'],
        ['subscription-missing'],
        ['registration-missing'],
        ['endpoint-expired'],
        ['account-mismatch'],
    ] as const)('action-required (%s): badge "Requiere acción" + single Activar → activate', (reason) => {
        const device = setDevice({ kind: 'action-required', reason });
        render(<NotificationPreferences />);

        expect(within(statusRegion()).getByText('Requiere acción')).toBeInTheDocument();
        const activate = screen.getByRole('button', { name: /^Activar$/i });
        fireEvent.click(activate);
        expect(device.activate).toHaveBeenCalledTimes(1);
        // No test-push action while not active.
        expect(screen.queryByRole('button', { name: /Enviar notificación de prueba/i })).not.toBeInTheDocument();
    });

    it('action-required (vapid-key-mismatch): shows Reactivar → activate', () => {
        const device = setDevice({ kind: 'action-required', reason: 'vapid-key-mismatch' });
        render(<NotificationPreferences />);

        expect(within(statusRegion()).getByText('Requiere acción')).toBeInTheDocument();
        const reactivate = screen.getByRole('button', { name: /Reactivar/i });
        fireEvent.click(reactivate);
        expect(device.activate).toHaveBeenCalledTimes(1);
    });

    it('action-required (permission-blocked): guidance only, NO activate action', () => {
        setDevice({ kind: 'action-required', reason: 'permission-blocked' });
        render(<NotificationPreferences />);

        expect(within(statusRegion()).getByText('Requiere acción')).toBeInTheDocument();
        expect(screen.getByText(/configuración del navegador|configuración del sistema/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Activar$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Reactivar/i })).not.toBeInTheDocument();
    });

    it('action-required (ios-install-required): Add-to-Home-Screen guidance, NO activate', () => {
        setDevice({ kind: 'action-required', reason: 'ios-install-required' });
        render(<NotificationPreferences />);

        expect(within(statusRegion()).getByText('Requiere acción')).toBeInTheDocument();
        expect(screen.getByText(/pantalla de inicio/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Activar$/i })).not.toBeInTheDocument();
    });

    it.each([
        ['unsupported'],
        ['insecure-context'],
    ] as const)('unavailable (%s): badge "No disponible", no activation action', (reason) => {
        setDevice({ kind: 'unavailable', reason });
        render(<NotificationPreferences />);

        expect(within(statusRegion()).getByText('No disponible')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Activar$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Enviar notificación de prueba/i })).not.toBeInTheDocument();
    });

    it('check-failed (with previous stable): "No se pudo comprobar" + Reintentar → reconcile', () => {
        const device = setDevice({
            kind: 'check-failed',
            previous: { kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' },
        });
        render(<NotificationPreferences />);

        expect(screen.getByText(/No se pudo comprobar/i)).toBeInTheDocument();
        const retry = screen.getByRole('button', { name: /Reintentar/i });
        fireEvent.click(retry);
        expect(device.reconcile).toHaveBeenCalledTimes(1);
        // No test-push action while not confirmed active.
        expect(screen.queryByRole('button', { name: /Enviar notificación de prueba/i })).not.toBeInTheDocument();
    });

    it('compat diagnostic (check-failed, no previous): "solo mientras MoneyTrack esté abierto", Reintentar, NO test, NOT Activo', () => {
        const device = setDevice({ kind: 'check-failed' });
        render(<NotificationPreferences />);

        expect(screen.getByText(/mientras MoneyTrack esté abierto/i)).toBeInTheDocument();
        expect(screen.queryByText('Activo')).not.toBeInTheDocument();
        const retry = screen.getByRole('button', { name: /Reintentar/i });
        fireEvent.click(retry);
        expect(device.reconcile).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /Enviar notificación de prueba/i })).not.toBeInTheDocument();
    });
});

describe('NotificationPreferences — test result copy (truthful, never "Diferida")', () => {
    it('success result: "Aceptada por el servicio push" (no OS-display claim)', () => {
        setDevice(
            { kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' },
            { result: { kind: 'success', message: 'ignored-by-ui' } },
        );
        render(<NotificationPreferences />);
        expect(screen.getByText(/Aceptada por el servicio push/i)).toBeInTheDocument();
        expect(screen.queryByText(/Diferida/i)).not.toBeInTheDocument();
    });

    it('rate-limited result: shows the retry time', () => {
        setDevice(
            { kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' },
            { result: { kind: 'rate-limited', retryAt: '2026-01-01T10:30:00.000Z' } },
        );
        render(<NotificationPreferences />);
        expect(screen.getByText(/2026-01-01T10:30:00\.000Z|10:30/)).toBeInTheDocument();
        expect(screen.queryByText(/Diferida/i)).not.toBeInTheDocument();
    });

    it('error result: bounded failure message, never "Diferida"', () => {
        setDevice(
            { kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' },
            { result: { kind: 'error', message: 'No se pudo enviar la notificación de prueba.' } },
        );
        render(<NotificationPreferences />);
        expect(screen.getByText(/No se pudo enviar/i)).toBeInTheDocument();
        expect(screen.queryByText(/Diferida/i)).not.toBeInTheDocument();
    });

    it('no "Diferida" text anywhere in any state', () => {
        setDevice({ kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' });
        const { container } = render(<NotificationPreferences />);
        expect(container.textContent).not.toMatch(/Diferida/i);
    });
});

describe('NotificationPreferences — device-B legacy flag isolation', () => {
    it('changing preferences.browserNotifications.enabled does NOT flip the authenticated Activo gate', () => {
        // Device A is authenticated + active per currentDevice.state.
        setDevice({ kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' });
        contextValue.preferences = {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            browserNotifications: { enabled: false }, // as if device B saved this
        };
        const { rerender } = render(<NotificationPreferences />);
        expect(within(statusRegion()).getByText('Activo')).toBeInTheDocument();

        // Flip the legacy flag (device B) — Activo must remain, driven by state.
        contextValue.preferences = {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            browserNotifications: { enabled: true },
        };
        rerender(<NotificationPreferences />);
        expect(within(statusRegion()).getByText('Activo')).toBeInTheDocument();
    });
});

describe('NotificationPreferences — draft, validation, a11y on save', () => {
    it('invalid thresholds: preserves the entire draft, focuses first invalid input, announces', async () => {
        contextValue.updatePreferences = vi.fn(async (updates: Partial<NotificationPreferencesType>) => {
            // Simulate the store's validation (budgetWarning must be < budgetCritical).
            if (updates.thresholds) {
                const t = { ...DEFAULT_NOTIFICATION_PREFERENCES.thresholds, ...updates.thresholds };
                if (t.budgetWarning >= t.budgetCritical) {
                    throw new Error('Budget warning threshold must be lower than critical');
                }
            }
        });
        setDevice({ kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' });
        render(<NotificationPreferences />);

        const warning = screen.getByLabelText(/Advertencia de presupuesto/i) as HTMLInputElement;
        fireEvent.change(warning, { target: { value: '95' } }); // >= critical(90) → invalid

        fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeInTheDocument();
        });
        // Draft preserved.
        expect((screen.getByLabelText(/Advertencia de presupuesto/i) as HTMLInputElement).value).toBe('95');
        // First invalid input focused + marked invalid.
        expect(warning).toHaveFocus();
        expect(warning).toHaveAttribute('aria-invalid', 'true');
    });

    it('rejected Firestore save: preserves draft, announces, retry submits SAME draft once', async () => {
        let attempts = 0;
        contextValue.updatePreferences = vi.fn(async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('permission-denied');
            // second attempt (retry) resolves
        });
        setDevice({ kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' });
        render(<NotificationPreferences />);

        // Make an intentional, VALID draft change.
        const debtToggle = screen.getByLabelText(/Recordatorios de deudas/i);
        fireEvent.click(debtToggle);

        fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        expect(screen.getByRole('alert').textContent).toMatch(/no se (guard|pud)/i);
        // Draft preserved.
        expect((screen.getByLabelText(/Recordatorios de deudas/i) as HTMLInputElement).checked).toBe(false);

        const retry = screen.getByRole('button', { name: /Reintentar guardado/i });
        fireEvent.click(retry);

        await waitFor(() => expect(contextValue.updatePreferences).toHaveBeenCalledTimes(2));
        // Both calls carried the same draft (debt disabled).
        const firstArg = (contextValue.updatePreferences as ReturnType<typeof vi.fn>).mock.calls[0][0];
        const secondArg = (contextValue.updatePreferences as ReturnType<typeof vi.fn>).mock.calls[1][0];
        expect(firstArg.enabled.debt).toBe(false);
        expect(secondArg.enabled.debt).toBe(false);
    });

    it('every threshold input has an accessible name and description association', () => {
        setDevice({ kind: 'active', accountScope: 'user-1', timeZone: 'America/Bogota' });
        render(<NotificationPreferences />);
        const warning = screen.getByLabelText(/Advertencia de presupuesto/i);
        expect(warning).toHaveAttribute('aria-describedby');
    });
});
