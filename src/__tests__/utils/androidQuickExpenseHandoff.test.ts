import { describe, expect, it } from 'vitest';
import {
  clearAndroidReviewRequest,
  readAndroidReviewRequest,
} from '../../utils/androidQuickExpenseHandoff';

const candidateId = 'a'.repeat(64);

describe('androidQuickExpenseHandoff', () => {
  it('reads one opaque lowercase candidate id', () => {
    expect(readAndroidReviewRequest(
      `?view=transactions&reviewAndroid=${candidateId}`,
    )).toEqual({ kind: 'valid', candidateId });
  });

  it.each([
    '?reviewAndroid=',
    '?reviewAndroid=abc',
    `?reviewAndroid=${'A'.repeat(64)}`,
    `?reviewAndroid=${candidateId}&reviewAndroid=${'b'.repeat(64)}`,
  ])('rejects malformed or repeated requests: %s', search => {
    expect(readAndroidReviewRequest(search)).toEqual({ kind: 'invalid' });
  });

  it('distinguishes an absent request from an invalid one', () => {
    expect(readAndroidReviewRequest('?view=transactions')).toEqual({
      kind: 'none',
    });
  });

  it('removes only the Android review parameter and preserves hash and others', () => {
    expect(clearAndroidReviewRequest(
      `https://host/?view=transactions&reviewAndroid=${candidateId}&filter=month#summary`,
    )).toBe('https://host/?view=transactions&filter=month#summary');
  });
});
