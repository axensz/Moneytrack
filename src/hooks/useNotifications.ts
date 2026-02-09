/**
 * 🟢 Hook para notificaciones de navegador (Web Push)
 * 
 * CARACTERÍSTICAS:
 * ✅ Solicitar permisos de notificaciones
 * ✅ Verificar soporte del navegador
 * ✅ Enviar notificaciones para pagos vencidos
 * ✅ Notificaciones con acciones (ver detalles)
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/logger';
import type { RecurringPayment } from '../types/finance';

interface NotificationPermission {
  granted: boolean;
  denied: boolean;
  default: boolean;
}

/**
 * Hook para gestionar notificaciones del navegador
 */
export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>({
    granted: false,
    denied: false,
    default: true
  });

  const [isSupported, setIsSupported] = useState(false);

  // Verificar soporte del navegador al cargar
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      updatePermissionState();
    } else {
      logger.warn('Browser does not support notifications');
    }
  }, []);

  /**
   * Actualiza el estado de permisos
   */
  const updatePermissionState = () => {
    if (!('Notification' in window)) return;

    const perm = Notification.permission;
    setPermission({
      granted: perm === 'granted',
      denied: perm === 'denied',
      default: perm === 'default'
    });
  };

  /**
   * Solicita permisos de notificaciones
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      logger.warn('Notifications not supported');
      return false;
    }

    if (permission.granted) {
      return true;
    }

    try {
      const result = await Notification.requestPermission();
      updatePermissionState();
      
      if (result === 'granted') {
        logger.info('Notification permission granted');
        return true;
      } else {
        logger.warn('Notification permission denied');
        return false;
      }
    } catch (error) {
      logger.error('Error requesting notification permission', error);
      return false;
    }
  }, [isSupported, permission.granted]);

  /**
   * Envía una notificación simple
   */
  const sendNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (!permission.granted) {
        logger.warn('Cannot send notification: permission not granted');
        return null;
      }

      try {
        const notification = new Notification(title, {
          icon: '/icon-192.png', // Asume que existe un ícono
          badge: '/icon-192.png',
          ...options
        });

        // Log cuando se hace click en la notificación
        notification.onclick = (e) => {
          e.preventDefault();
          window.focus();
          notification.close();
          
          if (options?.data?.url) {
            window.location.href = options.data.url;
          }
        };

        return notification;
      } catch (error) {
        logger.error('Error sending notification', error);
        return null;
      }
    },
    [permission.granted]
  );

  /**
   * Notifica sobre un pago vencido
   */
  const notifyOverduePayment = useCallback(
    (payment: RecurringPayment, daysOverdue: number) => {
      if (!permission.granted) return;

      const title = daysOverdue === 0 
        ? `⏰ Pago vence hoy: ${payment.name}`
        : `🔴 Pago vencido: ${payment.name}`;

      const body = daysOverdue === 0
        ? `Tu pago de ${payment.name} vence hoy.`
        : `Tu pago de ${payment.name} está vencido por ${daysOverdue} día${daysOverdue > 1 ? 's' : ''}.`;

      return sendNotification(title, {
        body,
        tag: `payment-${payment.id}`, // Evita duplicados
        requireInteraction: daysOverdue > 0, // Mantener visible si está vencido
        data: {
          paymentId: payment.id,
          url: '/recurring' // Redirigir a la vista de pagos periódicos
        }
      });
    },
    [permission.granted, sendNotification]
  );

  /**
   * Notifica sobre próximos pagos (alerta temprana)
   */
  const notifyUpcomingPayment = useCallback(
    (payment: RecurringPayment, daysUntilDue: number) => {
      if (!permission.granted) return;

      const title = `📅 Próximo pago: ${payment.name}`;
      const body = `Tu pago de ${payment.name} vence en ${daysUntilDue} día${daysUntilDue > 1 ? 's' : ''}.`;

      return sendNotification(title, {
        body,
        tag: `payment-upcoming-${payment.id}`,
        data: {
          paymentId: payment.id,
          url: '/recurring'
        }
      });
    },
    [permission.granted, sendNotification]
  );

  /**
   * Verifica y notifica sobre pagos vencidos/próximos
   */
  const checkAndNotifyPayments = useCallback(
    (
      payments: RecurringPayment[],
      getDaysUntilDue: (payment: RecurringPayment) => number
    ) => {
      if (!permission.granted) return;

      const notifiedToday = new Set<string>();

      payments.forEach(payment => {
        if (!payment.isActive) return;

        const daysUntil = getDaysUntilDue(payment);
        const notificationKey = `notification-${payment.id}-${new Date().toDateString()}`;

        // Evitar notificar múltiples veces por día
        if (localStorage.getItem(notificationKey)) {
          return;
        }

        // Notificar si está vencido
        if (daysUntil < 0) {
          notifyOverduePayment(payment, Math.abs(daysUntil));
          localStorage.setItem(notificationKey, 'true');
          notifiedToday.add(payment.id!);
        }
        // Notificar si vence hoy
        else if (daysUntil === 0) {
          notifyOverduePayment(payment, 0);
          localStorage.setItem(notificationKey, 'true');
          notifiedToday.add(payment.id!);
        }
        // Notificar si vence en 3 días o menos (alerta temprana)
        else if (daysUntil <= 3 && daysUntil > 0) {
          notifyUpcomingPayment(payment, daysUntil);
          localStorage.setItem(notificationKey, 'true');
          notifiedToday.add(payment.id!);
        }
      });

      if (notifiedToday.size > 0) {
        logger.info('Sent payment notifications', { count: notifiedToday.size });
      }
    },
    [permission.granted, notifyOverduePayment, notifyUpcomingPayment]
  );

  return {
    isSupported,
    permission,
    requestPermission,
    sendNotification,
    notifyOverduePayment,
    notifyUpcomingPayment,
    checkAndNotifyPayments
  };
}
