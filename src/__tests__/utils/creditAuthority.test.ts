import { describe, expect, it } from 'vitest';
import { TRANSACTION_VALIDATION } from '../../config/constants';
import { getCreditAuthorityState } from '../../utils/creditAuthority';

describe('getCreditAuthorityState', () => {
  it.each([
    ['missing account', undefined],
    ['null account', null],
    ['asset account', { type: 'savings' as const, usedCredit: undefined }],
  ])('treats %s as not applicable', (_label, account) => {
    expect(getCreditAuthorityState(account)).toEqual({
      ready: true,
      status: 'not-applicable',
      usedCredit: null,
    });
  });

  it.each([
    ['absent', undefined],
    ['null', null],
  ])('rejects %s persisted credit authority as missing', (_label, usedCredit) => {
    expect(getCreditAuthorityState({
      type: 'credit',
      usedCredit: usedCredit as unknown as number | undefined,
    })).toEqual({
      ready: false,
      status: 'missing',
      usedCredit: null,
    });
  });

  it.each([
    ['negative', -0.01],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s persisted credit authority as invalid', (_label, usedCredit) => {
    expect(getCreditAuthorityState({ type: 'credit', usedCredit })).toEqual({
      ready: false,
      status: 'invalid',
      usedCredit: null,
    });
  });

  it('rejects persisted credit authority above the monetary boundary', () => {
    expect(getCreditAuthorityState({
      type: 'credit',
      usedCredit: TRANSACTION_VALIDATION.amount.max + 0.01,
    })).toEqual({
      ready: false,
      status: 'out-of-range',
      usedCredit: null,
    });
  });

  it.each([0, 0.01, TRANSACTION_VALIDATION.amount.max])(
    'accepts finite persisted credit authority %s',
    usedCredit => {
      expect(getCreditAuthorityState({ type: 'credit', usedCredit })).toEqual({
        ready: true,
        status: 'ready',
        usedCredit,
      });
    },
  );
});
