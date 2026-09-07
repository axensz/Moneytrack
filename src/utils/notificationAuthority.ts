/**
 * Máquina de autoridad de notificación foreground (Task 3).
 *
 * Una sola generación admitida escribe/presenta a la vez. La presentación
 * foreground solo puede ocurrir cuando el escritor admitido es foreground
 * (guest, compat o `vN`). Durable y `activatedAt: null` (cutover) fencean:
 * no evalúan, no escriben, no presentan (writer null). Un error/checking
 * transitorio reutiliza únicamente el último estado confirmado de ESTA cuenta;
 * nunca hereda otra cuenta ni promete entrega con la página cerrada.
 *
 * Función pura: sin I/O ni React. El hook `useNotificationAuthority` la alimenta.
 */

export type NotificationWriter =
  | { namespace: 'guest' }
  | { namespace: 'compat' }
  | { namespace: `v${number}`; authorityConfigVersion: number };

export type NotificationAuthorityState =
  | { kind: 'guest'; effective: 'foreground'; writer: { namespace: 'guest' } }
  | { kind: 'compat'; effective: 'foreground'; writer: { namespace: 'compat' } }
  | {
      kind: 'foreground';
      effective: 'foreground';
      configVersion: number;
      writer: { namespace: `v${number}`; authorityConfigVersion: number };
    }
  | { kind: 'durable'; effective: 'durable'; configVersion: number; writer: null }
  | {
      kind: 'transient';
      effective: 'foreground';
      reason: 'checking' | 'error';
      writer:
        | { namespace: 'compat' }
        | { namespace: `v${number}`; authorityConfigVersion: number };
    }
  | { kind: 'transient'; effective: 'durable'; reason: 'checking' | 'error'; writer: null }
  | {
      kind: 'transient';
      effective: 'foreground' | 'durable';
      reason: 'cutover';
      writer: null;
    };

/** Snapshot saneado del documento `users/{uid}/notificationRuntime/state`. */
export interface NotificationRuntimeSnapshot {
  authority: 'foreground' | 'durable';
  configVersion: number;
  /** Milisegundos epoch; `null` fencea ambos escritores (cutover en curso). */
  activatedAt: number | null;
}

export type NotificationAuthorityPhase = 'ready' | 'checking' | 'error';

export interface ClassifyNotificationAuthorityInput {
  userId: string | null;
  phase: NotificationAuthorityPhase;
  /** Documento runtime saneado. `null` = ausente confirmado. `undefined` = aún no observado. */
  runtime?: NotificationRuntimeSnapshot | null;
  /** Bit persistido tras la primera respuesta de estado exitosa de la cuenta. */
  backendConfirmed?: boolean;
  /** Último estado confirmado de ESTA cuenta, para reusar en error/checking. */
  lastConfirmed?: NotificationAuthorityState | null;
}

const COMPAT_STATE = (
  reason: 'checking' | 'error',
): NotificationAuthorityState => ({
  kind: 'transient',
  effective: 'foreground',
  reason,
  writer: { namespace: 'compat' },
});

/**
 * Reproyecta un estado confirmado como transitorio con el motivo dado,
 * preservando su escritor y su autoridad efectiva. Solo se usa con el último
 * confirmado de la MISMA cuenta.
 */
const reuseConfirmed = (
  confirmed: NotificationAuthorityState,
  reason: 'checking' | 'error',
): NotificationAuthorityState => {
  if (confirmed.effective === 'durable') {
    return { kind: 'transient', effective: 'durable', reason, writer: null };
  }
  // foreground efectivo: reusa su escritor (compat o vN).
  if (confirmed.writer && confirmed.writer.namespace !== 'guest') {
    return {
      kind: 'transient',
      effective: 'foreground',
      reason,
      writer: confirmed.writer,
    };
  }
  return COMPAT_STATE(reason);
};

const fromRuntime = (
  runtime: NotificationRuntimeSnapshot,
): NotificationAuthorityState => {
  if (runtime.activatedAt === null) {
    return {
      kind: 'transient',
      effective: runtime.authority,
      reason: 'cutover',
      writer: null,
    };
  }
  if (runtime.authority === 'durable') {
    return {
      kind: 'durable',
      effective: 'durable',
      configVersion: runtime.configVersion,
      writer: null,
    };
  }
  return {
    kind: 'foreground',
    effective: 'foreground',
    configVersion: runtime.configVersion,
    writer: {
      namespace: `v${runtime.configVersion}`,
      authorityConfigVersion: runtime.configVersion,
    },
  };
};

export function classifyNotificationAuthority(
  input: ClassifyNotificationAuthorityInput,
): NotificationAuthorityState {
  const { userId, phase, runtime, backendConfirmed, lastConfirmed } = input;

  if (!userId) {
    return { kind: 'guest', effective: 'foreground', writer: { namespace: 'guest' } };
  }

  if (phase === 'error') {
    if (lastConfirmed) return reuseConfirmed(lastConfirmed, 'error');
    return COMPAT_STATE('error');
  }

  if (phase === 'checking') {
    if (lastConfirmed) return reuseConfirmed(lastConfirmed, 'checking');
    return COMPAT_STATE('checking');
  }

  // phase === 'ready'
  if (runtime === null || runtime === undefined) {
    // Runtime ausente confirmado → compatibilidad. `backendConfirmed` no cambia
    // el resultado (compat), pero se preserva por claridad de contrato.
    void backendConfirmed;
    return { kind: 'compat', effective: 'foreground', writer: { namespace: 'compat' } };
  }
  return fromRuntime(runtime);
}

/**
 * Solo un escritor foreground con writer no-nulo puede presentar/escribir un
 * evento de recordatorio. Durable y cutover (writer null) devuelven false.
 */
export function isForegroundWriter(state: NotificationAuthorityState): boolean {
  return state.effective === 'foreground' && state.writer !== null;
}
