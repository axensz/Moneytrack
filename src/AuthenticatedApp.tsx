'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Header } from './components/layout/Header';
import { TabNavigation } from './components/layout/TabNavigation';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { FirestoreErrorBanner } from './components/layout/FirestoreErrorBanner';
import { FinanceNotificationBridge } from './components/layout/FinanceNotificationBridge';
import { FinanceViewRouter } from './components/layout/FinanceViewRouter';
import { MobileNavigation } from './components/layout/MobileNavigation';
import { TransactionForm } from './components/shared';
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
import { FinanceProvider } from './contexts/FinanceContext';
import { TransactionsView } from './components/views/transactions';
import { useAddTransaction } from './hooks/useAddTransaction';
import { useWelcomeModal } from './hooks/useWelcomeModal';
import { useGuestMigration } from './hooks/useGuestMigration';
import { NotificationProvider } from './contexts/NotificationContext';
import { UIPreferencesProvider } from './contexts/UIPreferencesContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useViewRouting } from './hooks/useViewRouting';
import { useViewTransitionFocus } from './hooks/useViewTransitionFocus';
import {
  useAccountDomain,
  useBeneficiaryDomain,
  useCategoryDomain,
  useFinanceStatus,
  useRecurringDomain,
  useTransactionDomain,
} from './hooks/useFinanceSelectors';
import { TOAST_CONFIG, createInitialTransaction } from './config/constants';
import { UI_TEXT, VIEW_SHORTCUTS } from './config/ui';
import { logger } from './utils/logger';
import type { NewTransaction, FilterValue, DateRangePreset } from './types/finance';
import { logoutFirebase } from './lib/firebase';
import { clearFirestorePersistence } from './lib/firebaseDb';
import type { User } from 'firebase/auth';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { InstallPrompt } from './components/pwa/InstallPrompt';
import { AssistantLauncher } from './components/chat/AssistantLauncher';
const AIChatBot = lazy(() =>
  import('./components/chat/AIChatBot').then(m => ({ default: m.AIChatBot }))
);
import { OnboardingChecklist } from './components/onboarding/OnboardingChecklist';
import type { BudgetDraft } from './components/views/budgets/BudgetsView';

/**
 * Subárbol autenticado (cargado lazy desde el boot shell `finance-tracker`).
 * Aislado en su propio chunk: el SDK de Firestore (~490KB) y todo el código de
 * la app viven aquí y bajan DESPUÉS del primer paint, no en el bundle de arranque.
 * Recibe user/isOnline/onDataReady del shell; `hidden` lo mantiene montado pero
 * oculto mientras el splash sigue arriba (auth/datos cargando).
 */
export const AuthenticatedApp = ({ user, isOnline, onDataReady, hidden }: { user: User | null; isOnline: boolean; onDataReady: (ready: boolean) => void; hidden: boolean }) => (
  <div style={{ display: hidden ? 'none' : undefined }}>
    <FirestoreProvider userId={user?.uid || null}>
      <UIPreferencesProvider>
        <GeminiKeyProvider userId={user?.uid || null}>
          <FinanceProvider userId={user?.uid || null}>
            <NotificationProvider userId={user?.uid || null}>
              <FinanceTrackerContent
                user={user}
                isOnline={isOnline}
                onDataReady={onDataReady}
              />
            </NotificationProvider>
          </FinanceProvider>
        </GeminiKeyProvider>
      </UIPreferencesProvider>
    </FirestoreProvider>
  </div>
);

/**
 * Inner component: UI logic, consuming shared FinanceContext
 */
const FinanceTrackerContent = ({ user, isOnline, onDataReady }: { user: User | null; isOnline: boolean; onDataReady: (ready: boolean) => void }) => {
  const {
    transactions,
    balanceTransactions,
    balancesReady,
    addTransaction,
    addCreditPaymentAtomic,
    addRecurringTransactionAtomic,
    restoreTransaction,
  } = useTransactionDomain();
  const {
    accounts,
    defaultAccount,
  } = useAccountDomain();
  const {
    categories,
    addCategory,
    deleteCategory,
  } = useCategoryDomain();
  const {
    beneficiaries: transactionBeneficiaries,
    addBeneficiary: addTransactionBeneficiary,
    deleteBeneficiary: deleteTransactionBeneficiary,
  } = useBeneficiaryDomain();
  const {
    recurringPayments,
  } = useRecurringDomain();
  const {
    transactionsLoading,
    accountsLoading,
    firestoreError,
    retryLoad,
  } = useFinanceStatus();
  // Estado de IA (BYOK): el launcher comunica si falta terminar la autorización.
  const { isConfigured: aiKeyConfigured, hasConsent: aiHasConsent } = useGeminiKey();
  const aiReady = Boolean(user && aiKeyConfigured && aiHasConsent);
  const aiAuthPending = aiKeyConfigured && !aiHasConsent;

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { scrollContainerRef, handleViewChange, handleViewMounted, focusMainContent } = useViewTransitionFocus();
  const newTransactionRef = useRef<NewTransaction>({ ...createInitialTransaction() });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showAISettingsModal, setShowAISettingsModal] = useState(false);
  const [showNotificationPreferences, setShowNotificationPreferences] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [hasMountedAssistant, setHasMountedAssistant] = useState(false);
  const assistantTriggerRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenAssistant = useCallback((returnFocusTo: HTMLButtonElement) => {
    assistantTriggerRef.current = returnFocusTo;
    setHasMountedAssistant(true);
    setIsAssistantOpen(true);
  }, []);

  const assistantLabel = !user
    ? 'Inicia sesión para usar el asistente IA'
    : aiReady
      ? 'Abrir asistente IA'
      : 'Activar asistente IA';

  const activateAssistant = useCallback((trigger: HTMLButtonElement) => {
    if (!user) setIsAuthModalOpen(true);
    else if (!aiReady) setShowAISettingsModal(true);
    else handleOpenAssistant(trigger);
  }, [aiReady, handleOpenAssistant, user]);

  const [showForm, setShowForm] = useState(false);
  const [pendingBudgetDraft, setPendingBudgetDraft] = useState<BudgetDraft | null>(null);
  const [batchCount, setBatchCount] = useState(0);
  // S6: sincroniza la vista con ?view=<name> en la URL (back/forward funciona).
  const { view, setView } = useViewRouting({ onViewChange: handleViewChange });
  const [filterCategory, setFilterCategory] = useState<FilterValue>('all');
  const [filterAccount, setFilterAccount] = useState<FilterValue>('all');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('this-month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    ...createInitialTransaction()
  });

  // Keep ref in sync for stable callbacks
  useEffect(() => { newTransactionRef.current = newTransaction; }, [newTransaction]);

  const handleCloseForm = useCallback(() => {
    setBatchCount(0);
    setNewTransaction({
      ...createInitialTransaction(),
      accountId: defaultAccount?.id || '',
    });
    setShowForm(false);
  }, [defaultAccount?.id, setBatchCount, setNewTransaction, setShowForm]);

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
      key: 'n',
      description: UI_TEXT.titles.newTransaction,
      action: () => { if (accounts.length > 0) { setShowForm(true); setView('transactions'); } }
    },
    ...VIEW_SHORTCUTS.map(({ key, view: targetView, description }) => ({
      key,
      description,
      action: () => setView(targetView),
    })),
    { key: 'h', description: 'Abrir ayuda', action: () => setShowHelpModal(true) },
    {
      key: 'Escape', description: 'Cerrar modal',
      action: () => { handleCloseForm(); setShowHelpModal(false); setShowCategoriesModal(false); setIsAuthModalOpen(false); },
      preventDefault: false
    }
  ], [
    accounts.length,
    handleCloseForm,
    setIsAuthModalOpen,
    setShowCategoriesModal,
    setShowHelpModal,
    setView,
  ]);

  useKeyboardShortcuts(shortcuts, { enabled: true, announceShortcuts: true });

  const handleUseBudgetSuggestion = useCallback((category: string, suggestedLimit: number) => {
    setPendingBudgetDraft({ category, suggestedLimit });
    setView('budgets');
  }, [setView]);

  const handleBudgetDraftApplied = useCallback(() => {
    setPendingBudgetDraft(null);
  }, []);

  // C-FIX (paginación + saldos): la validación de "Saldo insuficiente" de
  // useAddTransaction deriva el saldo sumando transacciones; debe usar el
  // historial completo (balanceTransactions), no la ventana paginada de 500.
  // balancesReady: mientras el historial asienta se omite la validación de
  // saldo/cupo (si no, se rechazaría con un falso "Saldo insuficiente"). #3.
  const { handleAddTransaction, handleAddAndContinue } = useAddTransaction({
    accounts, transactions: balanceTransactions, balancesReady, recurringPayments,
    defaultAccount: defaultAccount || null,
    addTransaction, addCreditPaymentAtomic, addRecurringTransactionAtomic,
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
  const handleRestoreTransaction = useCallback(
    (transaction: import('./types/finance').Transaction) => restoreTransaction(transaction),
    [restoreTransaction]
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
  }, [handleDismissWelcomeModal, setView]);

  // Notificar al padre cuando los datos están listos
  const isDataLoading = user && (accountsLoading || transactionsLoading);
  useEffect(() => {
    onDataReady(!isDataLoading);
  }, [isDataLoading, onDataReady]);

  if (isLoggingOut) {
    return <LoadingScreen message="Cerrando sesión..." variant="logout" />;
  }

  return (
    <div className="flex flex-col h-dvh w-full min-w-0 overflow-x-hidden bg-background bg-gradient-to-br from-violet-50/30 via-purple-50/20 to-fuchsia-50/10 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Banner de sin conexión + sync status */}
      <OfflineIndicator />

      {/* Install PWA Banner (mobile only) */}
      <InstallPrompt variant="banner" />

      <FinanceNotificationBridge userId={user?.uid ?? null} />

      <MobileNavigation
        view={view}
        setView={setView}
        scrollContainerRef={scrollContainerRef}
      />

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
          beneficiaries={transactionBeneficiaries}
          addBeneficiary={addTransactionBeneficiary}
          deleteBeneficiary={deleteTransactionBeneficiary}
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

      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          focusMainContent();
        }}
      >
        Saltar al contenido principal
      </a>

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
        onGoToTransactions={() => setView('transactions')}
        onLogout={handleLogout}
      />

      <div className="relative flex flex-col flex-1 min-h-0 min-w-0">
      <main id="main-content" ref={scrollContainerRef} tabIndex={-1} className="flex-1 min-h-0 overflow-auto">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-5 pb-24 sm:pb-6">
          <div className="max-w-7xl mx-auto">
            <OnboardingChecklist
              hasAccounts={accounts.length > 0}
              hasTransactions={transactions.length > 0}
              onGoToAccounts={() => setView('accounts')}
              onAddTransaction={() => { setView('transactions'); setShowForm(true); }}
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

            <FinanceViewRouter
              view={view}
              transactionsPanel={(
                <>
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
                  />
                </>
              )}
              pendingBudgetDraft={pendingBudgetDraft}
              onBudgetDraftApplied={handleBudgetDraftApplied}
              onGoToTransactions={() => setView('transactions')}
              onOpenFinancialPlan={() => setView('financial-plan')}
              onUseBudgetSuggestion={handleUseBudgetSuggestion}
              onViewMounted={handleViewMounted}
            />
          </div>
        </div>
      </main>

      <AssistantLauncher
        label={assistantLabel}
        isOpen={isAssistantOpen}
        isPending={aiAuthPending}
        onActivate={activateAssistant}
      />

      {hasMountedAssistant && aiReady && (
        <Suspense fallback={null}>
          <AIChatBot
            isOpen={isAssistantOpen}
            onClose={() => setIsAssistantOpen(false)}
            returnFocusRef={assistantTriggerRef}
          />
        </Suspense>
      )}
      </div>
    </div>
  );
};

