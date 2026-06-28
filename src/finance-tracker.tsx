'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { MoreHorizontal } from 'lucide-react';
import { Header } from './components/layout/Header';
import { TabNavigation, NAV_TABS } from './components/layout/TabNavigation';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { FirestoreErrorBanner } from './components/layout/FirestoreErrorBanner';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { StatsCards, TransactionForm } from './components/shared';
import { AuthModal } from './components/modals/AuthModal';
import { WelcomeModal } from './components/modals/WelcomeModal';
import { HelpModal } from './components/modals/HelpModal';
import { CategoriesModal } from './components/modals/CategoriesModal';
import { GeminiKeyModal } from './components/modals/GeminiKeyModal';
import { GuestMigrationModal } from './components/modals/GuestMigrationModal';
import { GeminiKeyProvider, useGeminiKey } from './contexts/GeminiKeyContext';
import { clearGuestFinanceData } from './utils/localData';
import { hasGuestData, readGuestData } from './utils/guestMigration';
import { NotificationPreferencesModal } from './components/modals/NotificationPreferencesModal';
import { FirestoreProvider } from './contexts/FirestoreContext';
import { FinanceProvider, useFinance } from './contexts/FinanceContext';
import { TransactionsView } from './components/views/transactions';
import { useAuth } from './hooks/useAuth';
import { useAddTransaction } from './hooks/useAddTransaction';
import { useFilteredData } from './hooks/useFilteredData';
import { useWelcomeModal } from './hooks/useWelcomeModal';
import { useNotificationMonitoring } from './hooks';
import { useGuestMigration } from './hooks/useGuestMigration';
import { NotificationProvider, useNotificationContext } from './contexts/NotificationContext';
import { UIPreferencesProvider } from './contexts/UIPreferencesContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useViewRouting } from './hooks/useViewRouting';
import { useDismissable } from './hooks/useDismissable';
import { installGlobalErrorHandlers } from './lib/errorReporter';
import { TOAST_CONFIG, createInitialTransaction } from './config/constants';
import { DATE_PRESETS } from './utils/dateUtils';
import { parseDateFromInput } from './utils/formatters';
import { logger } from './utils/logger';
import type { NewTransaction, ViewType, FilterValue, DateRange, DateRangePreset } from './types/finance';
import { logoutFirebase, clearFirestorePersistence } from './lib/firebase';
import type { User } from 'firebase/auth';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { InstallPrompt } from './components/pwa/InstallPrompt';
const AIChatBot = lazy(() =>
  import('./components/chat/AIChatBot').then(m => ({ default: m.AIChatBot }))
);
import { AITeaserButton } from './components/chat/AITeaserButton';
import { OnboardingChecklist } from './components/onboarding/OnboardingChecklist';
import { PlanSkeleton } from './components/views/budgets/PlanSkeleton';

// Lazy-loaded secondary views
const StatsView = lazy(() =>
  import('./components/views/stats/StatsView').then(m => ({ default: m.StatsView }))
);
const AccountsView = lazy(() =>
  import('./components/views/accounts/AccountsView').then(m => ({ default: m.AccountsView }))
);
const RecurringPaymentsView = lazy(() =>
  import('./components/views/recurring/RecurringPaymentsView').then(m => ({ default: m.RecurringPaymentsView }))
);
const DebtsView = lazy(() =>
  import('./components/views/debts/DebtsView').then(m => ({ default: m.DebtsView }))
);
const BudgetsView = lazy(() =>
  import('./components/views/budgets/BudgetsView').then(m => ({ default: m.BudgetsView }))
);
const GoalsView = lazy(() =>
  import('./components/views/goals/GoalsView').then(m => ({ default: m.GoalsView }))
);

// Barra inferior móvil: subconjunto curado de pestañas (orden propio) + un menú
// "Más" con el resto. Las etiquetas/iconos salen de NAV_TABS para no divergir de
// la barra de escritorio (misma palabra por vista en ambas).
const MOBILE_PRIMARY_KEYS: ViewType[] = ['transactions', 'accounts', 'goals', 'stats'];
const MOBILE_MORE_KEYS: ViewType[] = ['recurring', 'debts', 'budgets'];
const tabsFor = (keys: ViewType[]) =>
  keys.map((key) => NAV_TABS.find((t) => t.key === key)!).filter(Boolean);
const MOBILE_PRIMARY_TABS = tabsFor(MOBILE_PRIMARY_KEYS);
const MOBILE_MORE_TABS = tabsFor(MOBILE_MORE_KEYS);

const ViewFallback = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-24 bg-muted rounded-xl" />
    <div className="h-16 bg-muted rounded-xl" />
    <div className="h-16 bg-muted rounded-xl" />
  </div>
);

/**
 * Outer wrapper: manages auth + provides single Firestore context
 * (eliminates triple-listener bug)
 */
const FinanceTracker = () => {
  const [mounted, setMounted] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  useEffect(() => {
    setMounted(true);
    // S8: captura errores JS globales no controlados y promesas sin .catch().
    installGlobalErrorHandlers();
  }, []);

  const { user, loading: authLoading } = useAuth();
  const isOnline = useNetworkStatus();

  // Mostrar UNA sola pantalla de carga que cubre auth + data loading
  // Solo se oculta cuando dataReady es true (los datos ya cargaron)
  const showLoading = !mounted || authLoading || (user && !dataReady);

  return (
    // S8: ErrorBoundary envuelve todo el árbol — captura errores de render
    // y los envía al errorReporter, mostrando una pantalla de error amigable.
    <ErrorBoundary>
      {showLoading && <LoadingScreen />}
      {mounted && !authLoading && (
        <div style={{ display: showLoading ? 'none' : undefined }}>
          <FirestoreProvider userId={user?.uid || null}>
            <UIPreferencesProvider>
              <GeminiKeyProvider userId={user?.uid || null}>
                <FinanceProvider userId={user?.uid || null}>
                  <NotificationProvider userId={user?.uid || null}>
                    <FinanceTrackerContent
                      user={user}
                      isOnline={isOnline}
                      onDataReady={setDataReady}
                    />
                  </NotificationProvider>
                </FinanceProvider>
              </GeminiKeyProvider>
            </UIPreferencesProvider>
          </FirestoreProvider>
        </div>
      )}
    </ErrorBoundary>
  );
};

/**
 * Inner component: UI logic, consuming shared FinanceContext
 */
const FinanceTrackerContent = ({ user, isOnline, onDataReady }: { user: User | null; isOnline: boolean; onDataReady: (ready: boolean) => void }) => {
  const {
    transactions,
    balanceTransactions,
    balancesReady,
    accounts,
    categories,
    recurringPayments,
    budgets,
    debts,
    defaultAccount,
    totalBalance,
    transactionsLoading,
    accountsLoading,
    addTransaction,
    addCreditPaymentAtomic,
    deleteCategory,
    addCategory,
    updateRecurringPayment,
    getAccountBalance,
    formatCurrency,
    firestoreError,
    retryLoad,
  } = useFinance();

  // Estado de IA (BYOK): si hay key pero falta autorizar el consentimiento,
  // mostramos un badge de "pendiente" sobre el botón de configuración.
  const { isConfigured: aiKeyConfigured, hasConsent: aiHasConsent } = useGeminiKey();
  const aiAuthPending = aiKeyConfigured && !aiHasConsent;
  const pendingSettingsCount = aiAuthPending ? 1 : 0;

  // Initialize notification system
  const { notificationManager } = useNotificationContext();

  // Set up notification monitoring
  useNotificationMonitoring({
    userId: user?.uid || null,
    transactions,
    balanceTransactions,
    budgets,
    recurringPayments,
    accounts,
    debts,
    notificationManager,
  });

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const newTransactionRef = useRef<NewTransaction>({ ...createInitialTransaction() });
  // Menú "Más" (móvil): refs para cierre unificado y restauración de foco.
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showAISettingsModal, setShowAISettingsModal] = useState(false);
  const [showNotificationPreferences, setShowNotificationPreferences] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  // S6: sincroniza la vista con ?view=<name> en la URL (back/forward funciona).
  const { view, setView } = useViewRouting();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [filterCategory, setFilterCategory] = useState<FilterValue>('all');
  const [filterAccount, setFilterAccount] = useState<FilterValue>('all');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('this-month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const dateRange = useMemo<DateRange>(() => {
    const range: DateRange = { preset: dateRangePreset };

    if (dateRangePreset === 'custom' && customStartDate) {
      range.startDate = parseDateFromInput(customStartDate);
    }

    if (dateRangePreset === 'custom' && customEndDate) {
      const endDate = parseDateFromInput(customEndDate);
      endDate.setHours(23, 59, 59, 999);
      range.endDate = endDate;
    }

    return range;
  }, [customEndDate, customStartDate, dateRangePreset]);
  const statsPeriodLabel = useMemo(() => {
    if (dateRangePreset === 'custom') return 'rango elegido';
    return DATE_PRESETS.find((preset) => preset.value === dateRangePreset)?.label.toLowerCase() || 'todo el tiempo';
  }, [dateRangePreset]);

  // Historial COMPLETO (balanceTransactions), no la ventana paginada de 500: las
  // tarjetas de resumen (Ingresos/Gastos/Pendientes) agregan sobre transacciones,
  // y con >500 tx un filtro "este año"/"todo" subcontaría periodos antiguos. Mismo
  // motivo que los saldos (C2) y los monitores de notificación. (#stats-1)
  const { dynamicStats, dynamicTotalBalance, balanceLabel } = useFilteredData({
    transactions: balanceTransactions, accounts, filterAccount, filterCategory, dateRange, totalBalance, getAccountBalance,
  });

  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    ...createInitialTransaction()
  });

  // Keep ref in sync for stable callbacks
  useEffect(() => { newTransactionRef.current = newTransaction; }, [newTransaction]);

  // Aviso honesto al reconectar: las escrituras se bloquean sin conexión
  // (no se encolan), así que al volver la conexión el usuario ya puede guardar.
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!wasOnlineRef.current && isOnline) {
      toast.success('Conexión restablecida — ya puedes guardar cambios');
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline]);

  const { showWelcomeModal, handleDismissWelcomeModal, setShowWelcomeModal } = useWelcomeModal({
    mounted: true,
    authLoading: false,
    accountsLoading,
    accountsCount: accounts.length,
  });

  // Memoized keyboard shortcuts (prevents array recreation each render)
  const shortcuts = useMemo(() => [
    {
      key: 'n', modifiers: ['ctrl' as const],
      description: 'Nueva transacción',
      action: () => { if (accounts.length > 0) { setShowForm(true); setView('transactions'); } }
    },
    { key: '1', modifiers: ['alt' as const], description: 'Ir a Transacciones', action: () => setView('transactions') },
    { key: '2', modifiers: ['alt' as const], description: 'Ir a Cuentas', action: () => setView('accounts') },
    { key: '3', modifiers: ['alt' as const], description: 'Ir a Pagos Periódicos', action: () => setView('recurring') },
    { key: '4', modifiers: ['alt' as const], description: 'Ir a Préstamos', action: () => setView('debts') },
    { key: '5', modifiers: ['alt' as const], description: 'Ir a Presupuestos', action: () => setView('budgets') },
    { key: '6', modifiers: ['alt' as const], description: 'Ir a Metas', action: () => setView('goals') },
    { key: '7', modifiers: ['alt' as const], description: 'Ir a Estadísticas', action: () => setView('stats') },
    { key: 'h', modifiers: ['ctrl' as const], description: 'Abrir ayuda', action: () => setShowHelpModal(true) },
    {
      key: 'Escape', description: 'Cerrar modal',
      action: () => { setShowForm(false); setShowHelpModal(false); setShowCategoriesModal(false); setIsAuthModalOpen(false); },
      preventDefault: false
    }
  ], [accounts.length]);

  useKeyboardShortcuts(shortcuts, { enabled: true, announceShortcuts: true });

  // Menú "Más" (móvil): cierre unificado (clic fuera + Escape, con restauración
  // de foco al disparador) — mismo patrón que el menú de Configuración y el
  // panel de Notificaciones en Header.
  const closeMoreMenu = useCallback(() => setShowMoreMenu(false), [setShowMoreMenu]);
  useDismissable({
    isOpen: showMoreMenu,
    onClose: closeMoreMenu,
    ref: moreMenuRef,
    triggerRef: moreButtonRef,
  });
  // Al abrir, enfocar el primer ítem del menú (WCAG 2.4.3 — foco gestionado).
  useEffect(() => {
    if (!showMoreMenu) return;
    const first = moreMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
  }, [showMoreMenu]);

  // C-FIX (paginación + saldos): la validación de "Saldo insuficiente" de
  // useAddTransaction deriva el saldo sumando transacciones; debe usar el
  // historial completo (balanceTransactions), no la ventana paginada de 500.
  // balancesReady: mientras el historial asienta se omite la validación de
  // saldo/cupo (si no, se rechazaría con un falso "Saldo insuficiente"). #3.
  const { handleAddTransaction, handleAddAndContinue } = useAddTransaction({
    accounts, transactions: balanceTransactions, balancesReady, recurringPayments,
    defaultAccount: defaultAccount || null,
    addTransaction, addCreditPaymentAtomic, updateRecurringPayment,
    setNewTransaction, setShowForm, setShowWelcomeModal,
  });

  // S1: ofrecer migrar datos del modo invitado a la cuenta tras iniciar sesión.
  const guestMigration = useGuestMigration(user?.uid ?? null);

  const handleLogout = useCallback(async () => {
    // Si hay datos de invitado sin migrar, advertir antes de borrarlos: al cerrar
    // sesión se limpia el localStorage (privacidad S2) y esos datos se perderían.
    if (hasGuestData(readGuestData())) {
      const confirmed = window.confirm(
        'Tienes datos locales que aún no se han guardado en tu cuenta. ' +
          'Si cierras sesión se borrarán de este dispositivo y no podrás recuperarlos. ' +
          '¿Quieres cerrar sesión de todos modos?'
      );
      if (!confirmed) return;
    }

    try {
      setIsLoggingOut(true);
      await logoutFirebase();
      // Privacidad (S2): borrar datos locales para que en un dispositivo
      // compartido el siguiente usuario no vea los datos del anterior.
      clearGuestFinanceData();
      toast.success('Sesión cerrada correctamente');
      await new Promise(resolve => setTimeout(resolve, 800));
      // S2b: vaciar la caché IndexedDB de Firestore y reiniciar a estado limpio.
      // (terminate inutiliza la instancia, por eso recargamos después.)
      await clearFirestorePersistence();
      window.location.reload();
    } catch (error) {
      logger.error('Error al cerrar sesión', error);
      toast.error('Error al cerrar sesión');
      setIsLoggingOut(false);
    }
  }, []);

  const handleCloseAuthModal = useCallback(() => setIsAuthModalOpen(false), [setIsAuthModalOpen]);
  const handleOpenHelpModal = useCallback(() => setShowHelpModal(true), []);
  const handleOpenCategories = useCallback(() => setShowCategoriesModal(true), []);
  const handleOpenNotificationPreferences = useCallback(() => setShowNotificationPreferences(true), []);
  const handleCloseCategories = useCallback(() => setShowCategoriesModal(false), []);
  const handleCloseHelpModal = useCallback(() => setShowHelpModal(false), []);
  const handleCloseNotificationPreferences = useCallback(() => setShowNotificationPreferences(false), []);
  const handleCloseForm = useCallback(() => { setBatchCount(0); setShowForm(false); }, [setBatchCount, setShowForm]);
  const handleRestoreTransaction = useCallback(
    (t: Omit<import('./types/finance').Transaction, 'id' | 'createdAt'>) => addTransaction(t),
    [addTransaction]
  );

  // Stable callbacks for TransactionForm (use ref to avoid re-creation on every keystroke)
  const handleSubmit = useCallback(() => {
    setBatchCount(0);
    handleAddTransaction(newTransactionRef.current);
  }, [handleAddTransaction]);

  const handleSubmitAndContinue = useCallback(async () => {
    const success = await handleAddAndContinue(newTransactionRef.current);
    if (success) setBatchCount(prev => prev + 1);
  }, [handleAddAndContinue]);

  const handleGoToAccounts = useCallback(() => {
    handleDismissWelcomeModal();
    setView('accounts');
  }, [handleDismissWelcomeModal]);

  // Notificar al padre cuando los datos están listos
  const isDataLoading = user && (accountsLoading || transactionsLoading);
  useEffect(() => {
    onDataReady(!isDataLoading);
  }, [isDataLoading, onDataReady]);

  if (isLoggingOut) {
    return <LoadingScreen message="Cerrando sesión..." variant="logout" />;
  }

  return (
    <div className="flex flex-col h-dvh bg-background bg-gradient-to-br from-violet-50/30 via-purple-50/20 to-fuchsia-50/10 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Banner de sin conexión + sync status */}
      <OfflineIndicator />

      {/* Install PWA Banner (mobile only) */}
      <InstallPrompt variant="banner" />

      {/* Overlay para cerrar menú "Más" - FUERA del nav para cubrir toda la
          pantalla. El cierre por clic/Escape lo gestiona useDismissable; este
          overlay aporta el "scrim" táctil que captura el toque en móvil. */}
      {showMoreMenu && (
        <div className="sm:hidden fixed inset-0 z-[60]" aria-hidden="true" onClick={closeMoreMenu} onTouchStart={closeMoreMenu} />
      )}

      {/* Popover de "Más" - posicionado fixed para evitar conflictos de z-index.
          --shell-nav-h ata el offset del popover a la altura de la barra inferior. */}
      {showMoreMenu && (
        <div
          ref={moreMenuRef}
          role="menu"
          aria-label="Más secciones"
          className="sm:hidden fixed right-3 z-[70] bg-card text-card-foreground rounded-xl shadow-xl border border-border overflow-hidden min-w-[var(--shell-more-menu-w,170px)] animate-in slide-in-from-bottom-2 duration-150 fade-in [bottom:var(--shell-nav-h,72px)]"
        >
          {MOBILE_MORE_TABS.map(tab => (
            <button
              key={tab.key}
              role="menuitem"
              onClick={() => {
                scrollContainerRef.current?.scrollTo({ top: 0 });
                setView(tab.key);
                closeMoreMenu();
                moreButtonRef.current?.focus();
              }}
              className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${view === tab.key
                ? 'text-primary bg-muted'
                : 'text-foreground hover:bg-muted active:bg-muted'
                }`}
            >
              <tab.icon size={18} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Mobile Bottom Navigation - Fixed at bottom, FUERA del contenedor scrollable */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-[100] bg-card/95 backdrop-blur-md border-t border-border shadow-lg safe-area-bottom"
        aria-label="Navegación principal"
        role="navigation"
      >
        <div className="flex justify-around items-center px-2 py-1.5 pb-2" role="tablist">
          {MOBILE_PRIMARY_TABS.map(tab => (
            <button
              key={tab.key}
              id={`tab-${tab.key}-mobile`}
              role="tab"
              aria-selected={view === tab.key}
              aria-controls={`panel-${tab.key}`}
              onClick={() => {
                if (view === tab.key) {
                  scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  scrollContainerRef.current?.scrollTo({ top: 0 });
                  setView(tab.key);
                }
                setShowMoreMenu(false);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-[56px] rounded-xl transition-[background-color,color,transform] ${view === tab.key
                ? 'text-primary bg-muted scale-105'
                : 'text-muted-foreground active:scale-95 active:bg-muted'
                }`}
            >
              <tab.icon size={20} strokeWidth={view === tab.key ? 2.5 : 2} aria-hidden="true" />
              <span className="text-[10px] font-semibold leading-tight">{tab.label}</span>
            </button>
          ))}
          {/* Botón "Más" */}
          <div className="relative">
            <button
              ref={moreButtonRef}
              onClick={() => {
                if (showMoreMenu) {
                  closeMoreMenu();
                } else {
                  setShowMoreMenu(true);
                }
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-[56px] rounded-xl transition-[background-color,color,transform] ${MOBILE_MORE_KEYS.includes(view)
                ? 'text-primary bg-muted scale-105'
                : showMoreMenu
                  ? 'text-primary'
                  : 'text-muted-foreground active:scale-95 active:bg-muted'
                }`}
              aria-haspopup="menu"
              aria-expanded={showMoreMenu}
              aria-label="Más secciones"
            >
              <MoreHorizontal size={20} strokeWidth={MOBILE_MORE_KEYS.includes(view) ? 2.5 : 2} aria-hidden="true" />
              <span className="text-[10px] font-semibold leading-tight">Más</span>
            </button>
          </div>
        </div>
      </nav>

      <Toaster
        position={TOAST_CONFIG.position}
        containerStyle={TOAST_CONFIG.containerStyle}
        toastOptions={{
          duration: TOAST_CONFIG.duration,
          style: TOAST_CONFIG.style,
          success: TOAST_CONFIG.success,
          error: TOAST_CONFIG.error,
        }}
      />

      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={handleCloseAuthModal}
        />
      )}

      {guestMigration.showPrompt && (
        <GuestMigrationModal
          isOpen={guestMigration.showPrompt}
          counts={guestMigration.counts}
          isMigrating={guestMigration.isMigrating}
          hasError={guestMigration.hasError}
          onImport={guestMigration.runMigration}
          onDismiss={guestMigration.dismiss}
          onDiscard={guestMigration.discard}
        />
      )}

      {showWelcomeModal && !guestMigration.showPrompt && (
        <WelcomeModal
          isOpen={showWelcomeModal}
          onClose={handleDismissWelcomeModal}
          onGoToAccounts={handleGoToAccounts}
        />
      )}

      {showHelpModal && (
        <HelpModal
          isOpen={showHelpModal}
          onClose={handleCloseHelpModal}
        />
      )}

      {showCategoriesModal && (
        <CategoriesModal
          isOpen={showCategoriesModal}
          onClose={handleCloseCategories}
          categories={categories}
          addCategory={addCategory}
          deleteCategory={deleteCategory}
        />
      )}

      {showNotificationPreferences && (
        <NotificationPreferencesModal
          isOpen={showNotificationPreferences}
          onClose={handleCloseNotificationPreferences}
        />
      )}

      {showAISettingsModal && (
        <GeminiKeyModal
          isOpen={showAISettingsModal}
          onClose={() => setShowAISettingsModal(false)}
        />
      )}

      <Header
        user={user}
        setIsAuthModalOpen={setIsAuthModalOpen}
        showSettingsMenu={showSettingsMenu}
        setShowSettingsMenu={setShowSettingsMenu}
        showNotifications={showNotifications}
        setShowNotifications={setShowNotifications}
        onOpenHelp={handleOpenHelpModal}
        onOpenCategories={handleOpenCategories}
        onOpenNotificationPreferences={handleOpenNotificationPreferences}
        onOpenAISettings={() => setShowAISettingsModal(true)}
        onLogout={handleLogout}
        pendingSettingsCount={pendingSettingsCount}
        aiAuthPending={aiAuthPending}
      />

      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-5 pb-24 sm:pb-6">
          <div className="max-w-7xl mx-auto">
            <OnboardingChecklist
              hasAccounts={accounts.length > 0}
              hasTransactions={transactions.length > 0}
              aiReady={!!user && aiKeyConfigured && aiHasConsent}
              onGoToAccounts={() => setView('accounts')}
              onAddTransaction={() => { setView('transactions'); setShowForm(true); }}
              onOpenAISettings={() => setShowAISettingsModal(true)}
            />
            <StatsCards
              balanceSettling={!balancesReady}
              totalBalance={dynamicTotalBalance}
              totalIncome={dynamicStats.totalIncome}
              totalExpenses={dynamicStats.totalExpenses}
              pendingExpenses={dynamicStats.pendingExpenses}
              formatCurrency={formatCurrency}
              balanceLabel={balanceLabel}
              periodLabel={statsPeriodLabel}
              hasAccounts={accounts.length > 0}
            />

            {/* Error banner when Firestore fails */}
            {firestoreError && (
              <FirestoreErrorBanner
                error={firestoreError}
                onRetry={retryLoad}
                isOnline={isOnline}
              />
            )}

            <TabNavigation
              view={view}
              setView={setView}
            />

            {view === 'transactions' && (
              <div id="panel-transactions" role="tabpanel" aria-labelledby="tab-transactions">
                <TransactionForm
                  isOpen={showForm}
                  newTransaction={newTransaction}
                  setNewTransaction={setNewTransaction}
                  onSubmit={handleSubmit}
                  onSubmitAndContinue={handleSubmitAndContinue}
                  onCancel={handleCloseForm}
                  batchCount={batchCount}
                />

                <TransactionsView
                  showForm={showForm}
                  setShowForm={setShowForm}
                  filterCategory={filterCategory}
                  setFilterCategory={setFilterCategory}
                  filterAccount={filterAccount}
                  setFilterAccount={setFilterAccount}
                  dateRangePreset={dateRangePreset}
                  setDateRangePreset={setDateRangePreset}
                  customStartDate={customStartDate}
                  setCustomStartDate={setCustomStartDate}
                  customEndDate={customEndDate}
                  setCustomEndDate={setCustomEndDate}
                  loading={transactionsLoading || accountsLoading}
                  onRestore={handleRestoreTransaction}
                  onGoToAccounts={() => setView('accounts')}
                  onOpenAISettings={() => setShowAISettingsModal(true)}
                />
              </div>
            )}

            {view === 'recurring' && (
              <div id="panel-recurring" role="tabpanel" aria-labelledby="tab-recurring">
                <Suspense fallback={<ViewFallback />}>
                  <RecurringPaymentsView />
                </Suspense>
              </div>
            )}

            {view === 'stats' && (
              <div id="panel-stats" role="tabpanel" aria-labelledby="tab-stats">
                <Suspense fallback={<ViewFallback />}>
                  <StatsView />
                </Suspense>
              </div>
            )}

            {view === 'accounts' && (
              <div id="panel-accounts" role="tabpanel" aria-labelledby="tab-accounts">
                <Suspense fallback={<ViewFallback />}>
                  <AccountsView />
                </Suspense>
              </div>
            )}

            {view === 'debts' && (
              <div id="panel-debts" role="tabpanel" aria-labelledby="tab-debts">
                <Suspense fallback={<ViewFallback />}>
                  <DebtsView />
                </Suspense>
              </div>
            )}

            {view === 'budgets' && (
              <div id="panel-budgets" role="tabpanel" aria-labelledby="tab-budgets">
                {/* Fallback con la forma del plan (no el genérico): así la bajada del
                    chunk y la carga interna son UN solo skeleton continuo, sin saltar
                    de "3 barras" a "círculo" en la primera entrada. */}
                <Suspense fallback={<PlanSkeleton />}>
                  <BudgetsView />
                </Suspense>
              </div>
            )}

            {view === 'goals' && (
              <div id="panel-goals" role="tabpanel" aria-labelledby="tab-goals">
                <Suspense fallback={<ViewFallback />}>
                  <GoalsView />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Asistente IA (A6) — descubrible siempre:
          - listo (sesión + key + consentimiento) → chat completo (lazy).
          - invitado o sin key/consentimiento → teaser ligero que invita a
            activarlo (abre login o GeminiKeyModal). Evita cargar el chunk del
            chat / el cliente Gemini hasta que la IA esté realmente lista. */}
      {user && aiKeyConfigured && aiHasConsent ? (
        <Suspense fallback={null}>
          <AIChatBot />
        </Suspense>
      ) : (
        <AITeaserButton
          isLoggedIn={!!user}
          onActivate={() => (user ? setShowAISettingsModal(true) : setIsAuthModalOpen(true))}
        />
      )}
    </div>
  );
};

export default FinanceTracker;
