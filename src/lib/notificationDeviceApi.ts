'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

/**
 * Callable boundary for durable notification device registration.
 *
 * The subscription is serialized to the exact wire DTO ONLY here, at the
 * callable boundary, and discarded after the call resolves. Raw backend error
 * messages/details are never propagated — callers see bounded product errors.
 */

const FUNCTIONS_REGION = 'us-central1';

export interface RegisterNotificationDeviceInput {
  deviceId: string;
  subscription: {
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
  };
  timeZone: string;
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
  displayMode: 'browser' | 'standalone';
}

export interface SanitizedDeviceStatus {
  deviceId: string;
  state: 'active' | 'disabled' | 'expired' | 'missing';
  accountScope: string | null;
  endpointFingerprint: string | null;
  platform: RegisterNotificationDeviceInput['platform'] | null;
  displayMode: RegisterNotificationDeviceInput['displayMode'] | null;
  timeZone: string;
}

export type TestDeliveryResult =
  | { status: 'accepted'; deliveryId: string }
  | { status: 'rate-limited'; retryAt: string }
  | { status: 'failed'; code: 'device-inactive' | 'configuration' | 'temporary' };

/**
 * Build the exact register wire DTO. Explicitly picks only the known fields so
 * unknown keys on the input can never leak to the backend.
 */
function toRegisterWireDto(input: RegisterNotificationDeviceInput): RegisterNotificationDeviceInput {
  return {
    deviceId: input.deviceId,
    subscription: {
      endpoint: input.subscription.endpoint,
      expirationTime: input.subscription.expirationTime,
      keys: {
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
      },
    },
    timeZone: input.timeZone,
    platform: input.platform,
    displayMode: input.displayMode,
  };
}

function boundedError(): Error {
  return new Error('No se pudo completar la operación de notificaciones.');
}

const functions = getFunctions(app, FUNCTIONS_REGION);

const registerCallable = httpsCallable<RegisterNotificationDeviceInput, SanitizedDeviceStatus>(
  functions,
  'registerNotificationDevice',
);
const statusCallable = httpsCallable<{ deviceId: string }, SanitizedDeviceStatus>(
  functions,
  'getNotificationDeviceStatus',
);
const revokeCallable = httpsCallable<{ deviceId: string }, void>(
  functions,
  'revokeNotificationDevice',
);
const sendTestCallable = httpsCallable<
  { deviceId: string; testRequestId: string },
  TestDeliveryResult
>(functions, 'sendTestNotification');

export const notificationDeviceApi = {
  async register(input: RegisterNotificationDeviceInput): Promise<SanitizedDeviceStatus> {
    try {
      const result = await registerCallable(toRegisterWireDto(input));
      return result.data;
    } catch {
      throw boundedError();
    }
  },

  async status(input: { deviceId: string }): Promise<SanitizedDeviceStatus> {
    try {
      const result = await statusCallable({ deviceId: input.deviceId });
      return result.data;
    } catch {
      throw boundedError();
    }
  },

  async revoke(input: { deviceId: string }): Promise<void> {
    try {
      await revokeCallable({ deviceId: input.deviceId });
    } catch {
      throw boundedError();
    }
  },

  async sendTest(input: {
    deviceId: string;
    testRequestId: string;
  }): Promise<TestDeliveryResult> {
    try {
      const result = await sendTestCallable({
        deviceId: input.deviceId,
        testRequestId: input.testRequestId,
      });
      return result.data;
    } catch {
      return { status: 'failed', code: 'temporary' };
    }
  },
};
