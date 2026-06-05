/**
 * Helpers puros para huellas de duplicados al importar extractos.
 *
 * Dos estrategias:
 * - Movimientos normales: huella exacta `tipo|día|monto|descripción`.
 * - Transferencias / pagos de tarjeta: el texto varía entre bancos
 *   ("Pago PSE Nu" en el banco vs "Gracias por tu pago" en la tarjeta), así que
 *   la huella es solo `día|monto` y se compara contra TODAS las cuentas (F7).
 */

export const importDayKey = (d: Date): string =>
  `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export const importDescKey = (description: string): string =>
  description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);

/** Huella exacta para movimientos normales (incluye descripción). */
export const exactImportKey = (type: string, date: Date, amount: number, description: string): string =>
  `${type}|${importDayKey(date)}|${amount.toFixed(2)}|${importDescKey(description)}`;

/** Huella de transferencia/pago: solo monto+día, independiente del texto del banco. */
export const transferImportKey = (date: Date, amount: number): string =>
  `transfer|${importDayKey(date)}|${amount.toFixed(2)}`;
