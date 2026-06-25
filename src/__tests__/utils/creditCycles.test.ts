import { describe, it, expect } from 'vitest';
import { getCycleByIndex, cycleIndexOf } from '../../utils/creditCycles';

// Tarjeta: corte día 15, pago día 5. "Ahora" = 20 jun 2026 (ya pasó el corte de junio).
const NOW = new Date(2026, 5, 20); // 20 jun 2026
const CUTOFF = 15;
const PAY = 5;

describe('getCycleByIndex', () => {
  it('index 0 = ciclo actual: cierra 15 jul, paga 5 ago (corte ya pasó este mes)', () => {
    const c = getCycleByIndex(CUTOFF, PAY, 0, NOW);
    expect(c.cycleEnd.getFullYear()).toBe(2026);
    expect(c.cycleEnd.getMonth()).toBe(6);  // julio
    expect(c.cycleEnd.getDate()).toBe(15);
    expect(c.cycleStart.getMonth()).toBe(5); // 16 jun
    expect(c.cycleStart.getDate()).toBe(16);
    expect(c.paymentDueDate.getMonth()).toBe(7); // agosto
    expect(c.paymentDueDate.getDate()).toBe(5);
  });

  it('index -1 = ciclo anterior: cierra 15 jun, paga 5 jul', () => {
    const c = getCycleByIndex(CUTOFF, PAY, -1, NOW);
    expect(c.cycleEnd.getMonth()).toBe(5); // junio
    expect(c.paymentDueDate.getMonth()).toBe(6); // julio
  });

  it('acota corte de fin de mes: corte 31 en febrero → 28 (2026 no bisiesto)', () => {
    const c = getCycleByIndex(31, 15, 0, new Date(2026, 1, 10)); // 10 feb, antes del corte
    expect(c.cycleEnd.getMonth()).toBe(1); // febrero
    expect(c.cycleEnd.getDate()).toBe(28);
  });

  it('cruza año: index +6 desde julio cae en el año siguiente', () => {
    const c = getCycleByIndex(CUTOFF, PAY, 6, NOW); // base cierre jul 2026 + 6 = ene 2027
    expect(c.cycleEnd.getFullYear()).toBe(2027);
    expect(c.cycleEnd.getMonth()).toBe(0);
  });
});

describe('cycleIndexOf', () => {
  it('una fecha dentro del ciclo actual → 0', () => {
    expect(cycleIndexOf(CUTOFF, new Date(2026, 5, 20), NOW)).toBe(0); // 20 jun, post-corte → ciclo que cierra jul
  });
  it('una compra de mayo (antes del corte de jun) → -1', () => {
    expect(cycleIndexOf(CUTOFF, new Date(2026, 4, 16), NOW)).toBe(-1);
  });
  it('coherencia: la fecha del cierre del index i pertenece al ciclo i', () => {
    const c = getCycleByIndex(CUTOFF, PAY, -2, NOW);
    expect(cycleIndexOf(CUTOFF, c.cycleEnd, NOW)).toBe(-2);
  });
});
