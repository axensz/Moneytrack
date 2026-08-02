import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatBot } from '../../components/chat/AIChatBot';

vi.mock('../../lib/gemini', () => ({
  sendChatMessage: vi.fn(),
  isGeminiConfigured: () => true,
  parseActionFromResponse: vi.fn(),
}));

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useTransactionDomain: () => ({
    transactions: [],
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
  }),
  useAccountDomain: () => ({ accounts: [] }),
  useCategoryDomain: () => ({
    categories: { income: [], expense: [] },
    addCategory: vi.fn(),
  }),
}));

function ControlledChat() {
  const [open, setOpen] = React.useState(true);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button">Abrir asistente IA</button>
      <AIChatBot
        isOpen={open}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
      />
    </>
  );
}

describe('AIChatBot shell control', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('keeps conversation input state while controlled visibility changes', () => {
    const returnFocusRef = React.createRef<HTMLElement>();
    const { rerender } = render(
      <AIChatBot isOpen onClose={vi.fn()} returnFocusRef={returnFocusRef} />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Saldo de este mes' },
    });

    rerender(
      <AIChatBot isOpen={false} onClose={vi.fn()} returnFocusRef={returnFocusRef} />,
    );
    expect(screen.queryByRole('textbox')).toBeNull();

    rerender(
      <AIChatBot isOpen onClose={vi.fn()} returnFocusRef={returnFocusRef} />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('Saldo de este mes');
  });

  it('opens a named non-modal dialog and focuses its composer', async () => {
    render(<ControlledChat />);
    const dialog = screen.getByRole('dialog', { name: 'Asistente MoneyTrack' });
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Mensaje para el asistente' }))
        .toHaveFocus();
    });
  });

  it.each(['button', 'Escape'])(
    'closes through %s and restores the persistent trigger',
    async (method) => {
      render(<ControlledChat />);

      if (method === 'button') {
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar chat' }));
      } else {
        fireEvent.keyDown(
          screen.getByRole('textbox', { name: 'Mensaje para el asistente' }),
          { key: 'Escape' },
        );
      }

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Asistente MoneyTrack' }))
          .toBeNull();
      });
      expect(screen.getByRole('button', { name: 'Abrir asistente IA' }))
        .toHaveFocus();
    },
  );

  it('keeps title and composer fixed around one bounded message scroller', () => {
    render(<ControlledChat />);
    const dialog = screen.getByRole('dialog', { name: 'Asistente MoneyTrack' });

    expect(dialog).toHaveClass(
      'absolute',
      'inset-x-3',
      'top-3',
      'bottom-[calc(var(--shell-nav-h,72px)+env(safe-area-inset-bottom))]',
      'sm:left-auto',
      'sm:right-4',
      'sm:bottom-4',
      'sm:w-[420px]',
    );
    expect(dialog.querySelector('[data-assistant-titlebar]')).toHaveClass('shrink-0');
    expect(dialog.querySelector('[data-assistant-messages]'))
      .toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto');
    expect(dialog.querySelector('[data-assistant-composer]')).toHaveClass('shrink-0');
  });

  it('uses semantic surfaces without decorative assistant gradients or motion', () => {
    const { container } = render(<ControlledChat />);
    const assistant = container.querySelector('[role="dialog"]')!;
    const classText = Array.from(assistant.querySelectorAll<HTMLElement>('*'))
      .concat(assistant as HTMLElement)
      .map((element) => element.className)
      .filter((value) => typeof value === 'string')
      .join(' ');

    expect(classText).not.toMatch(
      /bg-gradient|animate-shimmer|animate-pulse|hover:scale|group-hover:rotate|ease-(bounce|elastic)/,
    );
    expect(assistant).toHaveClass(
      'bg-card',
      'text-card-foreground',
      'border-border',
      'duration-200',
    );
  });
});
