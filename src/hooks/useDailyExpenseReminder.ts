import { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import type { NotificationManager } from '../services/NotificationManager';
import type { NotificationPreferences } from '../types/finance';

const MAX_TIMEOUT_MS = 2_147_483_647;
const DAILY_REMINDER_METADATA = { reminderKey: 'daily-expense-reminder' };

function getNextReminderDate(hour: number, minute: number): Date {
    const next = new Date();
    next.setHours(hour, minute, 0, 0);

    if (next.getTime() <= Date.now()) {
        next.setDate(next.getDate() + 1);
    }

    return next;
}

export function useDailyExpenseReminder(
    notificationManager: NotificationManager,
    preferences: NotificationPreferences
) {
    const timeoutRef = useRef<number | null>(null);
    const {
        enabled,
        hour,
        minute,
    } = preferences.dailyExpenseReminder;

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') {
            return;
        }

        let cancelled = false;

        const clearScheduledReminder = () => {
            if (timeoutRef.current !== null) {
                window.clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };

        const scheduleNextReminder = () => {
            clearScheduledReminder();
            const nextReminder = getNextReminderDate(hour, minute);
            const delay = Math.min(nextReminder.getTime() - Date.now(), MAX_TIMEOUT_MS);

            timeoutRef.current = window.setTimeout(async () => {
                if (cancelled) return;

                try {
                    await notificationManager.createNotification({
                        type: 'info',
                        title: 'Registra tus gastos',
                        message: 'No se te olvide agregar tus gastos de hoy.',
                        severity: 'info',
                        isRead: false,
                        actionUrl: '/?view=transactions',
                        metadata: DAILY_REMINDER_METADATA,
                    });
                } catch (error) {
                    logger.error('Daily expense reminder failed', error);
                } finally {
                    if (!cancelled) {
                        scheduleNextReminder();
                    }
                }
            }, delay);
        };

        scheduleNextReminder();

        return () => {
            cancelled = true;
            clearScheduledReminder();
        };
    }, [
        notificationManager,
        enabled,
        hour,
        minute,
    ]);
}
