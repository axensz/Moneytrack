import type { Debt } from '../../../types/finance';

export const FORGIVEN_LABELS: Record<NonNullable<Debt['forgivenReason']>, string> = {
  unpaid: 'No pagada',
  gift: 'Regalo',
  other: 'Otro',
};
