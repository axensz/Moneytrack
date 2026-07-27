import { describe, expect, it } from 'vitest';
import { escapeCSVCell } from '../../hooks/useCSVExport';

describe('escapeCSVCell', () => {
  it.each(['=SUM(A1:A2)', '+cmd', '-1+2', '@SUM(A1:A2)'])(
    'neutraliza texto con prefijo de formula: %s',
    (value) => {
      expect(escapeCSVCell(value)).toBe(`'${value}`);
    }
  );

  it('neutraliza formulas precedidas por espacios o tabuladores', () => {
    expect(escapeCSVCell('   =SUM(A1:A2)')).toBe("'   =SUM(A1:A2)");
    expect(escapeCSVCell('\t=SUM(A1:A2)')).toBe("'\t=SUM(A1:A2)");
  });

  it('conserva los numeros negativos como valores numericos', () => {
    expect(escapeCSVCell(-1250)).toBe('-1250');
  });

  it('aplica quoting CSV despues de neutralizar', () => {
    expect(escapeCSVCell('=HYPERLINK("https://example.com","Abrir")')).toBe(
      "\"'=HYPERLINK(\"\"https://example.com\"\",\"\"Abrir\"\")\""
    );
  });
});
