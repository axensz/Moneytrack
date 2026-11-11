const MAX_MONEY = 1_000_000_000;
const INTEREST_LIMIT_MESSAGE = 'El interés acumulado supera el límite del préstamo';
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const validMoney = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= MAX_MONEY;
const validCutoff = (day: number): boolean => Number.isInteger(day) && day >= 1 && day <= 31;

function asDate(value: unknown): Date | null {
  try {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
      return asDate(value.toDate());
    }
    if (typeof value !== 'string') return null;
    // Date-only values represent a local calendar day, not midnight UTC.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(dateOnly ? `${value}T00:00:00-05:00` : value);
    if (!Number.isFinite(parsed.getTime())) return null;
    if (dateOnly && bogotaDate(parsed).toISOString().slice(0, 10) !== value) return null;
    return parsed;
  } catch {
    return null;
  }
}

function bogotaDate(date: Date): Date {
  return new Date(date.getTime() - BOGOTA_OFFSET_MS);
}

function cutoffDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)) + BOGOTA_OFFSET_MS);
}

export function calculateMonthlyInterestCharge(principal: number, mode: 'percentage' | 'card', rate: number): number {
  if (!validMoney(principal) || !Number.isFinite(rate) || rate < 0 || (mode !== 'percentage' && mode !== 'card')) {
    throw new RangeError('Invalid monthly interest principal or rate.');
  }
  const monthlyRate = mode === 'card' ? Math.pow(1 + rate / 100, 1 / 12) - 1 : rate / 100;
  const charge = roundMoney(principal * monthlyRate);
  if (!validMoney(charge)) throw new RangeError(INTEREST_LIMIT_MESSAGE);
  return charge;
}

export function getFirstInterestDate(origin: unknown, cutoffDay: number): Date {
  const date = asDate(origin);
  if (!date || !validCutoff(cutoffDay)) throw new RangeError('Invalid loan origin or cutoff day.');
  const local = bogotaDate(date);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const cutoff = cutoffDate(year, month, cutoffDay);
  return bogotaDate(cutoff).getUTCDate() > local.getUTCDate()
    ? cutoff
    : cutoffDate(year, month + 1, cutoffDay);
}

export function getMonthlyInterestAccrual(debt: {
  originalAmount: number;
  remainingAmount: number;
  isSettled: boolean;
  totalInterestAmount?: number;
  interestAccrual?: 'upfront' | 'monthly';
  interestMode?: 'fixed' | 'percentage' | 'card';
  interestRate?: number;
  interestCutoffDay?: number;
  nextInterestDate?: unknown;
}, now: Date): { totalInterestAmount: number; remainingAmount: number; nextInterestDate: Date } | null {
  if (debt.interestAccrual !== 'monthly' || debt.isSettled || debt.remainingAmount <= 0
    || !validMoney(debt.originalAmount) || debt.originalAmount <= 0 || !validMoney(debt.remainingAmount)
    || !validMoney(debt.totalInterestAmount ?? 0) || !validCutoff(debt.interestCutoffDay ?? 0)
    || !Number.isFinite(debt.interestRate) || (debt.interestRate ?? -1) < 0
    || (debt.interestMode !== 'percentage' && debt.interestMode !== 'card') || !asDate(now)) return null;

  const nextDate = asDate(debt.nextInterestDate);
  if (!nextDate || nextDate.getTime() > now.getTime()) return null;
  const cutoff = debt.interestCutoffDay!;
  const localNext = bogotaDate(nextDate);
  const localNow = bogotaDate(now);
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();
  const currentCut = cutoffDate(year, month, cutoff);
  const monthsDue = (year - localNext.getUTCFullYear()) * 12 + month - localNext.getUTCMonth()
    + (currentCut.getTime() <= now.getTime() ? 1 : 0);
  if (monthsDue <= 0) return null;

  const charge = calculateMonthlyInterestCharge(debt.originalAmount, debt.interestMode, debt.interestRate!);
  const totalInterestAmount = roundMoney((debt.totalInterestAmount ?? 0) + charge * monthsDue);
  const remainingAmount = roundMoney(debt.remainingAmount + charge * monthsDue);
  if (!validMoney(totalInterestAmount) || !validMoney(remainingAmount)
    || !validMoney(roundMoney(debt.originalAmount + totalInterestAmount))) throw new RangeError(INTEREST_LIMIT_MESSAGE);
  return {
    totalInterestAmount,
    remainingAmount,
    nextInterestDate: cutoffDate(year, month + (currentCut.getTime() <= now.getTime() ? 1 : 0), cutoff),
  };
}
