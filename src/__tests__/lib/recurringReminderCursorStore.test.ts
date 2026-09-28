import { beforeEach, describe, expect, it } from 'vitest';
import type { Notification } from '../../types/finance';
import {
  createAuthenticatedRecurringReminderCursorStore,
  createGuestRecurringReminderCursorStore,
  findAuthenticatedRecurringReminderLifecycle,
} from '../../lib/recurringReminderCursorStore';

const sourceLifecycle = (
  overrides: Partial<Notification> = {},
): Notification => ({
  id: 'event-foreground-v4-rent-june',
  type: 'recurring',
  title: 'Pago vencido',
  message: 'Fuente durable',
  severity: 'error',
  isRead: true,
  createdAt: new Date('2026-06-16T14:00:00.000Z'),
  schemaVersion: 2,
  eventKey: 'foreground:v4:recurring:rent:2026-5-15',
  revision: 4,
  stage: 'overdue',
  stageWindow: 'overdue:0',
  lifecycleStatus: 'active',
  authorityConfigVersion: 4,
  dismissedRevision: 4,
  metadata: {
    recurringPaymentId: 'rent',
    recurringCycle: '2026-5-15',
    localDate: '2026-06-15',
  },
  ...overrides,
});

describe('authenticated recurring cursor store', () => {
  it('recupera el cursor desde el set raw/source aunque esté oculto de presentación', () => {
    const hiddenCurrent = sourceLifecycle();
    const sourceNotifications = [
      sourceLifecycle({
        id: 'wrong-config',
        eventKey: 'foreground:v3:recurring:rent:2026-7-15',
        authorityConfigVersion: 3,
        revision: 99,
        metadata: {
          recurringPaymentId: 'rent',
          recurringCycle: '2026-7-15',
          localDate: '2026-08-15',
        },
      }),
      sourceLifecycle({
        id: 'superseded',
        eventKey: 'foreground:v4:recurring:rent:2026-8-15',
        authoritySupersededAt: new Date('2026-08-01T12:00:00.000Z'),
        authoritySupersededByVersion: 5,
        metadata: {
          recurringPaymentId: 'rent',
          recurringCycle: '2026-8-15',
          localDate: '2026-09-15',
        },
      }),
      sourceLifecycle({
        id: 'other-payment',
        eventKey: 'foreground:v4:recurring:phone:2026-7-20',
        metadata: {
          recurringPaymentId: 'phone',
          recurringCycle: '2026-7-20',
          localDate: '2026-08-20',
        },
      }),
      hiddenCurrent,
    ];
    const store = createAuthenticatedRecurringReminderCursorStore({
      sourceNotifications,
      writerPrefix: 'foreground:v4',
      authorityConfigVersion: 4,
    });

    expect(store.read('rent')).toEqual({
      cycleKey: '2026-5-15',
      dueLocalDate: '2026-06-15',
      stageWindow: 'overdue:0',
    });
  });

  it('sobrevive reload/otro dispositivo porque dos adapters leen la misma fuente Firestore', () => {
    const raw = [sourceLifecycle({ lifecycleStatus: 'resolved' })];
    const firstDevice = createAuthenticatedRecurringReminderCursorStore({
      sourceNotifications: raw,
      writerPrefix: 'foreground:v4',
      authorityConfigVersion: 4,
    });
    const secondDevice = createAuthenticatedRecurringReminderCursorStore({
      sourceNotifications: raw.map((item) => ({ ...item })),
      writerPrefix: 'foreground:v4',
      authorityConfigVersion: 4,
    });

    expect(secondDevice.read('rent')).toEqual(firstDevice.read('rent'));
    expect(firstDevice.persistGuest).toBeUndefined();
  });

  it('elige semánticamente el lifecycle actual, no el primer find', () => {
    const old = sourceLifecycle({
      revision: 1, stage: 'd3', stageWindow: 'd3', lifecycleStatus: 'resolved',
    });
    const advanced = sourceLifecycle({
      id: 'advanced',
      revision: 5,
      stage: 'overdue',
      stageWindow: 'overdue:2',
      lifecycleStatus: 'resolved',
      updatedAt: new Date('2026-06-30T14:00:00.000Z'),
    });
    const store = createAuthenticatedRecurringReminderCursorStore({
      sourceNotifications: [old, advanced],
      writerPrefix: 'foreground:v4',
      authorityConfigVersion: 4,
    });

    expect(store.read('rent')?.stageWindow).toBe('overdue:2');
  });

  it('entre múltiples lifecycles activos conserva el impago más antiguo', () => {
    const oldestUnpaid = sourceLifecycle({ id: 'oldest-active', revision: 2 });
    const newerUnpaid = sourceLifecycle({
      id: 'newer-active',
      eventKey: 'foreground:v4:recurring:rent:2026-6-15',
      revision: 20,
      stage: 'd3',
      stageWindow: 'd3',
      metadata: {
        recurringPaymentId: 'rent', recurringCycle: '2026-6-15', localDate: '2026-07-15',
      },
    });

    const selected = findAuthenticatedRecurringReminderLifecycle({
      sourceNotifications: [newerUnpaid, oldestUnpaid],
      paymentId: 'rent', writerPrefix: 'foreground:v4', authorityConfigVersion: 4,
    });

    expect(selected?.id).toBe('oldest-active');
  });

  it('un lifecycle activo vence a uno resuelto aunque el resuelto sea más nuevo', () => {
    const active = sourceLifecycle({ id: 'active-oldest', revision: 1 });
    const resolved = sourceLifecycle({
      id: 'resolved-newer',
      eventKey: 'foreground:v4:recurring:rent:2026-7-15',
      lifecycleStatus: 'resolved',
      revision: 99,
      metadata: {
        recurringPaymentId: 'rent', recurringCycle: '2026-7-15', localDate: '2026-08-15',
      },
    });

    const selected = findAuthenticatedRecurringReminderLifecycle({
      sourceNotifications: [resolved, active],
      paymentId: 'rent', writerPrefix: 'foreground:v4', authorityConfigVersion: 4,
    });

    expect(selected?.id).toBe('active-oldest');
  });

  it('cuando todos están resueltos elige el dueLocalDate más nuevo', () => {
    const oldResolved = sourceLifecycle({
      id: 'old-resolved', lifecycleStatus: 'resolved', revision: 99,
    });
    const newResolved = sourceLifecycle({
      id: 'new-resolved',
      eventKey: 'foreground:v4:recurring:rent:2026-6-15',
      lifecycleStatus: 'resolved',
      revision: 1,
      metadata: {
        recurringPaymentId: 'rent', recurringCycle: '2026-6-15', localDate: '2026-07-15',
      },
    });

    const selected = findAuthenticatedRecurringReminderLifecycle({
      sourceNotifications: [oldResolved, newResolved],
      paymentId: 'rent', writerPrefix: 'foreground:v4', authorityConfigVersion: 4,
    });

    expect(selected?.id).toBe('new-resolved');
  });

  it('desempata por updatedAt aunque el más reciente tenga menor revision', () => {
    const highRevisionOldUpdate = sourceLifecycle({
      id: 'high-revision-old-update', revision: 99,
      updatedAt: new Date('2026-06-16T13:00:00.000Z'),
    });
    const lowRevisionNewUpdate = sourceLifecycle({
      id: 'low-revision-new-update', revision: 1,
      updatedAt: new Date('2026-06-16T14:00:00.000Z'),
    });

    const selected = findAuthenticatedRecurringReminderLifecycle({
      sourceNotifications: [highRevisionOldUpdate, lowRevisionNewUpdate],
      paymentId: 'rent', writerPrefix: 'foreground:v4', authorityConfigVersion: 4,
    });

    expect(selected?.id).toBe('low-revision-new-update');
  });

  it('usa id lexical como desempate final sin precedencia de revision', () => {
    const updatedAt = new Date('2026-06-16T14:00:00.000Z');
    const idLoser = sourceLifecycle({ id: 'z-document', revision: 99, updatedAt });
    const idWinner = sourceLifecycle({ id: 'a-document', revision: 1, updatedAt });

    const selected = findAuthenticatedRecurringReminderLifecycle({
      sourceNotifications: [idLoser, idWinner],
      paymentId: 'rent', writerPrefix: 'foreground:v4', authorityConfigVersion: 4,
    });

    expect(selected?.id).toBe('a-document');
  });

  it('un lifecycle superseded no desplaza al lifecycle admitido', () => {
    const admitted = sourceLifecycle({ id: 'admitted', revision: 1 });
    const superseded = sourceLifecycle({
      id: 'superseded-oldest',
      revision: 100,
      authoritySupersededAt: new Date('2026-06-16T15:00:00.000Z'),
      authoritySupersededByVersion: 5,
    });

    const selected = findAuthenticatedRecurringReminderLifecycle({
      sourceNotifications: [superseded, admitted],
      paymentId: 'rent', writerPrefix: 'foreground:v4', authorityConfigVersion: 4,
    });

    expect(selected?.id).toBe('admitted');
  });

  it('descarta metadata cuyo cycleKey no representa exactamente dueLocalDate', () => {
    const store = createAuthenticatedRecurringReminderCursorStore({
      sourceNotifications: [sourceLifecycle({
        metadata: {
          recurringPaymentId: 'rent', recurringCycle: '2026-6-15', localDate: '2026-06-15',
        },
        eventKey: 'foreground:v4:recurring:rent:2026-6-15',
      })],
      writerPrefix: 'foreground:v4', authorityConfigVersion: 4,
    });
    expect(store.read('rent')).toBeUndefined();
  });
});

describe('guest recurring cursor store', () => {
  beforeEach(() => localStorage.clear());

  it.each([
    ['fuera de rango', '2026-98-99', '2026-99-99'],
    ['día calendario imposible', '2026-1-31', '2026-02-31'],
    ['cycleKey inconsistente', '2026-1-28', '2026-02-27'],
  ])('descarta un cursor corrupto (%s) sin bloquear otro pago válido', (
    _case,
    cycleKey,
    dueLocalDate,
  ) => {
    const key = 'moneytrack:recurring-reminder-cursors:v1:guest-a:foreground%3Aguest';
    const valid = {
      cycleKey: '2026-5-15', dueLocalDate: '2026-06-15', stageWindow: 'due',
    };
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      cursors: {
        corrupt: { cycleKey, dueLocalDate, stageWindow: 'due' },
        phone: valid,
      },
    }));
    const store = createGuestRecurringReminderCursorStore({
      storage: localStorage,
      accountScope: 'guest-a',
      writerPrefix: 'foreground:guest',
    });

    expect(store.read('corrupt')).toBeUndefined();
    expect(store.read('phone')).toEqual(valid);
  });

  it('persiste solo el cursor bajo versión + cuenta + writer y no copia datos financieros', () => {
    const guestA = createGuestRecurringReminderCursorStore({
      storage: localStorage,
      accountScope: 'guest-a',
      writerPrefix: 'foreground:guest',
    });
    guestA.persistGuest?.('rent', {
      cycleKey: '2026-5-15',
      dueLocalDate: '2026-06-15',
      stageWindow: 'd3',
    });

    expect(guestA.read('rent')).toEqual({
      cycleKey: '2026-5-15',
      dueLocalDate: '2026-06-15',
      stageWindow: 'd3',
    });
    const payload = localStorage.getItem(localStorage.key(0)!)!;
    expect(payload).not.toMatch(/Arriendo|amount|1500000/);

    expect(createGuestRecurringReminderCursorStore({
      storage: localStorage,
      accountScope: 'guest-b',
      writerPrefix: 'foreground:guest',
    }).read('rent')).toBeUndefined();
    expect(createGuestRecurringReminderCursorStore({
      storage: localStorage,
      accountScope: 'guest-a',
      writerPrefix: 'backend',
    }).read('rent')).toBeUndefined();
  });

  it('elimina únicamente el cursor solicitado', () => {
    const store = createGuestRecurringReminderCursorStore({
      storage: localStorage,
      accountScope: 'guest-a',
      writerPrefix: 'foreground:guest',
    });
    const cursor = {
      cycleKey: '2026-5-15',
      dueLocalDate: '2026-06-15',
      stageWindow: 'due' as const,
    };
    store.persistGuest?.('rent', cursor);
    store.persistGuest?.('phone', cursor);
    store.removeGuest?.('rent');

    expect(store.read('rent')).toBeUndefined();
    expect(store.read('phone')).toEqual(cursor);
  });
});
