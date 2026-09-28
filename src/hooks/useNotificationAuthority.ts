/**
 * Lee el documento de autoridad `users/{uid}/notificationRuntime/state` y lo
 * clasifica en un `NotificationAuthorityState` (Task 3).
 *
 * - Lee SOLO ese documento; jamás capacidades de dispositivo.
 * - Estado y caché keyed por userId: al cambiar de cuenta, B nunca hereda A.
 * - Cachea el último estado confirmado en sessionStorage account-scoped para
 *   reusarlo en un remount o durante checking/error, sin volver al gate legacy.
 * - Un error del listener degrada a transient/error reutilizando el confirmado.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseDb';
import { logger } from '../utils/logger';
import {
  classifyNotificationAuthority,
  type NotificationAuthorityPhase,
  type NotificationAuthorityState,
  type NotificationRuntimeSnapshot,
} from '../utils/notificationAuthority';

const CACHE_VERSION = 1;

const cacheKey = (userId: string) =>
  `moneytrack:notification-authority:v${CACHE_VERSION}:${encodeURIComponent(userId)}`;

const readCachedConfirmed = (
  userId: string,
): NotificationAuthorityState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; state?: NotificationAuthorityState } | null;
    if (parsed?.version !== CACHE_VERSION || !parsed.state) return null;
    return parsed.state;
  } catch {
    return null;
  }
};

const writeCachedConfirmed = (
  userId: string,
  state: NotificationAuthorityState,
): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      cacheKey(userId),
      JSON.stringify({ version: CACHE_VERSION, state }),
    );
  } catch {
    // sessionStorage lleno/bloqueado: la autoridad sigue funcionando sin caché.
  }
};

/** Normaliza `activatedAt` (Timestamp | number | null) a epoch ms o null. */
const toEpochMs = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
};

const decodeRuntime = (
  data: Record<string, unknown> | undefined,
): NotificationRuntimeSnapshot | null => {
  if (!data) return null;
  const authority = data.authority === 'durable' ? 'durable' : 'foreground';
  const configVersion = typeof data.configVersion === 'number' ? data.configVersion : 0;
  return { authority, configVersion, activatedAt: toEpochMs(data.activatedAt) };
};

interface RuntimeState {
  userId: string;
  phase: NotificationAuthorityPhase;
  runtime?: NotificationRuntimeSnapshot | null;
  backendConfirmed: boolean;
}

export function useNotificationAuthority(
  userId: string | null,
): NotificationAuthorityState {
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  // Último confirmado de ESTA cuenta (memoria + sessionStorage) para checking/error.
  const lastConfirmedRef = useRef<{ userId: string; state: NotificationAuthorityState } | null>(null);

  useEffect(() => {
    if (!userId) {
      setRuntimeState(null);
      lastConfirmedRef.current = null;
      return;
    }
    // Semilla desde caché account-scoped: no volver a compat si ya hubo confirmación.
    const cached = readCachedConfirmed(userId);
    lastConfirmedRef.current = cached ? { userId, state: cached } : null;
    setRuntimeState({ userId, phase: 'checking', backendConfirmed: cached != null });

    let active = true;
    const unsubscribe = onSnapshot(
      doc(db, `users/${userId}/notificationRuntime/state`),
      (snap) => {
        if (!active) return;
        const runtime = snap.exists() ? decodeRuntime(snap.data()) : null;
        setRuntimeState({ userId, phase: 'ready', runtime, backendConfirmed: true });
      },
      (err) => {
        if (!active) return;
        logger.error('No se pudo leer la autoridad de notificación', err);
        setRuntimeState((current) => (
          current?.userId === userId
            ? { ...current, phase: 'error' }
            : { userId, phase: 'error', backendConfirmed: false }
        ));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  return useMemo<NotificationAuthorityState>(() => {
    if (!userId) {
      return { kind: 'guest', effective: 'foreground', writer: { namespace: 'guest' } };
    }
    // Estado del usuario actual únicamente; una entrada de otra cuenta se ignora.
    const scoped = runtimeState?.userId === userId ? runtimeState : null;
    const lastConfirmed = lastConfirmedRef.current?.userId === userId
      ? lastConfirmedRef.current.state
      : null;

    const state = classifyNotificationAuthority({
      userId,
      phase: scoped?.phase ?? 'checking',
      runtime: scoped?.phase === 'ready' ? scoped.runtime : undefined,
      backendConfirmed: scoped?.backendConfirmed ?? (lastConfirmed != null),
      lastConfirmed,
    });

    // Persistir solo estados confirmados (fase ready): foreground/compat/durable.
    if (scoped?.phase === 'ready') {
      lastConfirmedRef.current = { userId, state };
      writeCachedConfirmed(userId, state);
    }
    return state;
  }, [userId, runtimeState]);
}
