import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatBot } from '../../components/chat/AIChatBot';
import { parseActionFromResponse, sendChatMessage } from '../../lib/gemini';
import type { Account, Categories, Transaction } from '../../types/finance';

const financeDomainMocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  addCategory: vi.fn(),
  transactions: [] as Transaction[],
  balanceTransactions: [] as Transaction[],
  balancesReady: true,
  accounts: [] as Account[],
  categories: { income: [], expense: [] } as Categories,
}));

vi.mock('../../lib/gemini', () => ({
  sendChatMessage: vi.fn(),
  isGeminiConfigured: () => true,
  parseActionFromResponse: vi.fn(),
}));

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useTransactionDomain: () => ({
    transactions: financeDomainMocks.transactions,
    balanceTransactions: financeDomainMocks.balanceTransactions,
    balancesReady: financeDomainMocks.balancesReady,
    addTransaction: financeDomainMocks.addTransaction,
    updateTransaction: financeDomainMocks.updateTransaction,
  }),
  useAccountDomain: () => ({ accounts: financeDomainMocks.accounts }),
  useCategoryDomain: () => ({
    categories: financeDomainMocks.categories,
    addCategory: financeDomainMocks.addCategory,
  }),
}));

const sendChatMessageMock = vi.mocked(sendChatMessage);
const parseActionFromResponseMock = vi.mocked(parseActionFromResponse);
const decorativeAssistantClasses =
  /bg-gradient|animate-(?:shimmer|pulse|bounce)|(?:group-hover|hover|active):scale|backdrop-blur|\brotate-|ease-(?:bounce|elastic)/;

function getClassText(root: HTMLElement) {
  return [root, ...Array.from(root.querySelectorAll('*'))]
    .map((element) => element.getAttribute('class') ?? '')
    .join(' ');
}

function sendAssistantMessage(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Mensaje para el asistente' }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
}

function mockParsedCategoryAction() {
  sendChatMessageMock.mockResolvedValue({ text: 'Respuesta con acción' });
  parseActionFromResponseMock.mockReturnValue({
    text: 'Crear categoría Mascotas',
    action: {
      type: 'add_category',
      data: { categoryType: 'expense', name: 'Mascotas' },
    },
  });
}

function mockParsedTransactionAction() {
  sendChatMessageMock.mockResolvedValue({ text: 'Respuesta con acción' });
  parseActionFromResponseMock.mockReturnValue({
    text: 'Registrar almuerzo',
    action: {
      type: 'add_transaction',
      data: {
        txType: 'expense',
        amount: 35_000,
        category: 'Alimentación',
        description: 'Almuerzo',
        accountId: 'savings',
        accountName: 'Ahorros',
        paid: true,
      },
    },
  });
}

const savingsAccount: Account = {
  id: 'savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 100_000,
};

const ledgerTransaction = (
  id: string,
  amount: number,
  date: string,
): Transaction => ({
  id,
  type: 'income',
  amount,
  category: 'Ingresos',
  description: id,
  date: new Date(date),
  paid: true,
  accountId: 'savings',
});

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
    sendChatMessageMock.mockReset();
    parseActionFromResponseMock.mockReset();
    financeDomainMocks.addTransaction.mockReset();
    financeDomainMocks.updateTransaction.mockReset();
    financeDomainMocks.addCategory.mockReset();
    financeDomainMocks.transactions = [];
    financeDomainMocks.balanceTransactions = [];
    financeDomainMocks.balancesReady = true;
    financeDomainMocks.accounts = [];
    financeDomainMocks.categories = { income: [], expense: [] };
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    const classText = getClassText(assistant as HTMLElement);

    expect(classText).not.toMatch(decorativeAssistantClasses);
    expect(classText).not.toContain('animate-spin');
    expect(assistant).toHaveClass(
      'bg-card',
      'text-card-foreground',
      'border-border',
      'duration-200',
    );
  });

  it('keeps expanded token details free of decorative motion', async () => {
    sendChatMessageMock.mockResolvedValue({
      text: 'Respuesta con tokens',
      tokenUsage: {
        promptTokens: 120,
        responseTokens: 40,
        thinkingTokens: 10,
        totalTokens: 170,
      },
    });
    parseActionFromResponseMock.mockReturnValue({ text: 'Resumen listo' });
    render(<ControlledChat />);

    sendAssistantMessage('Muéstrame el resumen');
    await screen.findByText('Resumen listo');
    fireEvent.click(screen.getByRole('button', { name: 'Ver uso de tokens' }));
    expect(await screen.findByText('Entrada')).toBeInTheDocument();

    const classText = getClassText(screen.getByRole('dialog'));
    expect(classText).not.toMatch(decorativeAssistantClasses);
    expect(classText).not.toContain('animate-spin');
  });

  it('keeps parsed action confirmation free of decorative motion', async () => {
    mockParsedCategoryAction();
    render(<ControlledChat />);

    sendAssistantMessage('Crea una categoría para mascotas');
    expect(await screen.findByRole('button', { name: 'Confirmar' }))
      .toHaveClass('bg-primary-solid', 'text-primary-foreground');

    const classText = getClassText(screen.getByRole('dialog'));
    expect(classText).not.toMatch(decorativeAssistantClasses);
    expect(classText).not.toContain('animate-spin');
  });

  it('executes a parsed write only after explicit confirmation', async () => {
    mockParsedCategoryAction();
    render(<ControlledChat />);

    sendAssistantMessage('Crea una categoría para mascotas');
    const confirm = await screen.findByRole('button', { name: 'Confirmar' });
    expect(financeDomainMocks.addCategory).not.toHaveBeenCalled();

    fireEvent.click(confirm);

    await waitFor(() => {
      expect(financeDomainMocks.addCategory).toHaveBeenCalledWith('expense', 'Mascotas');
    });
    expect(financeDomainMocks.addCategory).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Acción ejecutada ✓')).toBeInTheDocument();
  });

  it('uses the complete balance history and refuses an unresolved financial context', async () => {
    const paginated = ledgerTransaction('recent', 10_000, '2026-08-24');
    const historical = ledgerTransaction('historical', 90_000, '2025-01-01');
    financeDomainMocks.transactions = [paginated];
    financeDomainMocks.balanceTransactions = [paginated, historical];
    sendChatMessageMock.mockResolvedValue({ text: 'Contexto completo' });
    parseActionFromResponseMock.mockReturnValue({ text: 'Contexto completo' });
    const { unmount } = render(<ControlledChat />);

    sendAssistantMessage('¿Cuál es mi saldo?');
    await screen.findByText('Contexto completo');
    expect(sendChatMessageMock).toHaveBeenCalledWith(
      '¿Cuál es mi saldo?',
      expect.any(Array),
      expect.objectContaining({ transactions: [paginated, historical] }),
    );

    unmount();
    sendChatMessageMock.mockClear();
    financeDomainMocks.balancesReady = false;
    render(<ControlledChat />);
    sendAssistantMessage('¿Cuál es mi saldo?');

    expect(await screen.findByText(/historial financiero completo/i)).toBeInTheDocument();
    expect(sendChatMessageMock).not.toHaveBeenCalled();
  });

  it('passes one stable AI operation ID and ignores a double confirmation while pending', async () => {
    financeDomainMocks.accounts = [savingsAccount];
    financeDomainMocks.categories = { income: [], expense: ['Alimentación'] };
    mockParsedTransactionAction();
    let resolveWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => { resolveWrite = resolve; });
    financeDomainMocks.addTransaction.mockReturnValue(pendingWrite);
    render(<ControlledChat />);

    sendAssistantMessage('Gasté 35 mil en almuerzo');
    const confirm = await screen.findByRole('button', { name: 'Confirmar' });
    act(() => {
      confirm.click();
      confirm.click();
    });

    expect(financeDomainMocks.addTransaction).toHaveBeenCalledTimes(1);
    expect(financeDomainMocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: expect.stringMatching(/^ledger-mutation:ai:/),
        mutationSource: 'ai',
      }),
    );

    await act(async () => {
      resolveWrite();
      await pendingWrite;
    });
    expect(await screen.findByText('Acción ejecutada ✓')).toBeInTheDocument();
  });

  it('does not create a missing category when the financial commit fails', async () => {
    financeDomainMocks.accounts = [savingsAccount];
    mockParsedTransactionAction();
    financeDomainMocks.addTransaction.mockRejectedValue(new Error('commit rechazado'));
    render(<ControlledChat />);

    sendAssistantMessage('Gasté 35 mil en almuerzo');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(/commit rechazado/i)).toBeInTheDocument();
    expect(financeDomainMocks.addCategory).not.toHaveBeenCalled();
  });

  it('reports a committed transaction truthfully and retries it with the same operation ID after category failure', async () => {
    financeDomainMocks.accounts = [savingsAccount];
    mockParsedTransactionAction();
    financeDomainMocks.addTransaction.mockResolvedValue(undefined);
    financeDomainMocks.addCategory
      .mockRejectedValueOnce(new Error('categoría rechazada'))
      .mockResolvedValueOnce(undefined);
    render(<ControlledChat />);

    sendAssistantMessage('Gasté 35 mil en almuerzo');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(/movimiento financiero sí quedó registrado/i))
      .toBeInTheDocument();
    expect(financeDomainMocks.addTransaction).toHaveBeenCalledTimes(1);
    expect(financeDomainMocks.addCategory).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Acción ejecutada ✓')).toBeInTheDocument();
    expect(financeDomainMocks.addTransaction).toHaveBeenCalledTimes(2);
    expect(financeDomainMocks.addCategory).toHaveBeenCalledTimes(2);
    expect(financeDomainMocks.addTransaction.mock.calls[0][0].operationId)
      .toBe(financeDomainMocks.addTransaction.mock.calls[1][0].operationId);
  });

  it('does not claim that nothing changed when category retry is cancelled after commit', async () => {
    financeDomainMocks.accounts = [savingsAccount];
    mockParsedTransactionAction();
    financeDomainMocks.addTransaction.mockResolvedValue(undefined);
    financeDomainMocks.addCategory.mockRejectedValue(new Error('categoría rechazada'));
    render(<ControlledChat />);

    sendAssistantMessage('Gasté 35 mil en almuerzo');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await screen.findByText(/movimiento financiero sí quedó registrado/i);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText(/movimiento financiero permanece registrado/i))
      .toBeInTheDocument();
    expect(screen.queryByText(/no se realizó ningún cambio/i)).toBeNull();
  });

  it('rejects a parsed write without mutating financial domains', async () => {
    mockParsedCategoryAction();
    render(<ControlledChat />);

    sendAssistantMessage('Crea una categoría para mascotas');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText(/no se realizó ningún cambio/i)).toBeInTheDocument();
    expect(financeDomainMocks.addCategory).not.toHaveBeenCalled();
    expect(financeDomainMocks.addTransaction).not.toHaveBeenCalled();
    expect(financeDomainMocks.updateTransaction).not.toHaveBeenCalled();
  });

  it('uses animate-spin only while a real assistant request is loading', async () => {
    let resolveRequest!: (value: { text: string }) => void;
    const pendingRequest = new Promise<{ text: string }>((resolve) => {
      resolveRequest = resolve;
    });
    sendChatMessageMock.mockReturnValue(pendingRequest);
    parseActionFromResponseMock.mockReturnValue({ text: 'Carga terminada' });
    render(<ControlledChat />);

    sendAssistantMessage('Analiza mis gastos');
    await screen.findByText('Pensando...');

    const dialog = screen.getByRole('dialog');
    const classText = getClassText(dialog);
    const spinners = dialog.querySelectorAll('.animate-spin');
    expect(classText).not.toMatch(decorativeAssistantClasses);
    expect(spinners).toHaveLength(1);
    expect(spinners[0].parentElement).toHaveTextContent('Pensando...');

    await act(async () => {
      resolveRequest({ text: 'Respuesta final' });
      await pendingRequest;
    });
    await screen.findByText('Carga terminada');
  });

  it('keeps the rendered error state free of decorative motion', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendChatMessageMock.mockRejectedValue(new Error('fallo visual controlado'));
    render(<ControlledChat />);

    sendAssistantMessage('Provoca un error controlado');
    await screen.findByText('Error: fallo visual controlado');

    const classText = getClassText(screen.getByRole('dialog'));
    expect(classText).not.toMatch(decorativeAssistantClasses);
    expect(classText).not.toContain('animate-spin');
  });
});
