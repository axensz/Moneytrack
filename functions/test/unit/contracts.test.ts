import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  FUNCTIONS_REGION,
  MAX_ACTIVE_DEVICES,
  MAX_PAYLOAD_BYTES,
  DELIVERY_ATTEMPT_LIMIT,
  DELIVERY_WINDOW_HOURS,
  USER_ATTEMPTS_PER_ROLLING_HOUR,
  eventIdFor,
  deliveryIdFor,
  endpointHashFor,
  accountScopeForNewRuntime,
  isValidAccountScope,
  assertAccountScope,
  isValidUuid,
  assertUuid,
  isValidDeviceId,
  NOTIFICATION_COPY,
  buildPayload,
  isPayloadKind,
  assertMonotonicRevision,
  assertPositiveGeneration,
  parseIsoDateString,
  isDeliveryState,
  DELIVERY_STATES,
  parseRuntimePrivateDocument,
} from '../../src/notifications/contracts.js';

import { resolveInvocationPath } from '../../src/admin/cliRuntime.js';

const hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

describe('contract constants', () => {
  it('exposes the fixed product constants', () => {
    expect(FUNCTIONS_REGION).toBe('us-central1');
    expect(MAX_ACTIVE_DEVICES).toBe(5);
    expect(MAX_PAYLOAD_BYTES).toBe(4096);
    expect(DELIVERY_ATTEMPT_LIMIT).toBe(5);
    expect(DELIVERY_WINDOW_HOURS).toBe(24);
    expect(USER_ATTEMPTS_PER_ROLLING_HOUR).toBe(60);
  });
});

describe('deterministic SHA-256 identifiers', () => {
  it('eventIdFor is lowercase hex SHA-256 of v1\\0<eventKey>', () => {
    const eventKey = 'daily:2026-08-30';
    const expected = hex(`v1\0${eventKey}`);
    expect(eventIdFor(eventKey)).toBe(expected);
    expect(eventIdFor(eventKey)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deliveryIdFor combines all fields with NUL separators', () => {
    const input = {
      accountScope: 'AAAAAAAAAAAAAAAAAAAAAA',
      eventId: eventIdFor('daily:2026-08-30'),
      eventRevision: 3,
      deviceId: '123e4567-e89b-12d3-a456-426614174000',
    };
    const expected = hex(
      `v1\0${input.accountScope}\0${input.eventId}\0${input.eventRevision}\0${input.deviceId}`,
    );
    expect(deliveryIdFor(input)).toBe(expected);
  });

  it('endpointHashFor is a bare lowercase hex SHA-256 of the endpoint', () => {
    const endpoint = 'https://push.example.com/abc';
    expect(endpointHashFor(endpoint)).toBe(hex(endpoint));
  });
});

describe('account scope', () => {
  it('generates a 22-character base64url scope', () => {
    const scope = accountScopeForNewRuntime();
    expect(scope).toHaveLength(22);
    expect(isValidAccountScope(scope)).toBe(true);
    expect(scope).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('validates length and alphabet strictly', () => {
    expect(isValidAccountScope('AAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
    expect(isValidAccountScope('short')).toBe(false);
    expect(isValidAccountScope('AAAAAAAAAAAAAAAAAAAAA=')).toBe(false); // padding
    expect(isValidAccountScope('AAAAAAAAAAAAAAAAAAAA/+')).toBe(false); // standard b64
    expect(isValidAccountScope('AAAAAAAAAAAAAAAAAAAAAAA')).toBe(false); // 23
    expect(() => assertAccountScope('nope')).toThrow();
    expect(assertAccountScope('AAAAAAAAAAAAAAAAAAAAAA')).toBe('AAAAAAAAAAAAAAAAAAAAAA');
  });
});

describe('uuid and device id validation', () => {
  it('accepts canonical 36-char UUIDs and rejects others', () => {
    expect(isValidUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isValidUuid('123E4567-E89B-12D3-A456-426614174000')).toBe(true);
    expect(isValidUuid('123e4567e89b12d3a456426614174000')).toBe(false);
    expect(isValidUuid('123e4567-e89b-12d3-a456-42661417400')).toBe(false);
    expect(isValidUuid(' 123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    expect(() => assertUuid('bad')).toThrow();
  });

  it('device id is a canonical UUID', () => {
    expect(isValidDeviceId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isValidDeviceId('not-a-uuid')).toBe(false);
  });
});

describe('closed payload kind/action/copy table', () => {
  it('recognizes exactly the four kinds', () => {
    expect(isPayloadKind('daily')).toBe(true);
    expect(isPayloadKind('recurring')).toBe(true);
    expect(isPayloadKind('debt')).toBe(true);
    expect(isPayloadKind('test')).toBe(true);
    expect(isPayloadKind('budget')).toBe(false);
    expect(isPayloadKind('')).toBe(false);
  });

  it('exposes the exact approved copy table', () => {
    expect(NOTIFICATION_COPY).toEqual({
      daily: {
        title: 'Registro diario pendiente',
        body: 'Abre MoneyTrack para revisar tu registro diario.',
        actionUrl: '/',
      },
      recurring: {
        title: 'Recordatorio de pago',
        body: 'Abre MoneyTrack para revisar un pago recurrente.',
        actionUrl: '/?view=recurring',
      },
      debt: {
        title: 'Recordatorio de deuda',
        body: 'Abre MoneyTrack para revisar una deuda.',
        actionUrl: '/?view=debts',
      },
      test: {
        title: 'Prueba de notificaciones',
        body: 'MoneyTrack puede enviar notificaciones a este dispositivo.',
        actionUrl: '/',
      },
    });
  });

  it('builds a payload with constant copy for a kind', () => {
    const payload = buildPayload({
      kind: 'recurring',
      accountScope: 'AAAAAAAAAAAAAAAAAAAAAA',
      eventId: eventIdFor('recurring:x'),
      eventRevision: 1,
      expiresAt: '2026-08-31T00:00:00.000Z',
      notificationTag: 'moneytrack-recurring',
    });
    expect(payload.title).toBe('Recordatorio de pago');
    expect(payload.body).toBe('Abre MoneyTrack para revisar un pago recurrente.');
    expect(payload.actionUrl).toBe('/?view=recurring');
    expect(payload.kind).toBe('recurring');
  });

  it('rejects an unknown kind when building', () => {
    expect(() =>
      buildPayload({
        // @ts-expect-error unknown kind
        kind: 'budget',
        accountScope: 'AAAAAAAAAAAAAAAAAAAAAA',
        eventId: eventIdFor('x'),
        eventRevision: 1,
        expiresAt: '2026-08-31T00:00:00.000Z',
        notificationTag: 'moneytrack-x',
      }),
    ).toThrow();
  });
});

describe('monotonic revisions and generations', () => {
  it('requires strictly increasing positive revisions', () => {
    expect(assertMonotonicRevision(0, 1)).toBe(1);
    expect(assertMonotonicRevision(1, 2)).toBe(2);
    expect(() => assertMonotonicRevision(2, 2)).toThrow();
    expect(() => assertMonotonicRevision(3, 2)).toThrow();
    expect(() => assertMonotonicRevision(0, 0)).toThrow();
    expect(() => assertMonotonicRevision(0, -1)).toThrow();
  });

  it('requires positive integer generations', () => {
    expect(assertPositiveGeneration(1)).toBe(1);
    expect(() => assertPositiveGeneration(0)).toThrow();
    expect(() => assertPositiveGeneration(-2)).toThrow();
    expect(() => assertPositiveGeneration(1.5)).toThrow();
  });
});

describe('ISO date-string parsing', () => {
  it('parses a valid ISO date-time string to a Date', () => {
    const d = parseIsoDateString('2026-08-30T09:00:00.000Z');
    expect(d.toISOString()).toBe('2026-08-30T09:00:00.000Z');
  });

  it('rejects malformed or non-ISO strings', () => {
    expect(() => parseIsoDateString('2026-13-40')).toThrow();
    expect(() => parseIsoDateString('not a date')).toThrow();
    expect(() => parseIsoDateString('')).toThrow();
  });
});

describe('delivery-state union', () => {
  it('recognizes only the closed set of states', () => {
    for (const s of DELIVERY_STATES) {
      expect(isDeliveryState(s)).toBe(true);
    }
    expect(isDeliveryState('pending')).toBe(true);
    expect(isDeliveryState('unknown-state')).toBe(false);
  });
});

describe('reject-unknown-keys parsers', () => {
  it('parses a valid runtime-private document', () => {
    const doc = parseRuntimePrivateDocument({
      accountScope: 'AAAAAAAAAAAAAAAAAAAAAA',
      authorityConfigVersion: 1,
      activatedAt: '2026-08-30T09:00:00.000Z',
    });
    expect(doc.accountScope).toBe('AAAAAAAAAAAAAAAAAAAAAA');
    expect(doc.authorityConfigVersion).toBe(1);
  });

  it('rejects unknown keys', () => {
    expect(() =>
      parseRuntimePrivateDocument({
        accountScope: 'AAAAAAAAAAAAAAAAAAAAAA',
        authorityConfigVersion: 1,
        activatedAt: '2026-08-30T09:00:00.000Z',
        extra: 'nope',
      }),
    ).toThrow();
  });

  it('rejects invalid account scope inside the document', () => {
    expect(() =>
      parseRuntimePrivateDocument({
        accountScope: 'too-short',
        authorityConfigVersion: 1,
        activatedAt: null,
      }),
    ).toThrow();
  });
});

// --- Admin CLI runtime path resolution (security-critical) ---

const makeFakeRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-repo-'));
  fs.writeFileSync(path.join(root, '.firebaserc'), '{"projects":{"default":"demo-moneytrack"}}');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"moneytrack"}');
  fs.mkdirSync(path.join(root, 'functions'));
  fs.writeFileSync(path.join(root, 'functions', 'package.json'), '{"name":"moneytrack-functions"}');
  return fs.realpathSync(root);
};

describe('resolveInvocationPath (repo-root relative)', () => {
  it('resolves a repo-relative flag beneath the validated INIT_CWD root', () => {
    const root = makeFakeRepo();
    fs.mkdirSync(path.join(root, 'openspec'));
    fs.writeFileSync(path.join(root, 'openspec', 'manifest.json'), '{}');
    const resolved = resolveInvocationPath({
      env: { INIT_CWD: root },
      relativePath: 'openspec/manifest.json',
      mustExist: true,
    });
    expect(resolved).toBe(fs.realpathSync(path.join(root, 'openspec', 'manifest.json')));
  });

  it('rejects when INIT_CWD is missing', () => {
    expect(() =>
      resolveInvocationPath({ env: {}, relativePath: 'package.json', mustExist: true }),
    ).toThrow();
  });

  it('rejects when INIT_CWD is not a valid repository root', () => {
    const notRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-notroot-'));
    expect(() =>
      resolveInvocationPath({
        env: { INIT_CWD: notRoot },
        relativePath: 'package.json',
        mustExist: true,
      }),
    ).toThrow();
  });

  it('rejects a missing required repo-relative path', () => {
    const root = makeFakeRepo();
    expect(() =>
      resolveInvocationPath({
        env: { INIT_CWD: root },
        relativePath: 'openspec/missing.json',
        mustExist: true,
      }),
    ).toThrow();
  });

  it('rejects path traversal that escapes the repo root', () => {
    const root = makeFakeRepo();
    expect(() =>
      resolveInvocationPath({
        env: { INIT_CWD: root },
        relativePath: '../escape.json',
        mustExist: false,
      }),
    ).toThrow();
  });

  it('rejects a symlink that escapes the repo root', () => {
    const root = makeFakeRepo();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-outside-'));
    const secret = path.join(outside, 'secret.json');
    fs.writeFileSync(secret, '{}');
    const link = path.join(root, 'link.json');
    try {
      fs.symlinkSync(secret, link);
    } catch {
      // Symlink creation may require privileges on Windows; skip if unavailable.
      return;
    }
    expect(() =>
      resolveInvocationPath({
        env: { INIT_CWD: root },
        relativePath: 'link.json',
        mustExist: true,
      }),
    ).toThrow();
  });

  it('accepts a private output only beneath os.tmpdir()', () => {
    const root = makeFakeRepo();
    const tmpOut = path.join(fs.realpathSync(os.tmpdir()), 'mt-private-out.json');
    const resolved = resolveInvocationPath({
      env: { INIT_CWD: root },
      externalPath: tmpOut,
      scope: 'tmpdir',
      mustExist: false,
    });
    expect(resolved.startsWith(fs.realpathSync(os.tmpdir()))).toBe(true);
  });

  it('rejects a private output outside os.tmpdir()', () => {
    const root = makeFakeRepo();
    expect(() =>
      resolveInvocationPath({
        env: { INIT_CWD: root },
        externalPath: path.join(root, 'not-tmp.json'),
        scope: 'tmpdir',
        mustExist: false,
      }),
    ).toThrow();
  });

  it('accepts --github-env only when GITHUB_ACTIONS=true and it equals GITHUB_ENV', () => {
    const root = makeFakeRepo();
    const ghEnv = path.join(fs.realpathSync(os.tmpdir()), 'gh-env-file');
    fs.writeFileSync(ghEnv, '');
    const resolved = resolveInvocationPath({
      env: { INIT_CWD: root, GITHUB_ACTIONS: 'true', GITHUB_ENV: ghEnv },
      externalPath: ghEnv,
      scope: 'github-env',
      mustExist: true,
    });
    expect(resolved).toBe(fs.realpathSync(ghEnv));
  });

  it('rejects --github-env when GITHUB_ACTIONS is not true', () => {
    const root = makeFakeRepo();
    const ghEnv = path.join(fs.realpathSync(os.tmpdir()), 'gh-env-file2');
    fs.writeFileSync(ghEnv, '');
    expect(() =>
      resolveInvocationPath({
        env: { INIT_CWD: root, GITHUB_ACTIONS: 'false', GITHUB_ENV: ghEnv },
        externalPath: ghEnv,
        scope: 'github-env',
        mustExist: true,
      }),
    ).toThrow();
  });

  it('rejects --github-env when the path does not equal GITHUB_ENV', () => {
    const root = makeFakeRepo();
    const ghEnv = path.join(fs.realpathSync(os.tmpdir()), 'gh-env-file3');
    const other = path.join(fs.realpathSync(os.tmpdir()), 'gh-env-other');
    fs.writeFileSync(ghEnv, '');
    fs.writeFileSync(other, '');
    expect(() =>
      resolveInvocationPath({
        env: { INIT_CWD: root, GITHUB_ACTIONS: 'true', GITHUB_ENV: ghEnv },
        externalPath: other,
        scope: 'github-env',
        mustExist: true,
      }),
    ).toThrow();
  });

  it('rejects a github-env path from passing through the generic repo escape', () => {
    const root = makeFakeRepo();
    const ghEnv = path.join(fs.realpathSync(os.tmpdir()), 'gh-env-file4');
    fs.writeFileSync(ghEnv, '');
    // A repo-relative resolution must never accept an absolute external path.
    expect(() =>
      resolveInvocationPath({
        env: { INIT_CWD: root, GITHUB_ACTIONS: 'true', GITHUB_ENV: ghEnv },
        relativePath: ghEnv,
        mustExist: true,
      }),
    ).toThrow();
  });
});
