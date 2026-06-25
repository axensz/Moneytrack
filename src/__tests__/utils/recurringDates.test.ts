import { describe, it, expect } from 'vitest';
import {
  lastDayOfMonth,
  effectiveDueDay,
  getYearlyAnchorMonth,
  getNextDueDate,
  getCycleWindow,
  cycleKey,
} from '../../utils/recurringDates';
import type { RecurringPayment } from '../../types/finance';

const payment = (o: Partial<RecurringPayment>): RecurringPayment => ({
  id: 'p1',
  name: 'Pago',
  amount: 100_000,
  category: 'Servicios',
  dueDay: 10,
  frequency: 'monthly',
  isActive: true,
  ...o,
});

describe('recurringDates — helpers puros', () => {
  it('lastDayOfMonth maneja meses cortos y bisiestos', () => {
    expect(lastDayOfMonth(2025, 1)).toBe(28); // febrero no bisiesto
    expect(lastDayOfMonth(2024, 1)).toBe(29); // febrero bisiesto
    expect(lastDayOfMonth(2025, 3)).toBe(30); // abril
    expect(lastDayOfMonth(2025, 0)).toBe(31); // enero
  });

  it('effectiveDueDay acota dueDay al último día real del mes', () => {
    // (a) dueDay 31 en febrero -> 28 (no bisiesto) / 29 (bisiesto), nunca inválido
    expect(effectiveDueDay(31, 2025, 1)).toBe(28);
    expect(effectiveDueDay(31, 2024, 1)).toBe(29);
    // No recorta cuando el día sí existe
    expect(effectiveDueDay(15, 2025, 1)).toBe(15);
    expect(effectiveDueDay(31, 2025, 0)).toBe(31); // enero sí tiene 31
  });

  it('getYearlyAnchorMonth usa el mes de createdAt; si no hay, el fallback', () => {
    const withCreated = payment({
      frequency: 'yearly',
      createdAt: new Date(2024, 0, 5), // enero
    });
    expect(getYearlyAnchorMonth(withCreated, 5)).toBe(0); // enero, ignora fallback
    const withoutCreated = payment({ frequency: 'yearly', createdAt: undefined });
    expect(getYearlyAnchorMonth(withoutCreated, 5)).toBe(5); // fallback = junio
  });
});

describe('recurringDates — getNextDueDate', () => {
  it('(a) dueDay 31 en febrero cae el 28/29, no inválido ni 28 fijo', () => {
    const p = payment({ dueDay: 31, frequency: 'monthly' });
    // Referencia: 1 feb 2025 (no bisiesto) -> vencimiento 28 feb
    const ref2025 = new Date(2025, 1, 1);
    const due2025 = getNextDueDate(p, ref2025);
    expect(due2025.getMonth()).toBe(1); // febrero
    expect(due2025.getDate()).toBe(28);

    // Referencia: 1 feb 2024 (bisiesto) -> vencimiento 29 feb
    const ref2024 = new Date(2024, 1, 1);
    const due2024 = getNextDueDate(p, ref2024);
    expect(due2024.getMonth()).toBe(1);
    expect(due2024.getDate()).toBe(29);
  });

  it('mensual: si el día ya pasó, avanza al mes siguiente (con clamp)', () => {
    const p = payment({ dueDay: 31, frequency: 'monthly' });
    // 28 feb 2025 ES el vencimiento efectivo -> devuelve hoy (inclusivo)
    expect(getNextDueDate(p, new Date(2025, 1, 28)).getDate()).toBe(28);
    // 1 mar 2025: ya pasó el "31" de febrero -> siguiente, marzo 31
    const dueMar = getNextDueDate(p, new Date(2025, 2, 1));
    expect(dueMar.getMonth()).toBe(2); // marzo
    expect(dueMar.getDate()).toBe(31);
  });

  it('(b) anual configurado en enero (createdAt enero) visto en junio -> próximo en enero siguiente', () => {
    const p = payment({
      dueDay: 15,
      frequency: 'yearly',
      createdAt: new Date(2024, 0, 15), // enero
    });
    const ref = new Date(2025, 5, 10); // 10 jun 2025
    const due = getNextDueDate(p, ref);
    expect(due.getMonth()).toBe(0); // enero, NO junio
    expect(due.getFullYear()).toBe(2026); // enero ya pasó en 2025 -> próximo enero
    expect(due.getDate()).toBe(15);
  });

  it('(c) anual SIN createdAt -> fallback: se ancla al mes de la fecha de referencia', () => {
    const p = payment({ dueDay: 20, frequency: 'yearly', createdAt: undefined });
    const ref = new Date(2025, 5, 10); // junio, antes del día 20
    const due = getNextDueDate(p, ref);
    // Fallback documentado: mes ancla = mes de referencia (junio)
    expect(due.getMonth()).toBe(5); // junio
    expect(due.getFullYear()).toBe(2025);
    expect(due.getDate()).toBe(20);
  });
});

describe('recurringDates — getCycleWindow', () => {
  it('(d) mensual: ventana del ciclo es de un mes [inicio, fin)', () => {
    const p = payment({ dueDay: 10, frequency: 'monthly' });
    // Referencia después del día 10 -> ciclo [10 jun, 10 jul)
    const ref = new Date(2025, 5, 15); // 15 jun 2025
    const { start, end } = getCycleWindow(p, ref);
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(5); // junio
    expect(start.getDate()).toBe(10);
    expect(end.getMonth()).toBe(6); // julio
    expect(end.getDate()).toBe(10);
  });

  it('(d) mensual: referencia antes del día -> ciclo arranca el mes anterior', () => {
    const p = payment({ dueDay: 10, frequency: 'monthly' });
    const ref = new Date(2025, 5, 5); // 5 jun, antes del 10
    const { start, end } = getCycleWindow(p, ref);
    expect(start.getMonth()).toBe(4); // mayo
    expect(start.getDate()).toBe(10);
    expect(end.getMonth()).toBe(5); // junio
    expect(end.getDate()).toBe(10);
  });

  it('(d) anual: ventana del ciclo es de un año, anclada en createdAt', () => {
    const p = payment({
      dueDay: 15,
      frequency: 'yearly',
      createdAt: new Date(2024, 0, 15), // enero
    });
    const ref = new Date(2025, 5, 10); // jun 2025: ya pasó enero 2025
    const { start, end } = getCycleWindow(p, ref);
    expect(start.getMonth()).toBe(0); // enero
    expect(start.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(0); // enero
    expect(end.getFullYear()).toBe(2026);
  });

  it('(d) anual: referencia antes del vencimiento -> ciclo del año anterior', () => {
    const p = payment({
      dueDay: 15,
      frequency: 'yearly',
      createdAt: new Date(2024, 5, 15), // junio
    });
    const ref = new Date(2025, 2, 10); // marzo 2025: aún no llega junio 2025
    const { start, end } = getCycleWindow(p, ref);
    expect(start.getFullYear()).toBe(2024);
    expect(start.getMonth()).toBe(5); // junio 2024
    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(5); // junio 2025
  });
});

describe('recurringDates — pago anticipado y atrasado caen en el ciclo correcto', () => {
  // Pago mensual anclado al día 5: ciclo de febrero = [5 feb, 5 mar).
  const p = payment({ dueDay: 5, frequency: 'monthly' });

  it('(e) anticipado: pagado el 31 ene queda FUERA del ciclo de feb (pertenece al de ene)', () => {
    // Ciclo que contiene una referencia de mediados de febrero
    const refFeb = new Date(2025, 1, 15);
    const { start, end } = getCycleWindow(p, refFeb);
    // Ciclo de feb: [5 feb, 5 mar)
    expect(start.getMonth()).toBe(1);
    expect(start.getDate()).toBe(5);

    const pagoAnticipado = new Date(2025, 0, 31).getTime(); // 31 ene
    // El 31 ene NO cae en el ciclo de febrero...
    expect(pagoAnticipado >= start.getTime() && pagoAnticipado < end.getTime()).toBe(false);

    // ...sino en el ciclo de enero: [5 ene, 5 feb)
    const refJan = new Date(2025, 0, 20);
    const janWin = getCycleWindow(p, refJan);
    expect(janWin.start.getMonth()).toBe(0);
    expect(janWin.start.getDate()).toBe(5);
    expect(pagoAnticipado >= janWin.start.getTime() && pagoAnticipado < janWin.end.getTime()).toBe(true);
  });

  it('(e) anticipado dentro de ventana: pagado el 6 feb cuenta para el ciclo de febrero', () => {
    const refFeb = new Date(2025, 1, 15);
    const { start, end } = getCycleWindow(p, refFeb);
    const pagoTemprano = new Date(2025, 1, 6).getTime(); // 6 feb (justo tras el vencimiento)
    expect(pagoTemprano >= start.getTime() && pagoTemprano < end.getTime()).toBe(true);
  });

  it('(e) atrasado: pagado el 2 mar (después del día 5 de feb) sigue dentro del ciclo de febrero', () => {
    const refFeb = new Date(2025, 1, 28);
    const { start, end } = getCycleWindow(p, refFeb);
    const pagoAtrasado = new Date(2025, 2, 2).getTime(); // 2 mar, antes del 5 mar
    expect(pagoAtrasado >= start.getTime() && pagoAtrasado < end.getTime()).toBe(true);
  });
});

describe('recurringDates — cycleKey', () => {
  const p = payment({ dueDay: 5, frequency: 'monthly' });

  it('es estable dentro del mismo ciclo aunque la fecha cruce el borde de mes', () => {
    // Ciclo de febrero = [5 feb, 5 mar): el 28 feb y el 2 mar pertenecen al mismo.
    expect(cycleKey(p, new Date(2025, 1, 28))).toBe(cycleKey(p, new Date(2025, 2, 2)));
  });

  it('distingue ciclos contiguos', () => {
    const feb = cycleKey(p, new Date(2025, 1, 15)); // ciclo [5 feb, 5 mar)
    const ene = cycleKey(p, new Date(2025, 0, 15)); // ciclo [5 ene, 5 feb)
    expect(feb).not.toBe(ene);
  });

  it('es la clave del inicio de la ventana (vencimiento que abrió el ciclo)', () => {
    expect(cycleKey(p, new Date(2025, 1, 15))).toBe('2025-1-5'); // 5 feb
  });
});
