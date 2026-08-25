import { TRANSACTION_VALIDATION } from '../config/constants';
import type { Account } from '../types/finance';

export type CreditAuthorityStatus =
  | 'not-applicable'
  | 'ready'
  | 'missing'
  | 'invalid'
  | 'out-of-range';

export interface CreditAuthorityState {
  ready: boolean;
  status: CreditAuthorityStatus;
  usedCredit: number | null;
}

export function getCreditAuthorityState(
  account: Pick<Account, 'type' | 'usedCredit'> | null | undefined
): CreditAuthorityState {
  if (!account || account.type !== 'credit') {
    return { ready: true, status: 'not-applicable', usedCredit: null };
  }

  if (account.usedCredit === undefined || account.usedCredit === null) {
    return { ready: false, status: 'missing', usedCredit: null };
  }

  if (!Number.isFinite(account.usedCredit) || account.usedCredit < 0) {
    return { ready: false, status: 'invalid', usedCredit: null };
  }

  if (account.usedCredit > TRANSACTION_VALIDATION.amount.max) {
    return { ready: false, status: 'out-of-range', usedCredit: null };
  }

  return { ready: true, status: 'ready', usedCredit: account.usedCredit };
}

