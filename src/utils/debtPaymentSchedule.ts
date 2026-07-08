import type { Debt } from '../types/finance';
import { ensureDate } from './dateUtils';

export type DebtPaymentSource = 'direct' | 'monthly';

export interface DebtNextPaymentInfo {
  date: Date;
  source: DebtPaymentSource;
  isOverdue: boolean;
  isOneTimeOverride: boolean;
  expectedPaymentDay?: number;
}

const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

export function normalizePaymentDay(day: unknown): number | undefined {
  if (typeof day !== 'number' || !Number.isFinite(day)) return undefined;
  const normalized = Math.trunc(day);
  return normalized >= 1 && normalized <= 31 ? normalized : undefined;
}

function paymentDateForMonth(day: number, year: number, monthIndex: number): Date {
  const safeDay = Math.min(day, daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, safeDay);
}

export function addMonthsClamped(source: Date, months: number): Date {
  const base = startOfLocalDay(source);
  const wholeMonths = Math.max(0, Math.trunc(months));
  return paymentDateForMonth(base.getDate(), base.getFullYear(), base.getMonth() + wholeMonths);
}

export function getNextMonthlyPaymentDate(day: number, today: Date = new Date()): Date | null {
  const normalizedDay = normalizePaymentDay(day);
  if (!normalizedDay) return null;

  const todayStart = startOfLocalDay(today);
  let candidate = paymentDateForMonth(
    normalizedDay,
    todayStart.getFullYear(),
    todayStart.getMonth(),
  );

  if (candidate < todayStart) {
    candidate = paymentDateForMonth(
      normalizedDay,
      todayStart.getFullYear(),
      todayStart.getMonth() + 1,
    );
  }

  return candidate;
}

export function getDebtNextPaymentInfo(
  debt: Pick<Debt, 'isSettled' | 'nextPaymentDate' | 'expectedPaymentDay'>,
  today: Date = new Date(),
): DebtNextPaymentInfo | null {
  if (debt.isSettled) return null;

  const todayStart = startOfLocalDay(today);
  const expectedPaymentDay = normalizePaymentDay(debt.expectedPaymentDay);
  const directDate = debt.nextPaymentDate
    ? startOfLocalDay(ensureDate(debt.nextPaymentDate))
    : null;
  const hasValidDirectDate = !!directDate && !Number.isNaN(directDate.getTime());

  if (hasValidDirectDate && (directDate >= todayStart || !expectedPaymentDay)) {
    return {
      date: directDate,
      source: 'direct',
      isOverdue: directDate < todayStart,
      isOneTimeOverride: Boolean(expectedPaymentDay),
      ...(expectedPaymentDay ? { expectedPaymentDay } : {}),
    };
  }

  if (expectedPaymentDay) {
    const nextMonthlyDate = getNextMonthlyPaymentDate(expectedPaymentDay, todayStart);
    if (!nextMonthlyDate) return null;
    return {
      date: nextMonthlyDate,
      source: 'monthly',
      isOverdue: false,
      isOneTimeOverride: false,
      expectedPaymentDay,
    };
  }

  return null;
}

export function compareDebtsByNextPayment(a: Debt, b: Debt, today: Date = new Date()): number {
  const aInfo = getDebtNextPaymentInfo(a, today);
  const bInfo = getDebtNextPaymentInfo(b, today);

  if (!aInfo && !bInfo) return 0;
  if (!aInfo) return 1;
  if (!bInfo) return -1;

  return aInfo.date.getTime() - bInfo.date.getTime();
}
