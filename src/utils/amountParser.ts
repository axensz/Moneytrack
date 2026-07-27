/**
 * Convierte montos escritos en formatos colombianos o internacionales.
 *
 * Se mantiene como utilidad neutral porque la detección de duplicados del
 * formulario manual también necesita interpretar valores formateados.
 */
const CURRENCY_CODE_REGEX = /\b(COP|USD|EUR|MXN|CLP|ARS|PEN|BRL|GBP|CAD)\b/gi;

export function parseAmount(raw: string): number {
  if (raw == null) return 0;
  const original = String(raw).trim();
  if (original === '' || original === '-') return 0;

  const isNegative = original.startsWith('-') || /^\(.*\)$/.test(original);

  let clean = original
    .replace(/\bU\.?S\.?\s*\$/gi, '')
    .replace(CURRENCY_CODE_REGEX, '')
    .replace(/[$€£\s ]/g, '')
    .replace(/[()]/g, '')
    .replace(/-/g, '');

  if (clean === '') return 0;

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/.test(clean)) {
    clean = clean.replace(',', '.');
  } else {
    clean = clean.replace(/,/g, '');
  }

  const value = parseFloat(clean);
  if (Number.isNaN(value)) return 0;
  return isNegative ? -value : value;
}
