import { describe, expect, it } from 'vitest';
import {
  createAccountOperationId,
  type AccountOperationKind,
} from '../../hooks/firestore/accountOrchestration';

describe('AccountOperationKind', () => {
  it('uses the shared account lease for ledger mutations', () => {
    const kind: AccountOperationKind = 'ledger-mutation';

    expect(createAccountOperationId(kind)).toMatch(/^ledger-mutation:/);
  });
});
