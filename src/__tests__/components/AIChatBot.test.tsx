import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('returns focus to the shell trigger when closing', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const returnFocusRef = { current: trigger };

    render(<AIChatBot isOpen onClose={vi.fn()} returnFocusRef={returnFocusRef} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar chat' }));

    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
