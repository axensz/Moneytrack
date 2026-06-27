'use client';

import React, { useMemo } from 'react';
import type { RecurringPayment } from '../../../../types/finance';
import { effectiveDueDay, getYearlyAnchorMonth } from '../../../../utils/recurringDates';

interface RecurringCalendarProps {
  payments: RecurringPayment[]; // activos
  formatCurrency: (amount: number) => string;
  isPaidForMonth: (paymentId: string, month?: Date) => boolean;
  getDaysOverdue: (payment: RecurringPayment) => number;
  getDaysUntilDue: (payment: RecurringPayment) => number;
}

type PaymentStatus = 'paid' | 'overdue' | 'soon' | 'normal';

const STATUS_DOT: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-500',
  overdue: 'bg-rose-500',
  soon: 'bg-amber-500',
  normal: 'bg-gray-400 dark:bg-gray-500',
};

const STATUS_CHIP: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  overdue: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  soon: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  normal: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/**
 * Calendario mensual de obligaciones: ubica cada pago periódico activo en su día
 * de vencimiento del mes en curso, coloreado por estado.
 */
export const RecurringCalendar: React.FC<RecurringCalendarProps> = ({
  payments,
  formatCurrency,
  isPaidForMonth,
  getDaysOverdue,
  getDaysUntilDue,
}) => {
  const { cells, monthLabel, daysInMonth, todayDate, isCurrentMonth, otherMonth } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    // Offset lunes-primero: getDay() 0=dom..6=sáb → 0=lun..6=dom
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;

    const statusOf = (p: RecurringPayment): PaymentStatus => {
      if (isPaidForMonth(p.id!, now)) return 'paid';
      if (getDaysOverdue(p) > 0) return 'overdue';
      if (getDaysUntilDue(p) <= 3) return 'soon';
      return 'normal';
    };

    // ¿El pago vence en ESTE mes? Mensual: siempre. Anual: solo si su mes ancla
    // (getYearlyAnchorMonth, basado en createdAt) coincide con el mes en curso.
    const isDueThisMonth = (p: RecurringPayment): boolean =>
      p.frequency !== 'yearly' || getYearlyAnchorMonth(p, month) === month;

    // Agrupar SOLO los pagos que vencen este mes, en su día efectivo (acotado al
    // último día real del mes; el centinela "último día" cae también ahí). Los
    // anuales de otros meses se segregan en una nota aparte (no se capean).
    const byDay = new Map<number, { payment: RecurringPayment; status: PaymentStatus }[]>();
    const other: RecurringPayment[] = [];
    for (const p of payments) {
      if (!isDueThisMonth(p)) {
        other.push(p);
        continue;
      }
      const day = effectiveDueDay(p.dueDay, year, month);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push({ payment: p, status: statusOf(p) });
    }

    const list: ({ day: number; items: { payment: RecurringPayment; status: PaymentStatus }[] } | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) list.push(null);
    for (let d = 1; d <= days; d++) {
      list.push({ day: d, items: byDay.get(d) ?? [] });
    }

    return {
      cells: list,
      monthLabel: now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
      daysInMonth: days,
      todayDate: now.getDate(),
      isCurrentMonth: true,
      otherMonth: other,
    };
  }, [payments, isPaidForMonth, getDaysOverdue, getDaysUntilDue]);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-gray-100">
        Vencimientos de <span className="capitalize">{monthLabel}</span>
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Solo los pagos que vencen este mes ({daysInMonth} días)
      </p>

      {/* Encabezado de días */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Cuadrícula */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={`empty-${idx}`} className="min-h-[64px]" />;
          const isToday = isCurrentMonth && cell.day === todayDate;
          return (
            <div
              key={cell.day}
              className={`min-h-[64px] rounded-lg border p-1 flex flex-col gap-0.5 ${
                isToday
                  ? 'border-purple-400 dark:border-purple-500 bg-purple-50/50 dark:bg-purple-900/20'
                  : 'border-gray-100 dark:border-gray-700/60'
              }`}
            >
              <span className={`text-[11px] font-medium ${isToday ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {cell.day}
              </span>
              <div className="flex flex-col gap-0.5">
                {cell.items.slice(0, 2).map(({ payment, status }) => (
                  <div
                    key={payment.id}
                    className={`hidden sm:flex items-center gap-1 px-1 py-0.5 rounded text-[10px] leading-tight truncate ${STATUS_CHIP[status]}`}
                    title={`${payment.name} · ${formatCurrency(payment.amount)}`}
                  >
                    <span className="truncate">{payment.name}</span>
                  </div>
                ))}
                {/* En móvil solo puntos para no saturar */}
                <div className="flex sm:hidden flex-wrap gap-0.5">
                  {cell.items.map(({ payment, status }) => (
                    <span key={payment.id} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} title={payment.name} />
                  ))}
                </div>
                {cell.items.length > 2 && (
                  <span className="hidden sm:block text-[10px] text-gray-400 dark:text-gray-500">
                    +{cell.items.length - 2} más
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Pagado</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Vencido</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Próximo</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> Programado</span>
      </div>
    </div>
  );
};
