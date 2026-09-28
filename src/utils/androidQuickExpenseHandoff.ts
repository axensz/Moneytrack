export const ANDROID_REVIEW_PARAM = 'reviewAndroid';

const ANDROID_REVIEW_CANDIDATE_ID = /^[a-f0-9]{64}$/;

export type AndroidReviewRequest =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'valid'; candidateId: string };

export function readAndroidReviewRequest(search: string): AndroidReviewRequest {
  const params = new URLSearchParams(search);
  if (!params.has(ANDROID_REVIEW_PARAM)) return { kind: 'none' };

  const values = params.getAll(ANDROID_REVIEW_PARAM);
  if (
    values.length !== 1
    || !ANDROID_REVIEW_CANDIDATE_ID.test(values[0] ?? '')
  ) {
    return { kind: 'invalid' };
  }

  return { kind: 'valid', candidateId: values[0] };
}

export function clearAndroidReviewRequest(url: string): string {
  const next = new URL(url);
  next.searchParams.delete(ANDROID_REVIEW_PARAM);
  return next.toString();
}
