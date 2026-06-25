/**
 * Helpers PUROS de ciclos de facturación de tarjetas, generalizados a CUALQUIER
 * ciclo, indexado por entero relativo al ciclo actual:
 *   index 0 = ciclo actual (el que cierra en el próximo corte); <0 pasados; >0 futuros.
 * Reusa effectiveDueDay para acotar el día de corte/pago a fin de mes.
 */
import { effectiveDueDay } from './recurringDates';

export interface CreditCycle {
  index: number;
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
}

/** Mes/año del cierre (cutoff) del ciclo ACTUAL respecto a `now`. */
function currentCycleEndMonth(cutoffDay: number, now: Date): { y: number; m: number } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const cutoff = effectiveDueDay(cutoffDay, y, m);
  if (now.getDate() <= cutoff) return { y, m }; // antes/igual al corte → cierra este mes
  const nm = m + 1;
  return nm > 11 ? { y: y + 1, m: 0 } : { y, m: nm };
}

/** Normaliza un mes absoluto (puede ser negativo o >11) a {y, m}. */
function normMonth(baseY: number, monthAbs: number): { y: number; m: number } {
  const y = baseY + Math.floor(monthAbs / 12);
  const m = ((monthAbs % 12) + 12) % 12;
  return { y, m };
}

/** Ciclo en el offset `index` relativo al ciclo actual. */
export function getCycleByIndex(
  cutoffDay: number,
  paymentDay: number,
  index: number,
  now: Date = new Date(),
): CreditCycle {
  const base = currentCycleEndMonth(cutoffDay, now);
  const endAbs = base.m + index;

  const end = normMonth(base.y, endAbs);
  const cycleEnd = new Date(end.y, end.m, effectiveDueDay(cutoffDay, end.y, end.m), 23, 59, 59, 999);

  const start = normMonth(base.y, endAbs - 1); // corte del mes anterior
  const cycleStart = new Date(start.y, start.m, effectiveDueDay(cutoffDay, start.y, start.m) + 1, 0, 0, 0, 0);

  const pay = normMonth(base.y, endAbs + 1); // pago: mes siguiente al cierre
  const paymentDueDate = new Date(pay.y, pay.m, effectiveDueDay(paymentDay, pay.y, pay.m));

  return { index, cycleStart, cycleEnd, paymentDueDate };
}

/** Índice del ciclo cuya ventana contiene `date` (relativo al ciclo actual a `now`). */
export function cycleIndexOf(cutoffDay: number, date: Date, now: Date = new Date()): number {
  const base = currentCycleEndMonth(cutoffDay, now);
  const d = new Date(date);
  let dy = d.getFullYear();
  let dm = d.getMonth();
  const cutoff = effectiveDueDay(cutoffDay, dy, dm);
  if (d.getDate() > cutoff) {
    dm += 1;
    if (dm > 11) { dm = 0; dy += 1; }
  }
  return (dy - base.y) * 12 + (dm - base.m);
}
