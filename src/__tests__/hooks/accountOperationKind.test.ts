import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAccountOperationId,
  type AccountOperationKind,
} from '../../hooks/firestore/accountOrchestration';

describe('AccountOperationKind', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the shared account lease for ledger mutations', () => {
    const kind: AccountOperationKind = 'ledger-mutation';

    expect(createAccountOperationId(kind)).toMatch(/^ledger-mutation:/);
  });

  it('uses cryptographic bytes when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.forEach((_, index) => {
          bytes[index] = index;
        });
        return bytes;
      },
    });
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });

    expect(createAccountOperationId('ledger-mutation')).toBe(
      'ledger-mutation:000102030405060708090a0b0c0d0e0f'
    );
  });

  it('fails closed when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    expect(() => createAccountOperationId('ledger-mutation'))
      .toThrow(/identidad criptográfica segura/i);
  });
});
