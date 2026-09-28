/**
 * Task 7 — NotificationContext exposes the single current-device hook.
 *
 * The provider must mount EXACTLY ONE useCurrentDeviceNotifications instance and
 * spread its fields (including prepareForSignOut) into the context value so
 * consumers reach them through context.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

const useNotificationsMock = vi.fn();
const useCurrentDeviceMock = vi.fn();

vi.mock('../../hooks/useNotifications', () => ({
    useNotifications: (userId: string | null) => useNotificationsMock(userId),
}));
vi.mock('../../services/NotificationManager', () => ({
    setCurrentDeviceBrowserGate: vi.fn(),
}));
vi.mock('../../hooks/useCurrentDeviceNotifications', () => ({
    useCurrentDeviceNotifications: (userId: string | null) => useCurrentDeviceMock(userId),
}));

import { NotificationProvider, useNotificationContext } from '../../contexts/NotificationContext';

function baseNotifications() {
    return {
        notifications: [],
        unreadCount: 0,
        loading: false,
        preferences: {},
        markAsRead: vi.fn(),
        markAllAsRead: vi.fn(),
        deleteNotification: vi.fn(),
        clearAll: vi.fn(),
        updatePreferences: vi.fn(),
        createNotification: vi.fn(),
        getFilteredNotifications: vi.fn(() => []),
        notificationManager: { deps: {}, cancelDeferredPresentations: vi.fn() },
    };
}

function baseCurrentDevice() {
    return {
        state: { kind: 'checking' as const },
        pendingAction: null,
        result: null,
        reconcile: vi.fn(),
        activate: vi.fn(),
        disable: vi.fn(),
        sendTest: vi.fn(),
        updateTimeZone: vi.fn(),
        prepareForSignOut: vi.fn(async () => {}),
        canShowBrowserNotification: vi.fn(() => false),
    };
}

const holder: { captured: ReturnType<typeof useNotificationContext> | null } = { captured: null };
function Consumer() {
    const ctx = useNotificationContext();
    React.useEffect(() => {
        holder.captured = ctx;
    }, [ctx]);
    return <div data-testid="ok">{ctx.currentDevice.state.kind}</div>;
}

beforeEach(() => {
    holder.captured = null;
    useNotificationsMock.mockReset().mockReturnValue(baseNotifications());
    useCurrentDeviceMock.mockReset().mockReturnValue(baseCurrentDevice());
});

describe('NotificationProvider (Task 7)', () => {
    it('mounts exactly one current-device hook with the provider userId', () => {
        render(
            <NotificationProvider userId="user-9">
                <Consumer />
            </NotificationProvider>,
        );
        expect(useCurrentDeviceMock).toHaveBeenCalledTimes(1);
        expect(useCurrentDeviceMock).toHaveBeenCalledWith('user-9');
    });

    it('exposes current-device fields and prepareForSignOut through context', () => {
        render(
            <NotificationProvider userId="user-9">
                <Consumer />
            </NotificationProvider>,
        );
        expect(screen.getByTestId('ok').textContent).toBe('checking');
        expect(holder.captured).not.toBeNull();
        expect(holder.captured!.currentDevice).toBeDefined();
        expect(typeof holder.captured!.prepareForSignOut).toBe('function');
    });

    it('cancela las presentaciones OS diferidas al cambiar de cuenta y al desmontar', () => {
        const notif = baseNotifications();
        useNotificationsMock.mockReturnValue(notif);
        const cancel = notif.notificationManager.cancelDeferredPresentations as ReturnType<typeof vi.fn>;

        const { rerender, unmount } = render(
            <NotificationProvider userId="user-a">
                <Consumer />
            </NotificationProvider>,
        );
        expect(cancel).not.toHaveBeenCalled();

        // Cambio de cuenta A→B: el cleanup del efecto previo cancela los diferidos.
        rerender(
            <NotificationProvider userId="user-b">
                <Consumer />
            </NotificationProvider>,
        );
        expect(cancel).toHaveBeenCalledTimes(1);

        unmount();
        expect(cancel).toHaveBeenCalledTimes(2);
    });
});
