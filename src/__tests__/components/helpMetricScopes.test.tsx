import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpSectionStats } from '../../components/modals/help/HelpSectionStats';
import { HelpSectionTransactions } from '../../components/modals/help/HelpSectionTransactions';

describe('metric-scope help', () => {
  it('states that Transaction filters apply to list and CSV, not Statistics or the overview', () => {
    render(<><HelpSectionTransactions /><HelpSectionStats /></>);

    expect(screen.getByText(/lista.*CSV/i)).toBeInTheDocument();
    expect(screen.getByText(/no cambian el resumen general ni las estad\u00edsticas/i)).toBeInTheDocument();
    expect(screen.getByText(/historial completo/i)).toBeInTheDocument();
    expect(screen.queryByText('Estado')).not.toBeInTheDocument();
  });
});
