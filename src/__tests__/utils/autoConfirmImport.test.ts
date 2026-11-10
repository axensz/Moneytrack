import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../../types/finance';
import type {
  PaymentInstrument,
  PendingTransactionImportCandidate,
} from '../../types/transactionImport';
import {
  buildMerchantAccountHistory,
  buildMerchantCategoryHistory,
  cleanMerchantForAnalysis,
  evaluateAutoConfirmCandidate,
  normalizeMerchant,
} from '../../utils/autoConfirmImport';

type NotificationCandidate = Extract<
  PendingTransactionImportCandidate,
  { source: 'android-notification' }
>;
type ShortcutCandidate = Extract<
  PendingTransactionImportCandidate,
  { source: 'android-shortcut' }
>;

const EXPENSE_CATEGORIES = [
  'Alimentación',
  'Transporte',
  'Servicios',
  'Educación',
  'Entretenimiento',
];

const notificationCandidate = (
  overrides: Partial<NotificationCandidate> = {},
): NotificationCandidate => ({
  id: 'a'.repeat(64),
  schemaVersion: 1,
  source: 'android-notification',
  sourcePackage: 'com.example.bank',
  occurredAt: new Date('2026-08-25T13:00:00.000Z'),
  amountMinor: 1_234_500,
  currency: 'COP',
  merchant: 'Mercado Central',
  cardLast4: '1234',
  parserId: 'strict-cop-purchase',
  parserVersion: 1,
  confidence: 'high',
  status: 'pending',
  ...overrides,
});

const shortcutCandidate = (
  overrides: Partial<ShortcutCandidate> = {},
): ShortcutCandidate => ({
  id: 'b'.repeat(64),
  schemaVersion: 3,
  source: 'android-shortcut',
  occurredAt: new Date('2026-09-13T17:00:00.000Z'),
  amountMinor: 259_900,
  currency: 'COP',
  merchant: 'Almuerzo',
  suggestedAccountId: 'savings',
  suggestedCategory: 'Alimentación',
  createdAt: new Date('2026-09-13T17:01:00.000Z'),
  status: 'pending',
  ...overrides,
});

const instrument = (
  overrides: Partial<PaymentInstrument> = {},
): PaymentInstrument => ({
  id: 'wallet-1234',
  schemaVersion: 2,
  label: 'Oro',
  accountId: 'card',
  kind: 'wallet-token',
  last4: '1234',
  network: 'visa',
  active: true,
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  updatedAt: new Date('2026-08-01T12:00:00.000Z'),
  ...overrides,
});

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'card',
  name: 'TC principal',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 2_000_000,
  usedCredit: 0,
  ...overrides,
});

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  type: 'expense',
  amount: 10_000,
  category: 'Alimentación',
  description: 'Mercado Central',
  date: new Date('2026-07-01T13:00:00.000Z'),
  paid: true,
  accountId: 'card',
  ...overrides,
});

describe('normalizeMerchant & cleanMerchantForAnalysis', () => {
  it('quita acentos, baja a minúsculas y colapsa espacios', () => {
    expect(normalizeMerchant('  ÉXITO   Vecino  ')).toBe('exito vecino');
  });

  it('limpia prefijos de pasarelas de pago y sufijos societarios', () => {
    expect(cleanMerchantForAnalysis('BOLD*JUAN VALDEZ 104')).toBe('juan valdez 104');
    expect(cleanMerchantForAnalysis('DL*RAPPI COLOMBIA S.A.S. #12')).toBe('rappi colombia');
    expect(cleanMerchantForAnalysis('Compra en TIENDAS D1 SUC 45')).toBe('tiendas d1');
  });
});

describe('buildMerchantCategoryHistory', () => {
  it('elige la categoría más frecuente por comercio normalizado', () => {
    const history = buildMerchantCategoryHistory([
      transaction({ description: 'Mercado Central', category: 'Alimentación' }),
      transaction({ description: 'mercado central', category: 'Alimentación' }),
      transaction({ description: 'MERCADO CENTRAL', category: 'Compras Personales' }),
    ]);
    const counts = history.get('mercado central');
    expect(counts?.get('Alimentación')).toBe(2);
    expect(counts?.get('Compras Personales')).toBe(1);
  });

  it('ignora ingresos y transacciones sin categoría o comercio', () => {
    const history = buildMerchantCategoryHistory([
      transaction({ type: 'income', description: 'Salario', category: 'Salario' }),
      transaction({ description: '  ', category: 'Alimentación' }),
      transaction({ description: 'Tienda', category: '   ' }),
    ]);
    expect(history.size).toBe(0);
  });

  it('empata de forma determinista por orden alfabético', () => {
    const history = buildMerchantCategoryHistory([
      transaction({ description: 'Tienda', category: 'Transporte' }),
      transaction({ description: 'Tienda', category: 'Alimentación' }),
    ]);
    // Empate 1-1 → gana 'Alimentación' (alfabéticamente menor), determinista.
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({ merchant: 'Tienda' }),
      instruments: [instrument()],
      accounts: [account()],
      expenseCategories: EXPENSE_CATEGORIES,
      history,
    });
    expect(result).toEqual({
      autoConfirm: true,
      accountId: 'card',
      category: 'Alimentación',
      instrumentId: 'wallet-1234',
    });
  });
});

describe('evaluateAutoConfirmCandidate', () => {
  it('auto-confirma con cuenta única + categoría por historial', () => {
    const history = buildMerchantCategoryHistory([
      transaction({ description: 'Mercado Central', category: 'Alimentación' }),
      transaction({ description: 'Mercado Central', category: 'Alimentación' }),
    ]);
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate(),
      instruments: [instrument()],
      accounts: [account()],
      expenseCategories: EXPENSE_CATEGORIES,
      history,
    });
    expect(result).toEqual({
      autoConfirm: true,
      accountId: 'card',
      category: 'Alimentación',
      instrumentId: 'wallet-1234',
    });
  });

  it('auto-confirma con cuenta única + categoría por regla de patrón (sin historial)', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({ merchant: 'Uber trip 123' }),
      instruments: [instrument()],
      accounts: [account()],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({
      autoConfirm: true,
      accountId: 'card',
      category: 'Transporte',
      instrumentId: 'wallet-1234',
    });
  });

  it('deja en revisión por cuenta ambigua', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({ merchant: 'Uber trip' }),
      instruments: [
        instrument({ id: 'one', accountId: 'card-a' }),
        instrument({ id: 'two', accountId: 'card-b' }),
      ],
      accounts: [account({ id: 'card-a' }), account({ id: 'card-b' })],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({ autoConfirm: false, reason: 'cuenta-ambigua' });
  });

  it('deja en revisión por match inexistente', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({ cardLast4: '9999' }),
      instruments: [instrument()],
      accounts: [account()],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({ autoConfirm: false, reason: 'cuenta-sin-match' });
  });

  it('auto-confirma los atajos cuando la cuenta y la categoría sugeridas son válidas', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: shortcutCandidate(),
      instruments: [instrument({ accountId: 'savings' })],
      accounts: [account({ id: 'savings', type: 'savings' })],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({
      autoConfirm: true,
      accountId: 'savings',
      category: 'Alimentación',
    });
  });

  it('deja en revisión los atajos cuando la cuenta sugerida ya no existe', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: shortcutCandidate({ suggestedAccountId: 'deleted-account' }),
      instruments: [],
      accounts: [account({ id: 'savings', type: 'savings' })],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({ autoConfirm: false, reason: 'cuenta-sin-match' });
  });

  it('infiere cuenta por paquete bancario y categoría con prefijo de pasarela', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({
        sourcePackage: 'com.nequi.MobileApp',
        cardLast4: undefined,
        merchant: 'BOLD*JUAN VALDEZ CAFE',
      }),
      instruments: [],
      accounts: [account({ id: 'nequi-1', name: 'Nequi', type: 'savings' })],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({
      autoConfirm: true,
      accountId: 'nequi-1',
      category: 'Alimentación',
    });
  });

  it('infiere cuenta por historial de comercio cuando la notificación no trae últimos 4 dígitos', () => {
    const previousTx = [
      transaction({
        description: 'Panadería del Parque',
        category: 'Alimentación',
        accountId: 'savings',
      }),
    ];
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({
        cardLast4: undefined,
        merchant: 'BOLD*PANADERIA DEL PARQUE',
      }),
      instruments: [],
      accounts: [
        account({ id: 'savings', name: 'Ahorros', type: 'savings' }),
        account({ id: 'card', name: 'TC principal', type: 'credit' }),
      ],
      expenseCategories: EXPENSE_CATEGORIES,
      history: buildMerchantCategoryHistory(previousTx),
      accountHistory: buildMerchantAccountHistory(previousTx),
    });
    expect(result).toEqual({
      autoConfirm: true,
      accountId: 'savings',
      category: 'Alimentación',
    });
  });

  it('deja en revisión por cuenta archivada', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({ merchant: 'Uber trip' }),
      instruments: [instrument()],
      accounts: [account({ archived: true })],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({ autoConfirm: false, reason: 'cuenta-sin-match' });
  });

  it('deja en revisión por sin-categoría-confiable (ni historial ni regla)', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({ merchant: 'Comercio Raro XYZ' }),
      instruments: [instrument()],
      accounts: [account()],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({ autoConfirm: false, reason: 'sin-categoria-confiable' });
  });

  it('deja en revisión si el historial resuelve a una categoría inexistente', () => {
    const history = buildMerchantCategoryHistory([
      transaction({ description: 'Mercado Central', category: 'Categoría Borrada' }),
    ]);
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate(),
      instruments: [instrument()],
      accounts: [account()],
      expenseCategories: EXPENSE_CATEGORIES,
      history,
    });
    expect(result).toEqual({ autoConfirm: false, reason: 'sin-categoria-confiable' });
  });

  it('deja en revisión por datos faltantes (comercio vacío)', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({ merchant: '   ' }),
      instruments: [instrument()],
      accounts: [account()],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({ autoConfirm: false, reason: 'datos-faltantes' });
  });

  it('deja en revisión por datos faltantes (monto <= 0)', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({ amountMinor: 0 }),
      instruments: [instrument()],
      accounts: [account()],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({ autoConfirm: false, reason: 'datos-faltantes' });
  });

  it('deja en revisión por datos faltantes (fecha inválida)', () => {
    const result = evaluateAutoConfirmCandidate({
      candidate: notificationCandidate({ occurredAt: new Date(Number.NaN) }),
      instruments: [instrument()],
      accounts: [account()],
      expenseCategories: EXPENSE_CATEGORIES,
      history: new Map(),
    });
    expect(result).toEqual({ autoConfirm: false, reason: 'datos-faltantes' });
  });
});
