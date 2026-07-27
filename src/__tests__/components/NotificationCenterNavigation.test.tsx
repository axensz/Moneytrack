import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { useViewRouting } from '../../hooks/useViewRouting';

const mocks = vi.hoisted(() => ({
  markAsRead: vi.fn(async () => undefined),
  markAllAsRead: vi.fn(async () => undefined),
  deleteNotification: vi.fn(async () => undefined),
  clearAll: vi.fn(async () => undefined),
  unreadCount: 1,
  notification: {
    id: 'notification-1',
    type: 'budget',
    title: 'Presupuesto cerca del limite',
    message: 'Revisa tu presupuesto de comida',
    severity: 'warning',
    isRead: false,
    createdAt: new Date('2026-07-26T12:00:00'),
    actionUrl: '/?view=budgets',
  },
}));

vi.mock('../../contexts/NotificationContext', () => ({
  useNotificationContext: () => ({
    notifications: [mocks.notification],
    unreadCount: mocks.unreadCount,
    markAsRead: mocks.markAsRead,
    markAllAsRead: mocks.markAllAsRead,
    deleteNotification: mocks.deleteNotification,
    clearAll: mocks.clearAll,
  }),
}));

describe('NotificationCenter - navegacion de acciones', () => {
  beforeEach(() => {
    mocks.markAsRead.mockClear();
    mocks.markAllAsRead.mockClear();
    mocks.unreadCount = 1;
    mocks.notification.isRead = false;
    window.history.replaceState({}, '', '/');
  });

  it('marca como leida y navega a la vista indicada una sola vez', async () => {
    const onClose = vi.fn();
    const onViewChange = vi.fn();
    function NotificationRoutingHarness() {
      useViewRouting({ onViewChange });
      return <NotificationCenter isOpen onClose={onClose} />;
    }
    render(<NotificationRoutingHarness />);

    fireEvent.click(screen.getByText('Presupuesto cerca del limite'));

    await waitFor(() => {
      expect(mocks.markAsRead).toHaveBeenCalledWith('notification-1');
      expect(new URLSearchParams(window.location.search).get('view')).toBe('budgets');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onViewChange).toHaveBeenCalledTimes(1);
      expect(onViewChange).toHaveBeenLastCalledWith('budgets');
    });
  });

  it('permite marcar todas aunque la ventana visible ya este leida', async () => {
    mocks.unreadCount = 0;
    mocks.notification.isRead = true;
    render(<NotificationCenter isOpen onClose={vi.fn()} />);

    const markAllButton = screen.getByRole('button', { name: /marcar leídas/i });
    expect(markAllButton).toBeEnabled();
    fireEvent.click(markAllButton);

    await waitFor(() => {
      expect(mocks.markAllAsRead).toHaveBeenCalledTimes(1);
    });
  });
});
