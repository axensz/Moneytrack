import { describe, it, expect } from 'vitest';
import { createPushSender, type WebPushSendFn, type SendPushInput } from '../../src/notifications/pushSender.js';
import { generateVapidPair } from '../../src/notifications/vapidMaterial.js';
import { eventIdFor } from '../../src/notifications/contracts.js';

const vapid = generateVapidPair();
const subject = 'mailto:ops@example.com';

const input = (o: Partial<SendPushInput> = {}): SendPushInput => ({
  subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } },
  kind: 'recurring',
  accountScope: 'AAAAAAAAAAAAAAAAAAAAAA',
  eventId: eventIdFor('recurring:rent:2026-08'),
  eventRevision: 2,
  expiresAt: '2026-08-31T00:00:00.000Z',
  notificationTag: 'moneytrack-recurring',
  topic: 'abc123',
  ...o,
});

describe('createPushSender', () => {
  it('sends a private payload with no monetary amount and returns the status', async () => {
    let capturedPayload = '';
    let capturedOptions: unknown;
    const send: WebPushSendFn = async (_sub, payload, options) => {
      capturedPayload = payload;
      capturedOptions = options;
      return { statusCode: 201 };
    };
    const sender = createPushSender({ vapid, subject, send });
    const result = await sender.send(input());

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(capturedPayload);
    expect(parsed.title).toBe('Recordatorio de pago');
    expect(parsed.body).not.toMatch(/\$|COP|\d{3,}/); // no amounts
    expect(parsed.eventRevision).toBe(2);
    expect((capturedOptions as { headers: Record<string, string> }).headers.Topic).toBe('abc123');
    expect((capturedOptions as { vapidDetails: { publicKey: string } }).vapidDetails.publicKey).toBe(vapid.publicKey);
  });

  it('maps a WebPushError statusCode to the send result', async () => {
    const send: WebPushSendFn = async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); };
    const sender = createPushSender({ vapid, subject, send });
    expect((await sender.send(input())).statusCode).toBe(410);
  });

  it('maps a network error (no statusCode) to a lost/ambiguous result', async () => {
    const send: WebPushSendFn = async () => { throw new Error('ECONNRESET'); };
    const sender = createPushSender({ vapid, subject, send });
    expect((await sender.send(input())).statusCode).toBeNull();
  });

  it('builds the correct copy per kind', async () => {
    const payloads: string[] = [];
    const send: WebPushSendFn = async (_s, p) => { payloads.push(p); return { statusCode: 201 }; };
    const sender = createPushSender({ vapid, subject, send });
    await sender.send(input({ kind: 'debt' }));
    await sender.send(input({ kind: 'daily' }));
    expect(JSON.parse(payloads[0]).actionUrl).toBe('/?view=debts');
    expect(JSON.parse(payloads[1]).title).toBe('Registro diario pendiente');
  });
});
