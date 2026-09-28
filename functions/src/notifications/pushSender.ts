/**
 * Concrete push sender wrapping `web-push`.
 *
 * Builds the private, same-origin wire payload from the constant copy table and
 * sends it with VAPID auth. The low-level send is injectable so the sender is
 * unit-testable without a real push service. The payload NEVER contains a
 * monetary amount or identifying financial text.
 */

import webpush from 'web-push';
import { buildPayload, MAX_PAYLOAD_BYTES, type PayloadKind } from './contracts.js';
import type { VapidPair } from './vapidMaterial.js';

export interface PushSubscriptionMaterial {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface SendResult {
  statusCode: number | null;
}

export interface WebPushSendFn {
  (
    subscription: PushSubscriptionMaterial,
    payload: string,
    options: webpush.RequestOptions,
  ): Promise<{ statusCode: number }>;
}

export interface PushSenderConfig {
  vapid: VapidPair;
  subject: string;
  /** Injectable low-level send; defaults to web-push. */
  send?: WebPushSendFn;
  /** TTL seconds for the push (bounded so stale pushes are dropped by the service). */
  ttlSeconds?: number;
}

export interface SendPushInput {
  subscription: PushSubscriptionMaterial;
  kind: PayloadKind;
  accountScope: string;
  eventId: string;
  eventRevision: number;
  expiresAt: string;
  notificationTag: string;
  /** Hashed Topic header so a newer push replaces an older one at the service. */
  topic: string;
}

const defaultSend: WebPushSendFn = (subscription, payload, options) =>
  webpush.sendNotification(subscription, payload, options) as Promise<{ statusCode: number }>;

export const createPushSender = (config: PushSenderConfig) => {
  const send = config.send ?? defaultSend;
  const ttl = config.ttlSeconds ?? 12 * 3600;

  return {
    async send(input: SendPushInput): Promise<SendResult> {
      const payload = buildPayload({
        kind: input.kind,
        accountScope: input.accountScope,
        eventId: input.eventId,
        eventRevision: input.eventRevision,
        expiresAt: input.expiresAt,
        notificationTag: input.notificationTag,
      });
      const serialized = JSON.stringify(payload);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
        throw new Error('Push payload exceeds maximum size');
      }

      const options: webpush.RequestOptions = {
        vapidDetails: {
          subject: config.subject,
          publicKey: config.vapid.publicKey,
          privateKey: config.vapid.privateKey,
        },
        TTL: ttl,
        headers: { Topic: input.topic },
      };

      try {
        const { statusCode } = await send(input.subscription, serialized, options);
        return { statusCode };
      } catch (error) {
        // web-push throws WebPushError with a statusCode for HTTP errors.
        const status = (error as { statusCode?: number }).statusCode;
        if (typeof status === 'number') {
          return { statusCode: status };
        }
        // Network error / lost result -> ambiguous.
        return { statusCode: null };
      }
    },
  };
};

export type PushSender = ReturnType<typeof createPushSender>;
