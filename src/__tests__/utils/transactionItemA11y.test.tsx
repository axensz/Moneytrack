import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Transaction, Account, Categories } from '../../types/finance';

// hideBalances controla la máscara; lo fijamos por test mockeando el contexto.
const hideBalancesRef = { value: false };
vi.mock('@/contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: hideBalancesRef.value, setHideBalances: vi.fn() }),
}));

// Importación diferida tras registrar el mock.
import { TransactionItem } from '../../components/views/transactions/components/TransactionItem';

const categories: Categories = { income: ['Salario'], expense: ['Comida'] };

const baseTx: Transaction = {
  id: 'abc123',
  type: 'expense',
  amount: 50000,
  category: 'Comida',
  description: 'Almuerzo',
  date: new Date('2026-06-01T12:30:00'),
  accountId: 'acc1',
  paid: true,
} as Transaction;

const account: Account = { id: 'acc1', name: 'Bancolombia', type: 'savings', isDefault: false, initialBalance: 0 };

const noop = () => {};

function renderItem(overrides: Partial<React.ComponentProps<typeof TransactionItem>> = {}) {
  return render(
    <TransactionItem
      transaction={baseTx}
      account={account}
      isEditing={false}
      editForm={{ description: '', amount: '', date: '', category: '' }}
      categories={categories}
      formatCurrency={(n) => `$${n.toLocaleString('es-CO')}`}
      onEdit={noop}
      onDelete={noop}
      onSave={noop}
      onCancel={noop}
      onEditFormChange={noop}
      {...overrides}
    />
  );
}

describe('TransactionItem a11y / máscara', () => {
  it('usa la máscara unificada •••••• cuando los balances están ocultos', () => {
    hideBalancesRef.value = true;
    renderItem();
    expect(screen.getByText(/••••••/)).toBeInTheDocument();
    expect(screen.queryByText(/\*\*\*\*\*\*/)).not.toBeInTheDocument();
    hideBalancesRef.value = false;
  });

  it('asocia cada label de edición inline con su input vía htmlFor/id único', () => {
    renderItem({ isEditing: true });
    // getByLabelText falla si el label no está asociado correctamente.
    const desc = screen.getByLabelText('Descripción');
    const cat = screen.getByLabelText('Categoría');
    const date = screen.getByLabelText('Fecha');
    expect(desc).toHaveAttribute('id', 'tx-edit-abc123-description');
    expect(cat).toHaveAttribute('id', 'tx-edit-abc123-category');
    expect(date).toHaveAttribute('id', 'tx-edit-abc123-date');
  });

  it('los botones de acción cumplen el touch target mínimo de 44px y tienen foco visible', () => {
    renderItem();
    const editBtn = screen.getByLabelText('Editar transacción');
    const delBtn = screen.getByLabelText('Eliminar transacción');
    for (const btn of [editBtn, delBtn]) {
      expect(btn.className).toContain('min-h-[44px]');
      expect(btn.className).toContain('min-w-[44px]');
      expect(btn.className).toContain('focus-visible:ring-2');
      expect(btn.className).toContain('focus-visible:ring-primary');
    }
  });

  it('expone la expansión como <button> con aria-expanded (no como div role=button anidando botones)', () => {
    const { rerender } = render(
      <TransactionItem
        transaction={baseTx}
        account={account}
        isEditing={false}
        editForm={{ description: '', amount: '', date: '', category: '' }}
        categories={categories}
        formatCurrency={(n) => `$${n.toLocaleString('es-CO')}`}
        onEdit={noop}
        onDelete={noop}
        onSave={noop}
        onCancel={noop}
        onEditFormChange={noop}
        isExpanded={false}
        onToggleExpand={noop}
      />
    );

    const toggle = screen.getByRole('button', { name: 'Expandir detalle' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.tagName).toBe('BUTTON');
    // El contenedor de la fila ya no debe anunciarse como button (ARIA inválido:
    // button anidando button). No debe existir un role=button salvo los reales.
    expect(screen.queryByRole('button', { name: '' })).toBeNull();

    rerender(
      <TransactionItem
        transaction={baseTx}
        account={account}
        isEditing={false}
        editForm={{ description: '', amount: '', date: '', category: '' }}
        categories={categories}
        formatCurrency={(n) => `$${n.toLocaleString('es-CO')}`}
        onEdit={noop}
        onDelete={noop}
        onSave={noop}
        onCancel={noop}
        onEditFormChange={noop}
        isExpanded
        onToggleExpand={noop}
      />
    );
    expect(screen.getByRole('button', { name: 'Contraer detalle' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('revela las acciones de fila también con focus-within (no solo hover) para teclado', () => {
    const { container } = renderItem();
    const wrapper = container.querySelector('.sm\\:group-hover\\:opacity-100');
    expect(wrapper?.className).toContain('sm:group-focus-within:opacity-100');
  });

  // R-memo-inline: los callbacks reciben la transacción/id (refs estables del
  // padre) en vez de closures de cero-args creadas por fila. Este contrato es
  // lo que permite a React.memo evitar re-render. Bloquea la regresión.
  it('los callbacks reciben la transacción/id (contrato para React.memo estable)', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onToggleExpand = vi.fn();
    render(
      <TransactionItem
        transaction={baseTx}
        account={account}
        isEditing={false}
        editForm={{ description: '', amount: '', date: '', category: '' }}
        categories={categories}
        formatCurrency={(n) => `$${n}`}
        onEdit={onEdit}
        onDelete={onDelete}
        onSave={noop}
        onCancel={noop}
        onEditFormChange={noop}
        onToggleExpand={onToggleExpand}
      />
    );

    fireEvent.click(screen.getByLabelText('Editar transacción'));
    expect(onEdit).toHaveBeenCalledWith(baseTx);
    fireEvent.click(screen.getByLabelText('Eliminar transacción'));
    expect(onDelete).toHaveBeenCalledWith(baseTx);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir detalle' }));
    expect(onToggleExpand).toHaveBeenCalledWith(baseTx.id);
  });

  it('onSave recibe el id de la transacción en modo edición', () => {
    const onSave = vi.fn();
    render(
      <TransactionItem
        transaction={baseTx}
        account={account}
        isEditing
        editForm={{ description: 'x', amount: '1000', date: '2026-06-01', category: 'Comida' }}
        categories={categories}
        formatCurrency={(n) => `$${n}`}
        onEdit={noop}
        onDelete={noop}
        onSave={onSave}
        onCancel={noop}
        onEditFormChange={noop}
      />
    );
    fireEvent.click(screen.getByText('Guardar'));
    expect(onSave).toHaveBeenCalledWith(baseTx.id);
  });
});
