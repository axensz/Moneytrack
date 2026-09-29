import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpSectionStats } from '../../components/modals/help/HelpSectionStats';
import { HelpSectionTransactions } from '../../components/modals/help/HelpSectionTransactions';

describe('metric-scope help', () => {
  it('explains that the account filter also scopes balance and pending debt in the overview', () => {
    render(<><HelpSectionTransactions /><HelpSectionStats /></>);

    expect(screen.getByText(/lista.*CSV/i)).toBeInTheDocument();
    expect(screen.getByText(/filtro de cuenta tambi\u00e9n cambia Saldo actual y Pendiente/i)).toBeInTheDocument();
    expect(screen.getByText(/Los dem\u00e1s filtros no cambian el Resumen general ni las Estad\u00edsticas/i)).toBeInTheDocument();
    expect(screen.getByText(/historial completo/i)).toBeInTheDocument();
    expect(screen.queryByText('Estado')).not.toBeInTheDocument();
  });

  it('explains that pending transactions stay out of paid totals while credit-card purchases can affect used credit', () => {
    render(<HelpSectionTransactions />);

    expect(screen.getByText(/Las transacciones pendientes no entran en los totales actuales de ingresos o gastos pagados/i)).toBeInTheDocument();
    expect(screen.getByText(/Las compras con tarjeta de crédito pueden reflejarse en el crédito usado actual/i)).toBeInTheDocument();
    expect(screen.queryByText(/Aparece en "Gastos pendientes"/i)).not.toBeInTheDocument();
  });
});
