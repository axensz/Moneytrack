/**
 * Deterministic notification tags.
 *
 * The service worker reuses one tag per (event, device) so a retry or a newer
 * revision replaces the previous OS notification instead of stacking. The tag
 * is a short hashed value; it carries no financial detail.
 */

import { createHash } from 'node:crypto';

/** Stable per-(event, device) tag. Hashed so it never leaks the raw event key. */
export const buildBudgetEventTag = (eventId: string, deviceId: string): string => {
  const digest = createHash('sha256').update(`${eventId}\0${deviceId}`, 'utf8').digest('hex');
  return `mt-${digest.slice(0, 24)}`;
};
