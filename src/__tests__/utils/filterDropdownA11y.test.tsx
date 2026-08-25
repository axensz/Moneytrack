import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FilterDropdown } from '../../components/views/transactions/components/FilterDropdown';

const options = [
  { value: 'a', label: 'Cuenta A' },
  { value: 'b', label: 'Cuenta B' },
];

const rect = (top: number, bottom: number): DOMRect => ({
  x: 0,
  y: top,
  top,
  bottom,
  left: 0,
  right: 200,
  width: 200,
  height: bottom - top,
  toJSON: () => ({}),
});

function mockViewportLayout(triggerTop: number, triggerBottom: number) {
  vi.stubGlobal('innerHeight', 844);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('aria-haspopup') === 'listbox') {
      return rect(triggerTop, triggerBottom);
    }
    if (this.getAttribute('aria-label') === 'Navegación principal') {
      return rect(779, 844);
    }
    return rect(0, 0);
  });
}

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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it('mueve un único foco por las opciones y restaura el trigger con Escape', async () => {
    function ControlledDropdown() {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <FilterDropdown
          label="Cuenta"
          value="all"
          options={options}
          onChange={vi.fn()}
          isOpen={isOpen}
          onToggle={() => setIsOpen(open => !open)}
          onClose={() => setIsOpen(false)}
        />
      );
    }

    render(<ControlledDropdown />);
    const trigger = screen.getByRole('button', { name: 'Cuenta' });
    trigger.focus();
    fireEvent.click(trigger);

    const allOption = screen.getByRole('option', { name: 'Cuenta (Todos)' });
    const accountA = screen.getByRole('option', { name: 'Cuenta A' });
    const accountB = screen.getByRole('option', { name: 'Cuenta B' });
    await waitFor(() => expect(allOption).toHaveFocus());
    expect(allOption).toHaveAttribute('tabindex', '0');
    expect(accountA).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(allOption, { key: 'ArrowDown' });
    expect(accountA).toHaveFocus();
    fireEvent.keyDown(accountA, { key: 'End' });
    expect(accountB).toHaveFocus();
    fireEvent.keyDown(accountB, { key: 'Home' });
    expect(allOption).toHaveFocus();

    fireEvent.keyDown(allOption, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('selecciona con Enter, cierra y devuelve el foco al trigger', async () => {
    const onChange = vi.fn();

    function ControlledDropdown() {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <FilterDropdown
          label="Cuenta"
          value="all"
          options={options}
          onChange={onChange}
          isOpen={isOpen}
          onToggle={() => setIsOpen(open => !open)}
          onClose={() => setIsOpen(false)}
        />
      );
    }

    render(<ControlledDropdown />);
    const trigger = screen.getByRole('button', { name: 'Cuenta' });
    fireEvent.click(trigger);
    const accountA = screen.getByRole('option', { name: 'Cuenta A' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Cuenta (Todos)' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(accountA).toHaveFocus();
    fireEvent.keyDown(accountA, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('seleccionar una option dispara onChange + onClose', () => {
    const { onChange, onClose } = renderDropdown({ isOpen: true });
    fireEvent.click(screen.getByRole('option', { name: 'Cuenta A' }));
    expect(onChange).toHaveBeenCalledWith('a');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('enfoca la opción activa sin desplazar la vista al abrir', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');

    renderDropdown({ isOpen: true });

    await waitFor(() => expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true }));
  });

  it('mantiene visible la opción activa dentro del panel limitado', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'listbox') return rect(100, 200);
      if (this.getAttribute('title') === 'Cuenta B') return rect(260, 300);
      return rect(0, 0);
    });

    renderDropdown({ isOpen: true, value: 'b' });

    const panel = screen.getByRole('listbox', { name: 'Cuenta' });
    await waitFor(() => expect(panel.scrollTop).toBe(100));
    expect(screen.getByRole('option', { name: 'Cuenta B' })).toHaveFocus();
  });

  it('limita el panel al espacio disponible antes de la navegación móvil', async () => {
    mockViewportLayout(430, 474);

    render(
      <>
        <nav role="navigation" aria-label="Navegación principal" />
        <FilterDropdown
          label="Cuenta"
          value="all"
          options={options}
          onChange={vi.fn()}
          isOpen
          onToggle={vi.fn()}
          onClose={vi.fn()}
        />
      </>
    );

    const panel = screen.getByRole('listbox', { name: 'Cuenta' });
    await waitFor(() => expect(panel).toHaveStyle({ maxHeight: '297px' }));
    expect(panel).toHaveClass('top-full');
  });

  it('abre hacia arriba cuando el espacio inferior es insuficiente', async () => {
    mockViewportLayout(650, 694);

    render(
      <>
        <nav role="navigation" aria-label="Navegación principal" />
        <FilterDropdown
          label="Cuenta"
          value="all"
          options={options}
          onChange={vi.fn()}
          isOpen
          onToggle={vi.fn()}
          onClose={vi.fn()}
        />
      </>
    );

    const panel = screen.getByRole('listbox', { name: 'Cuenta' });
    await waitFor(() => expect(panel).toHaveClass('bottom-full'));
    expect(panel).toHaveStyle({ maxHeight: '350px' });
  });

  it('recalcula la posición cuando se desplaza el viewport visual', async () => {
    const visualViewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 844 });
    vi.stubGlobal('visualViewport', visualViewport);
    mockViewportLayout(650, 694);

    render(
      <>
        <nav role="navigation" aria-label="Navegación principal" />
        <FilterDropdown
          label="Cuenta"
          value="all"
          options={options}
          onChange={vi.fn()}
          isOpen
          onToggle={vi.fn()}
          onClose={vi.fn()}
        />
      </>
    );

    const panel = screen.getByRole('listbox', { name: 'Cuenta' });
    await waitFor(() => expect(panel).toHaveClass('bottom-full'));

    visualViewport.offsetTop = 600;
    visualViewport.height = 244;
    visualViewport.dispatchEvent(new Event('scroll'));

    await waitFor(() => expect(panel).toHaveClass('top-full'));
    expect(panel).toHaveStyle({ maxHeight: '77px' });
  });
});
