import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DeleteConfirmModal } from '../../components/views/accounts/components/DeleteConfirmModal';

// P-cascade-incons: el modal de borrado de cuenta debe divulgar TODO lo que se
// borra en cascada (transacciones + recurrentes + deudas), no solo transacciones.

const base = {
  isOpen: true,
  accountName: 'Ahorros',
  deleteConfirmName: '',
  confirmDeleteWithTransactions: false,
  setDeleteConfirmName: vi.fn(),
  setConfirmDeleteWithTransactions: vi.fn(),
  onConfirm: vi.fn(),
  onClose: vi.fn(),
};

describe('DeleteConfirmModal — divulgación de cascada (P-cascade-incons)', () => {
  it('divulga transacciones, pagos recurrentes y deudas afectadas', () => {
    render(<DeleteConfirmModal {...base} transactionCount={12} recurringCount={2} debtCount={1} />);
    // El texto se parte en nodos por la pluralización → aseveramos sobre el
    // textContent del bloque de advertencia.
    const block = screen.getByText(/también se borrarán permanentemente/i).closest('div')!;
    expect(block.textContent).toMatch(/12 transacci/);
    expect(block.textContent).toMatch(/2 pagos recurrentes/);
    expect(block.textContent).toMatch(/1 deuda/);
    expect(block.textContent).toMatch(/cupo usado de las tarjetas de crédito/i);
  });

  it('no muestra el bloque de cascada si no hay nada vinculado', () => {
    render(<DeleteConfirmModal {...base} transactionCount={0} recurringCount={0} debtCount={0} />);
    expect(screen.queryByText(/también se borrarán permanentemente/i)).not.toBeInTheDocument();
  });
});
