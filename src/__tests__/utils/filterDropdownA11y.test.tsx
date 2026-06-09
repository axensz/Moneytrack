import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FilterDropdown } from '../../components/views/transactions/components/FilterDropdown';

const options = [
  { value: 'a', label: 'Cuenta A' },
  { value: 'b', label: 'Cuenta B' },
];

function renderDropdown(overrides: Partial<React.ComponentProps<typeof FilterDropdown>> = {}) {
  const onToggle = vi.fn();
  const onClose = vi.fn();
  const onChange = vi.fn();
  const utils = render(
    <FilterDropdown
      label="Cuenta"
      value="all"
      options={options}
      onChange={onChange}
      isOpen={false}
      onToggle={onToggle}
      onClose={onClose}
      {...overrides}
    />
  );
  return { onToggle, onClose, onChange, ...utils };
}

describe('FilterDropdown a11y', () => {
  it('el trigger declara aria-haspopup=listbox y refleja aria-expanded', () => {
    const { rerender } = renderDropdown({ isOpen: false });
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <FilterDropdown
        label="Cuenta"
        value="all"
        options={options}
        onChange={vi.fn()}
        isOpen
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Cuenta/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('el panel abierto es un listbox con options y aria-selected en la activa', () => {
    renderDropdown({ isOpen: true, value: 'b' });
    expect(screen.getByRole('listbox', { name: 'Cuenta' })).toBeInTheDocument();
    const opts = screen.getAllByRole('option');
    // "Cuenta (Todos)" + 2 options
    expect(opts).toHaveLength(3);
    expect(screen.getByRole('option', { name: 'Cuenta B' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Cuenta A' })).toHaveAttribute('aria-selected', 'false');
  });

  it('Escape cierra el dropdown', () => {
    const { onClose } = renderDropdown({ isOpen: true });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('seleccionar una option dispara onChange + onClose', () => {
    const { onChange, onClose } = renderDropdown({ isOpen: true });
    fireEvent.click(screen.getByRole('option', { name: 'Cuenta A' }));
    expect(onChange).toHaveBeenCalledWith('a');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
