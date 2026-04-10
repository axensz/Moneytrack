import type { Transaction, NewTransaction } from '../types/finance';

export interface DuplicateMatch {
  transaction: Transaction;
  matchScore: number; // 0-100
  reasons: string[];
}

const HOURS_48 = 48 * 60 * 60 * 1000;
const DAYS_5  =  5 * 24 * 60 * 60 * 1000;

/**
 * Detecta posibles transacciones duplicadas.
 * La fecha es un REQUISITO: si la diferencia es > 5 días no es duplicado.
 * Luego puntúa:
 * - Monto exacto (50 puntos)
 * - Misma descripción (30 puntos exacta / 15 similar)
 * - Misma categoría (20 puntos)
 * - Fecha ≤ 48h (bonus +10 puntos)
 *
 * Retorna matches con score >= 70
 */
export function detectDuplicates(
  newTx: NewTransaction,
  transactions: Transaction[],
  threshold: number = 70
): DuplicateMatch[] {
  // Parse amount from Colombian format
  const amountStr = newTx.amount.toString().replace(/\./g, '').replace(',', '.');
  const newAmount = parseFloat(amountStr);

  if (isNaN(newAmount) || newAmount <= 0) return [];
  if (!newTx.description.trim() && !newTx.category) return [];

  const newDate = newTx.date ? new Date(newTx.date + 'T12:00:00') : new Date();
  const newDesc = newTx.description.trim().toLowerCase();

  const matches: DuplicateMatch[] = [];

  for (const tx of transactions) {
    // Only compare same type
    if (tx.type !== newTx.type) continue;

    // Fecha es requisito: si está a más de 5 días, no puede ser duplicado
    const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
    const timeDiff = Math.abs(newDate.getTime() - txDate.getTime());
    if (timeDiff > DAYS_5) continue;

    let score = 0;
    const reasons: string[] = [];

    // Amount match (50 points)
    if (tx.amount === newAmount) {
      score += 50;
      reasons.push('Mismo monto');
    }

    // Description match (30 points exact / 15 similar)
    const txDesc = tx.description.trim().toLowerCase();
    if (newDesc && txDesc) {
      if (txDesc === newDesc) {
        score += 30;
        reasons.push('Misma descripción');
      } else if (txDesc.includes(newDesc) || newDesc.includes(txDesc)) {
        score += 15;
        reasons.push('Descripción similar');
      }
    }

    // Category match (20 points)
    if (tx.category && newTx.category && tx.category === newTx.category) {
      score += 20;
      reasons.push('Misma categoría');
    }

    // Date ≤ 48h bonus (10 points)
    if (timeDiff <= HOURS_48) {
      score += 10;
      reasons.push('Fecha cercana (48h)');
    }

    if (score >= threshold) {
      matches.push({ transaction: tx, matchScore: score, reasons });
    }
  }

  // Sort by score descending, return top 3
  return matches
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
}
