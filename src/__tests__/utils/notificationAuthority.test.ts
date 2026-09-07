import { describe, expect, it } from 'vitest';
import {
  classifyNotificationAuthority,
  isForegroundWriter,
  type NotificationAuthorityState,
  type NotificationRuntimeSnapshot,
} from '../../utils/notificationAuthority';

// Estas pruebas fijan la máquina de autoridad pura de Task 3: clasifica el
// documento runtime de una cuenta en un estado discriminado. La presentación
// foreground solo puede ocurrir cuando el escritor admitido es foreground con
// la generación exacta; durable y `activatedAt: null` (cutover) no escriben ni
// presentan; un error transitorio reutiliza únicamente el último estado
// confirmado de ESTA cuenta.

describe('classifyNotificationAuthority — máquina de autoridad', () => {
  it('invitado: sin userId corre foreground con namespace guest', () => {
    const state = classifyNotificationAuthority({ userId: null, phase: 'ready' });
    expect(state).toEqual<NotificationAuthorityState>({
      kind: 'guest',
      effective: 'foreground',
      writer: { namespace: 'guest' },
    });
  });

  it('compat: autenticado sin runtime confirmado corre foreground compat', () => {
    const state = classifyNotificationAuthority({
      userId: 'user-a',
      phase: 'ready',
      runtime: null,
      backendConfirmed: false,
    });
    expect(state).toEqual<NotificationAuthorityState>({
      kind: 'compat',
      effective: 'foreground',
      writer: { namespace: 'compat' },
    });
  });

  it('foreground activo: corre con la generación exacta', () => {
    const runtime: NotificationRuntimeSnapshot = {
      authority: 'foreground',
      configVersion: 7,
      activatedAt: 1_700_000_000_000,
    };
    const state = classifyNotificationAuthority({
      userId: 'user-a',
      phase: 'ready',
      runtime,
      backendConfirmed: true,
    });
    expect(state).toEqual<NotificationAuthorityState>({
      kind: 'foreground',
      effective: 'foreground',
      configVersion: 7,
      writer: { namespace: 'v7', authorityConfigVersion: 7 },
    });
  });

  it('durable activo: no evalúa, no escribe, sin writer', () => {
    const runtime: NotificationRuntimeSnapshot = {
      authority: 'durable',
      configVersion: 9,
      activatedAt: 1_700_000_000_000,
    };
    const state = classifyNotificationAuthority({
      userId: 'user-a',
      phase: 'ready',
      runtime,
      backendConfirmed: true,
    });
    expect(state).toEqual<NotificationAuthorityState>({
      kind: 'durable',
      effective: 'durable',
      configVersion: 9,
      writer: null,
    });
  });

  it('activatedAt null es cutover con writer null para cualquier autoridad objetivo', () => {
    const fencedForeground = classifyNotificationAuthority({
      userId: 'user-a',
      phase: 'ready',
      runtime: { authority: 'foreground', configVersion: 3, activatedAt: null },
      backendConfirmed: true,
    });
    expect(fencedForeground).toEqual<NotificationAuthorityState>({
      kind: 'transient',
      effective: 'foreground',
      reason: 'cutover',
      writer: null,
    });

    const fencedDurable = classifyNotificationAuthority({
      userId: 'user-a',
      phase: 'ready',
      runtime: { authority: 'durable', configVersion: 4, activatedAt: null },
      backendConfirmed: true,
    });
    expect(fencedDurable).toEqual<NotificationAuthorityState>({
      kind: 'transient',
      effective: 'durable',
      reason: 'cutover',
      writer: null,
    });
  });

  it('checking sin estado previo cae a compat foreground (autenticado)', () => {
    const state = classifyNotificationAuthority({
      userId: 'user-a',
      phase: 'checking',
      backendConfirmed: false,
    });
    expect(state).toEqual<NotificationAuthorityState>({
      kind: 'transient',
      effective: 'foreground',
      reason: 'checking',
      writer: { namespace: 'compat' },
    });
  });

  it('error transitorio reutiliza solo el último estado confirmado de ESTA cuenta', () => {
    const lastConfirmed: NotificationAuthorityState = {
      kind: 'foreground',
      effective: 'foreground',
      configVersion: 5,
      writer: { namespace: 'v5', authorityConfigVersion: 5 },
    };
    const state = classifyNotificationAuthority({
      userId: 'user-a',
      phase: 'error',
      backendConfirmed: true,
      lastConfirmed,
    });
    expect(state).toEqual<NotificationAuthorityState>({
      kind: 'transient',
      effective: 'foreground',
      reason: 'error',
      writer: { namespace: 'v5', authorityConfigVersion: 5 },
    });
  });

  it('error durable transitorio reutiliza writer null', () => {
    const lastConfirmed: NotificationAuthorityState = {
      kind: 'durable',
      effective: 'durable',
      configVersion: 6,
      writer: null,
    };
    const state = classifyNotificationAuthority({
      userId: 'user-a',
      phase: 'error',
      backendConfirmed: true,
      lastConfirmed,
    });
    expect(state).toEqual<NotificationAuthorityState>({
      kind: 'transient',
      effective: 'durable',
      reason: 'error',
      writer: null,
    });
  });

  it('error sin confirmación previa cae a compat (no hereda otra cuenta)', () => {
    const state = classifyNotificationAuthority({
      userId: 'user-b',
      phase: 'error',
      backendConfirmed: false,
    });
    expect(state).toEqual<NotificationAuthorityState>({
      kind: 'transient',
      effective: 'foreground',
      reason: 'error',
      writer: { namespace: 'compat' },
    });
  });
});

describe('isForegroundWriter — solo escritores foreground pueden presentar', () => {
  it('acepta guest, compat y vN foreground', () => {
    expect(isForegroundWriter({ kind: 'guest', effective: 'foreground', writer: { namespace: 'guest' } })).toBe(true);
    expect(isForegroundWriter({ kind: 'compat', effective: 'foreground', writer: { namespace: 'compat' } })).toBe(true);
    expect(isForegroundWriter({
      kind: 'foreground', effective: 'foreground', configVersion: 2,
      writer: { namespace: 'v2', authorityConfigVersion: 2 },
    })).toBe(true);
  });

  it('rechaza durable, cutover y cualquier writer null', () => {
    expect(isForegroundWriter({ kind: 'durable', effective: 'durable', configVersion: 1, writer: null })).toBe(false);
    expect(isForegroundWriter({ kind: 'transient', effective: 'foreground', reason: 'cutover', writer: null })).toBe(false);
    expect(isForegroundWriter({ kind: 'transient', effective: 'durable', reason: 'cutover', writer: null })).toBe(false);
  });

  it('acepta transient foreground error que reusa un writer foreground', () => {
    expect(isForegroundWriter({
      kind: 'transient', effective: 'foreground', reason: 'error',
      writer: { namespace: 'v5', authorityConfigVersion: 5 },
    })).toBe(true);
    expect(isForegroundWriter({
      kind: 'transient', effective: 'foreground', reason: 'checking',
      writer: { namespace: 'compat' },
    })).toBe(true);
  });
});
