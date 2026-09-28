import { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import { getDailyReminderCatchUp } from '../utils/notificationEventLifecycle';
import { getForegroundReminderContext } from '../lib/recurringReminderCursorStore';
import type { NotificationAuthorityState } from '../utils/notificationAuthority';
import type { NotificationManager } from '../services/NotificationManager';
import type { NotificationPreferences } from '../types/finance';

const EVALUATION_INTERVAL_MS = 5 * 60 * 1000;

export interface DailyExpenseReminderOptions {
  /** Task 3: solo un escritor foreground admitido puede presentar el diario. */
  foregroundWriterActive?: boolean;
  /** Token de autoridad para revalidar la generación al mutar. */
  authority?: NotificationAuthorityState;
}

export function useDailyExpenseReminder(
  notificationManager: NotificationManager,
  preferences: NotificationPreferences,
  options: DailyExpenseReminderOptions = {}
) {
  const { enabled, hour, minute } = preferences.dailyExpenseReminder;
  const { foregroundWriterActive = true, authority } = options;

  // Ref mutable: un callback de timer capturado antes de un cutover revalida el
  // escritor vigente JUSTO antes de mutar, en vez de usar el valor capturado.
  const writerRef = useRef<{ active: boolean; authority?: NotificationAuthorityState }>({
    active: foregroundWriterActive,
    authority,
  });
  writerRef.current = { active: foregroundWriterActive, authority };

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let cancelled = false;
    let lastReminderLocalDate: string | undefined;

    const evaluate = async () => {
      if (cancelled) return;
      // Recheck previo: sin escritor foreground vigente no se evalúa ni presenta.
      if (!writerRef.current.active) return;
      const context = getForegroundReminderContext(notificationManager);
      const timeZone = context?.timeZone
        ?? preferences.timeZone
        ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        ?? 'America/Bogota';
      const disposition = getDailyReminderCatchUp({
        now: new Date(), timeZone, hour, minute, lastReminderLocalDate,
      });
      if (!disposition.shouldSend) return;

      // Recheck inmediatamente antes de mutar: un cutover ocurrido entre el
      // inicio de evaluate y este punto revoca la presentación foreground.
      if (!writerRef.current.active) return;

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
  }, [notificationManager, preferences.timeZone, enabled, hour, minute, foregroundWriterActive, authority]);
}
