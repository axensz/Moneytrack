import type { Transaction, NewTransaction } from '../types/finance';

export interface DuplicateMatch {
  transaction: Transaction;
  matchScore: number; // 0-100
  reasons: string[];
}

const HOURS_48 = 48 * 60 * 60 * 1000;

/**
 * Detecta posibles transacciones duplicadas.
 * Compara contra transacciones existentes buscando coincidencias en:
 * - Monto exacto (40 puntos)
 * - Misma categoría (20 puntos) 
 * - Misma descripción (20 puntos)
 * - Fecha cercana ±48h (20 puntos)
 * 
 * Retorna matches con score >= 60
 */
export function detectDuplicates(
  newTx: NewTransaction,
  transactions: Transaction[],
  threshold: number = 60
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

    let score = 0;
    const reasons: string[] = [];

    // Amount match (40 points)
    if (tx.amount === newAmount) {
      score += 40;
      reasons.push('Mismo monto');
    }

    // Category match (20 points)
    if (tx.category && newTx.category && tx.category === newTx.category) {
      score += 20;
      reasons.push('Misma categoría');
    }

    // Description match (20 points) — fuzzy: includes or exact
    const txDesc = tx.description.trim().toLowerCase();
    if (newDesc && txDesc) {
      if (txDesc === newDesc) {
        score += 20;
        reasons.push('Misma descripción');
      } else if (txDesc.includes(newDesc) || newDesc.includes(txDesc)) {
        score += 10;
        reasons.push('Descripción similar');
      }
    }

    // Date proximity (20 points) — within 48h
    const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
    const timeDiff = Math.abs(newDate.getTime() - txDate.getTime());
    if (timeDiff <= HOURS_48) {
      score += 20;
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
