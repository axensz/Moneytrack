import type { Account } from '../../../../types/finance';
import type { CreditAuthorityState } from '../../../../utils/creditAuthority';

export type BalanceVisualTone = 'success' | 'destructive' | 'warning' | 'neutral' | 'muted';

export const BALANCE_TONE_CLASSES: Record<BalanceVisualTone, string> = {
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
  neutral: 'text-foreground',
  muted: 'text-muted-foreground',
};

export const PROGRESS_BAR_TONE_CLASSES = {
  primary: 'bg-primary',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
} as const;

export interface CreditBreakdownPresentation {
  usedAmount: number;
  limitAmount: number;
  formattedUsed: string;
  formattedLimit: string;
  usagePercentage: number;
  isHighUsage: boolean;
  isOverLimit: boolean;
  isExhausted: boolean;
  progressBarWidth: string;
  progressBarTone: keyof typeof PROGRESS_BAR_TONE_CLASSES;
}

export interface AccountBalancePresentation {
  primaryLabel?: string;
  formattedAmount: string;
  accessibleAmountLabel: string;
  tone: BalanceVisualTone;
  toneClass: string;
  isSettling: boolean;
  isUnreconciled: boolean;
  unreconciledBadgeText?: string;
  credit?: CreditBreakdownPresentation;
}

export interface GetAccountBalancePresentationParams {
  account: Account;
  balance: number;
  creditUsed: number;
  creditAuthority: CreditAuthorityState;
  balanceSettling: boolean;
  hideBalances: boolean;
  formatCurrency: (amount: number) => string;
}

/**
 * 🟢 Deriva el estado visual determinista de montos para tarjetas de cuenta (The Confident Ledger).
 * Desacopla la lógica financiera y de negocio de la vista JSX.
 */
export function getAccountBalancePresentation({
  account,
  balance,
  creditUsed,
  creditAuthority,
  balanceSettling,
  hideBalances,
  formatCurrency,
}: GetAccountBalancePresentationParams): AccountBalancePresentation {
  const isCredit = account.type === 'credit';
  const displayAmount = (amount: number) => (hideBalances ? '••••••' : formatCurrency(amount));

  if (isCredit) {
    const creditLimit = Math.max(0, account.creditLimit ?? 0);
    const sanitizedUsed = Math.max(0, creditUsed ?? 0);
    const usagePercentage = creditLimit > 0
      ? Math.min(100, Math.max(0, (sanitizedUsed / creditLimit) * 100))
      : 0;

    const isOverLimit = creditLimit > 0 && sanitizedUsed > creditLimit;
    const isExhausted = creditLimit > 0 && sanitizedUsed === creditLimit;
    const isHighUsage = creditLimit > 0 && sanitizedUsed > creditLimit * 0.8;

    const progressBarTone = isOverLimit
      ? 'destructive'
      : isHighUsage || isExhausted
        ? 'warning'
        : 'primary';

    const creditBreakdown: CreditBreakdownPresentation = {
      usedAmount: sanitizedUsed,
      limitAmount: creditLimit,
      formattedUsed: displayAmount(sanitizedUsed),
      formattedLimit: displayAmount(creditLimit),
      usagePercentage,
      isHighUsage,
      isOverLimit,
      isExhausted,
      progressBarWidth: hideBalances ? '0%' : `${usagePercentage}%`,
      progressBarTone,
    };

    if (!creditAuthority.ready) {
      return {
        primaryLabel: 'Disponible',
        formattedAmount: 'Por conciliar',
        accessibleAmountLabel: 'Estado de cupo: Por conciliar',
        tone: 'warning',
        toneClass: BALANCE_TONE_CLASSES.warning,
        isSettling: false,
        isUnreconciled: true,
        unreconciledBadgeText: 'Por conciliar',
        credit: creditBreakdown,
      };
    }

    let tone: BalanceVisualTone = 'success';
    if (isOverLimit) {
      tone = 'destructive';
    } else if (isHighUsage || isExhausted || balance === 0) {
      tone = 'warning';
    }

    const accessibleAmountLabel = hideBalances
      ? 'Cupo disponible oculto por privacidad'
      : isOverLimit
        ? `Cupo disponible: ${formatCurrency(balance)} (Sobrecupo)`
        : isExhausted
          ? `Cupo disponible: ${formatCurrency(balance)} (Cupo agotado)`
          : `Cupo disponible: ${formatCurrency(balance)}`;

    return {
      primaryLabel: 'Disponible',
      formattedAmount: displayAmount(balance),
      accessibleAmountLabel,
      tone,
      toneClass: BALANCE_TONE_CLASSES[tone],
      isSettling: false,
      isUnreconciled: false,
      credit: creditBreakdown,
    };
  }

  // Cuentas de Ahorros y Efectivo
  if (balanceSettling) {
    return {
      formattedAmount: 'Calculando…',
      accessibleAmountLabel: 'Calculando saldo disponible…',
      tone: 'muted',
      toneClass: BALANCE_TONE_CLASSES.muted,
      isSettling: true,
      isUnreconciled: false,
    };
  }

  let tone: BalanceVisualTone = 'success';
  let accessibleAmountLabel = hideBalances
    ? 'Saldo disponible oculto por privacidad'
    : `Saldo disponible: ${formatCurrency(balance)}`;

  if (balance === 0) {
    tone = 'neutral';
  } else if (balance < 0) {
    tone = 'destructive';
    if (!hideBalances) {
      accessibleAmountLabel = `Saldo disponible en sobregiro: ${formatCurrency(balance)}`;
    }
  }

  return {
    formattedAmount: displayAmount(balance),
    accessibleAmountLabel,
    tone,
    toneClass: BALANCE_TONE_CLASSES[tone],
    isSettling: false,
    isUnreconciled: false,
  };
}
