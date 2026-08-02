import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpModal } from '../../components/modals/HelpModal';
import { HelpSectionAccounts } from '../../components/modals/help/HelpSectionAccounts';
import { HelpSectionBasics } from '../../components/modals/help/HelpSectionBasics';
import { HelpSectionRecurring } from '../../components/modals/help/HelpSectionRecurring';

describe('Help content contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('documents the complete financial-plan journey as a primary Help tab', () => {
    render(<HelpModal isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Plan financiero' }));

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent(/ingreso mensual.*mes.*analizar/i);
    expect(panel).toHaveTextContent(/datos.*movimientos pagados/i);
    expect(panel).toHaveTextContent(/usar sugerencia.*borrador.*Presupuestos/i);
    expect(panel).toHaveTextContent(/IA.*opcional.*no.*necesaria/i);
  });

  it('states the real onboarding and offline boundaries', () => {
    const { container } = render(<HelpSectionBasics />);

    expect(container).toHaveTextContent(/crear una cuenta.*primera transacción.*completa/i);
    expect(container).toHaveTextContent(/IA.*opcional/i);
    expect(container).toHaveTextContent(/sin conexión.*datos.*caché/i);
    expect(container).toHaveTextContent(/conexión.*guardar cambios/i);
    expect(container).not.toHaveTextContent(/encol|sincronización automática/i);
  });

  it('points credit-card statements to their current entry point', () => {
    const { container } = render(<HelpSectionAccounts />);

    expect(container).toHaveTextContent(/menú.*Extractos.*modal de extractos/i);
    expect(container).not.toHaveTextContent(/aparece debajo de tus cuentas/i);
  });

  it('documents both supported ways to mark a recurring payment as paid', () => {
    const { container } = render(<HelpSectionRecurring />);

    expect(container).toHaveTextContent(/Ya pagó/i);
    expect(container).toHaveTextContent(/Registrar pago ahora/i);
    expect(container).toHaveTextContent(/Vincular transacción existente/i);
    expect(container).not.toHaveTextContent(/Crea un gasto y selecciona el pago periódico asociado/i);
  });

  it('keeps the README honest about cached reads and saving', () => {
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');

    expect(readme).toMatch(/sin conexión[^\n]*caché/i);
    expect(readme).toMatch(/conexión[^\n]*guardar cambios/i);
    expect(readme).not.toMatch(/Las escrituras nuevas se encolarán/i);
  });
});
