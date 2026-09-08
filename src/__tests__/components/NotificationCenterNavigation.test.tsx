import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { useViewRouting } from '../../hooks/useViewRouting';
import type { Notification } from '../../types/finance';

const mocks = vi.hoisted(() => ({
  markAsRead: vi.fn(async () => undefined),
  markAllAsRead: vi.fn(async () => undefined),
  deleteNotification: vi.fn(async (_id: string): Promise<void> => undefined),
  clearAll: vi.fn(async () => undefined),
  unreadCount: 1,
  list: [] as Notification[],
  notification: {
    id: 'notification-1',
    type: 'budget',
    title: 'Presupuesto cerca del limite',
    message: 'Revisa tu presupuesto de comida',
    severity: 'warning',
    isRead: false,
    createdAt: new Date('2026-07-26T12:00:00'),
    actionUrl: '/?view=budgets',
  } as Notification,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../../contexts/NotificationContext', () => ({
  useNotificationContext: () => {
    const [, force] = React.useReducer((n: number) => n + 1, 0) as [number, () => void];
    // Lista con estado: eliminar quita la fila realmente (re-render con lista más
    // corta) para que el foco next→prev→Cerrar se ejerza sobre el DOM posterior.
    listForceRef.current = force;
    return {
      notifications: mocks.list.length ? mocks.list : [mocks.notification],
      unreadCount: mocks.unreadCount,
      markAsRead: mocks.markAsRead,
      markAllAsRead: mocks.markAllAsRead,
      deleteNotification: mocks.deleteNotification,
      clearAll: mocks.clearAll,
    };
  },
}));

const listForceRef: { current: (() => void) | null } = { current: null };
const removeFromList = (id: string) => {
  mocks.list = mocks.list.filter((n) => n.id !== id);
  listForceRef.current?.();
};

vi.mock('../../utils/toastHelpers', () => ({
  showToast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

const notif = (id: string, overrides: Partial<Notification> = {}): Notification => ({
  id,
  type: 'budget',
  title: `Título ${id}`,
  message: `Mensaje ${id}`,
  severity: 'warning',
  isRead: false,
  createdAt: new Date('2026-07-26T12:00:00'),
  actionUrl: `/?view=budgets`,
  ...overrides,
} as Notification);

describe('NotificationCenter - navegacion de acciones', () => {
  beforeEach(() => {
    mocks.markAsRead.mockReset();
    mocks.markAllAsRead.mockReset();
    mocks.deleteNotification.mockReset();
    mocks.clearAll.mockReset();
    mocks.markAsRead.mockResolvedValue(undefined);
    mocks.markAllAsRead.mockResolvedValue(undefined);
    mocks.deleteNotification.mockResolvedValue(undefined);
    mocks.clearAll.mockResolvedValue(undefined);
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.unreadCount = 1;
    mocks.list = [];
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

  it('abre un dialogo nombrado, enfoca Cerrar y restaura el trigger con Escape', async () => {
    function ControlledNotifications() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Notificaciones</button>
          <NotificationCenter isOpen={open} onClose={() => setOpen(false)} />
        </>
      );
    }

    render(<ControlledNotifications />);
    const trigger = screen.getByRole('button', { name: 'Notificaciones' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Notificaciones' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cerrar notificaciones' })).toHaveFocus();
    });

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Notificaciones' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notificaciones' })).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('activa y elimina notificaciones con controles nativos separados', async () => {
    render(<NotificationCenter isOpen onClose={vi.fn()} />);

    const openAction = screen.getByRole('button', {
      name: 'Abrir notificación: Presupuesto cerca del limite',
    });
    const deleteAction = screen.getByRole('button', { name: /eliminar notificación/i });
    expect(openAction.contains(deleteAction)).toBe(false);
    expect(deleteAction).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-primary');

    expect(openAction.tagName).toBe('BUTTON');
    fireEvent.click(openAction);
    await waitFor(() => expect(mocks.markAsRead).toHaveBeenCalledWith('notification-1'));

    expect(deleteAction.tagName).toBe('BUTTON');
    fireEvent.click(deleteAction);
    expect(mocks.deleteNotification).toHaveBeenCalledWith('notification-1');
  });

  // ── Task 4: failure recovery + focus safety ──

  it('lectura rechazada: toast de error, cierra el panel y navega exactamente una vez', async () => {
    mocks.markAsRead.mockRejectedValueOnce(new Error('offline'));
    const onClose = vi.fn();
    const onViewChange = vi.fn();
    function Harness() {
      useViewRouting({ onViewChange });
      return <NotificationCenter isOpen onClose={onClose} />;
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /abrir notificación/i }));

    await waitFor(() => {
      expect(onViewChange).toHaveBeenCalledTimes(1);
      expect(onViewChange).toHaveBeenLastCalledWith('budgets');
    });
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/no se pudo marcar/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('eliminar con éxito: enfoca la acción de la siguiente notificación', async () => {
    mocks.list = [notif('n1'), notif('n2')];
    mocks.deleteNotification.mockImplementation(async (id: string) => { removeFromList(id); });
    render(<NotificationCenter isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /eliminar notificación: título n1/i }));

    await waitFor(() => expect(mocks.deleteNotification).toHaveBeenCalledWith('n1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /eliminar notificación: título n1/i })).toBeNull());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /eliminar notificación: título n2/i })).toHaveFocus();
    });
  });

  it('eliminar la última: cae a la acción de la anterior', async () => {
    mocks.list = [notif('n1'), notif('n2')];
    mocks.deleteNotification.mockImplementation(async (id: string) => { removeFromList(id); });
    render(<NotificationCenter isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /eliminar notificación: título n2/i }));
    await waitFor(() => expect(mocks.deleteNotification).toHaveBeenCalledWith('n2'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /eliminar notificación: título n2/i })).toBeNull());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /eliminar notificación: título n1/i })).toHaveFocus();
    });
  });

  it('eliminar la única: el foco cae a Cerrar notificaciones', async () => {
    mocks.list = [notif('solo')];
    mocks.deleteNotification.mockImplementation(async (id: string) => { removeFromList(id); });
    render(<NotificationCenter isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /eliminar notificación: título solo/i }));
    await waitFor(() => expect(mocks.deleteNotification).toHaveBeenCalledWith('solo'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cerrar notificaciones' })).toHaveFocus();
    });
  });

  it('eliminar rechazado: rollback mantiene la fila y el foco vuelve a su acción', async () => {
    mocks.list = [notif('n1'), notif('n2')];
    mocks.deleteNotification.mockRejectedValueOnce(new Error('permiso denegado'));
    render(<NotificationCenter isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /eliminar notificación: título n1/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/no se pudo eliminar/i)));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /eliminar notificación: título n1/i })).toHaveFocus();
    });
  });

  it('limpiar todas: una sola falla accionable resume el error y no cierra el panel', async () => {
    mocks.list = [notif('n1'), notif('n2')];
    mocks.clearAll.mockRejectedValueOnce(new Error('batch failed'));
    const onClose = vi.fn();
    render(<NotificationCenter isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /limpiar/i }));

    await waitFor(() => expect(mocks.clearAll).toHaveBeenCalledTimes(1));
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/no se pudieron eliminar/i));
    expect(onClose).not.toHaveBeenCalled();
  });
});
