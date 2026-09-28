import type { Notification } from '../types/finance';
import {
  isRecurringReminderStageWindow,
  type RecurringReminderCursor,
} from '../utils/recurringReminderCursor';

export interface RecurringReminderCursorStore {
  read(paymentId: string): RecurringReminderCursor | undefined;
  persistGuest?(paymentId: string, cursor: RecurringReminderCursor): void;
  removeGuest?(paymentId: string): void;
}

export interface ForegroundReminderContext {
  cursorStore: RecurringReminderCursorStore;
  sourceNotifications: readonly Notification[];
  timeZone: string;
  writerPrefix: string;
  authorityConfigVersion?: number;
}

const foregroundContexts = new WeakMap<object, ForegroundReminderContext>();

export const setForegroundReminderContext = (
  owner: object,
  context: ForegroundReminderContext
): void => {
  foregroundContexts.set(owner, context);
};

export const getForegroundReminderContext = (
  owner: object
): ForegroundReminderContext | undefined => foregroundContexts.get(owner);

export function findAuthenticatedRecurringReminderLifecycle({
  sourceNotifications,
  paymentId,
  writerPrefix,
  authorityConfigVersion,
}: {
  sourceNotifications: readonly Notification[];
  paymentId: string;
  writerPrefix: string;
  authorityConfigVersion?: number;
}): Notification | undefined {
  const encodedPaymentId = encodeURIComponent(paymentId);
  return sourceNotifications
    .filter((notification) => {
      const cursor = cursorFromNotification(notification);
      const expectedEventKey = cursor
        ? `${writerPrefix}:recurring:${encodedPaymentId}:${cursor.cycleKey}`
        : '';
      const configMatches = authorityConfigVersion === undefined
        ? notification.authorityConfigVersion === undefined
        : notification.authorityConfigVersion === authorityConfigVersion;
      return Boolean(
        cursor
        && notification.schemaVersion === 2
        && notification.type === 'recurring'
        && notification.metadata?.recurringPaymentId === paymentId
        && notification.eventKey === expectedEventKey
        && configMatches
        && (
          notification.lifecycleStatus === 'scheduled'
          || notification.lifecycleStatus === 'active'
          || notification.lifecycleStatus === 'resolved'
        )
        && !notification.authoritySupersededAt
      );
    })
    .sort((left, right) => {
      const leftCursor = cursorFromNotification(left)!;
      const rightCursor = cursorFromNotification(right)!;
      const leftUnpaid = left.lifecycleStatus !== 'resolved';
      const rightUnpaid = right.lifecycleStatus !== 'resolved';
      const lifecycleOrder = Number(rightUnpaid) - Number(leftUnpaid);
      if (lifecycleOrder !== 0) return lifecycleOrder;
      const dueOrder = leftUnpaid
        ? leftCursor.dueLocalDate.localeCompare(rightCursor.dueLocalDate)
        : rightCursor.dueLocalDate.localeCompare(leftCursor.dueLocalDate);
      if (dueOrder !== 0) return dueOrder;
      const updatedOrder = (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0);
      if (updatedOrder !== 0) return updatedOrder;
      return (left.id ?? '').localeCompare(right.id ?? '');
    })[0];
}

const validateCursor = (value: unknown): RecurringReminderCursor | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const cursor = value as Partial<RecurringReminderCursor>;
  const cycle = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cursor.cycleKey ?? '');
  const due = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cursor.dueLocalDate ?? '');
  if (!cycle || !due) return undefined;
  const dueDate = new Date(0);
  dueDate.setUTCFullYear(Number(due[1]), Number(due[2]) - 1, Number(due[3]));
  if (
    dueDate.getUTCFullYear() !== Number(due[1])
    || dueDate.getUTCMonth() !== Number(due[2]) - 1
    || dueDate.getUTCDate() !== Number(due[3])
    || Number(cycle[1]) !== Number(due[1])
    || Number(cycle[2]) !== Number(due[2]) - 1
    || Number(cycle[3]) !== Number(due[3])
  ) return undefined;
  if (!isRecurringReminderStageWindow(cursor.stageWindow)) return undefined;
  return {
    cycleKey: cursor.cycleKey!,
    dueLocalDate: cursor.dueLocalDate!,
    stageWindow: cursor.stageWindow,
  };
};

const cursorFromNotification = (notification: Notification): RecurringReminderCursor | undefined => {
  return validateCursor({
    cycleKey: notification.metadata?.recurringCycle,
    dueLocalDate: notification.metadata?.localDate,
    stageWindow: notification.stageWindow,
  });
};

export function createAuthenticatedRecurringReminderCursorStore({
  sourceNotifications,
  writerPrefix,
  authorityConfigVersion,
}: {
  sourceNotifications: readonly Notification[];
  writerPrefix: string;
  authorityConfigVersion?: number;
}): RecurringReminderCursorStore {
  return {
    read(paymentId) {
      const lifecycle = findAuthenticatedRecurringReminderLifecycle({
        sourceNotifications, paymentId, writerPrefix, authorityConfigVersion,
      });
      return lifecycle ? cursorFromNotification(lifecycle) : undefined;
    },
  };
}

const STORAGE_VERSION = 1;

type StoredGuestCursors = {
  version: typeof STORAGE_VERSION;
  cursors: Record<string, RecurringReminderCursor>;
};

export function createGuestRecurringReminderCursorStore({
  storage,
  accountScope,
  writerPrefix,
}: {
  storage: Storage;
  accountScope: string;
  writerPrefix: string;
}): RecurringReminderCursorStore {
  const key = `moneytrack:recurring-reminder-cursors:v${STORAGE_VERSION}:${encodeURIComponent(accountScope)}:${encodeURIComponent(writerPrefix)}`;
  const load = (): StoredGuestCursors => {
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? 'null') as Partial<StoredGuestCursors> | null;
      if (parsed?.version !== STORAGE_VERSION || !parsed.cursors) {
        return { version: STORAGE_VERSION, cursors: {} };
      }
      return {
        version: STORAGE_VERSION,
        cursors: Object.fromEntries(Object.entries(parsed.cursors).flatMap(([paymentId, value]) => {
          const cursor = validateCursor(value);
          return cursor ? [[paymentId, cursor]] : [];
        })),
      };
    } catch {
      return { version: STORAGE_VERSION, cursors: {} };
    }
  };
  const save = (state: StoredGuestCursors) => storage.setItem(key, JSON.stringify(state));

  return {
    read(paymentId) {
      return load().cursors[paymentId];
    },
    persistGuest(paymentId, cursor) {
      const validCursor = validateCursor(cursor);
      if (!validCursor) return;
      const state = load();
      state.cursors[paymentId] = validCursor;
      save(state);
    },
    removeGuest(paymentId) {
      const state = load();
      delete state.cursors[paymentId];
      save(state);
    },
  };
}
