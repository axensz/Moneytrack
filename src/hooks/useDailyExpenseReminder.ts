import { useEffect } from 'react';
import { logger } from '../utils/logger';
import { getDailyReminderCatchUp } from '../utils/notificationEventLifecycle';
import { getForegroundReminderContext } from '../lib/recurringReminderCursorStore';
import type { NotificationManager } from '../services/NotificationManager';
import type { NotificationPreferences } from '../types/finance';

const EVALUATION_INTERVAL_MS = 5 * 60 * 1000;

export function useDailyExpenseReminder(
  notificationManager: NotificationManager,
  preferences: NotificationPreferences
) {
  const { enabled, hour, minute } = preferences.dailyExpenseReminder;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let cancelled = false;
    let lastReminderLocalDate: string | undefined;

    const evaluate = async () => {
      if (cancelled) return;
      const context = getForegroundReminderContext(notificationManager);
      const timeZone = context?.timeZone
        ?? preferences.timeZone
        ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        ?? 'America/Bogota';
      const disposition = getDailyReminderCatchUp({
        now: new Date(), timeZone, hour, minute, lastReminderLocalDate,
      });
      if (!disposition.shouldSend) return;

      lastReminderLocalDate = disposition.localDate;
      try {
        await notificationManager.createNotification({
          type: 'info',
          title: 'Registra tus gastos',
          message: 'No se te olvide agregar tus gastos de hoy.',
          severity: 'info',
          isRead: false,
          schemaVersion: 2,
          eventKey: `${context?.writerPrefix ?? 'foreground:compat'}:daily-expense:${disposition.localDate}`,
          stage: 'daily',
          stageWindow: 'daily',
          lifecycleStatus: 'active',
          actionUrl: '/?view=transactions',
          metadata: { reminderKey: 'daily-expense-reminder', localDate: disposition.localDate },
          ...(context?.authorityConfigVersion === undefined
            ? {}
            : { authorityConfigVersion: context.authorityConfigVersion }),
        });
      } catch (error) {
        lastReminderLocalDate = undefined;
        logger.error('Daily expense reminder failed', error);
      }
    };

    void evaluate();
    const interval = window.setInterval(() => { void evaluate(); }, EVALUATION_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [notificationManager, preferences.timeZone, enabled, hour, minute]);
}
