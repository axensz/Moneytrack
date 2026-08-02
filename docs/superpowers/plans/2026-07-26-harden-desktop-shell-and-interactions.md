# Harden Desktop Shell and Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desktop navigation, view changes, dialogs, transaction rows, critical finance forms, and transaction filters keyboard-operable and WCAG 2.1 AA coherent without changing financial data behavior or mobile navigation structure.

**Architecture:** Keep view ownership in `AuthenticatedApp` and URL ownership in `useViewRouting`. Route every view transition through its existing hook callback, reset the existing internal scroller there, and use a mounted view wrapper in `FinanceViewRouter` to focus a stable canonical heading only after lazy content commits. Repair shared behavior in `useModalA11y` and native controls rather than creating a new routing, modal, or form framework.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Vitest 4, React Testing Library, jsdom, lucide-react.

## Global Constraints

- Do not add dependencies; use the existing React, browser, Vitest, and Testing Library APIs.
- Preserve financial data models, Firestore write paths, business validation rules, and filtering results.
- Preserve the existing mobile navigation structure and layout; shared semantic corrections must work at mobile breakpoints.
- Desktop visual scope is 1024×768, 1280×720, and 1440×900. The desktop tab strip owns any horizontal overflow; the app scroller must not widen.
- Use `sectionTitle(view)` and `NAV_TABS` as the canonical desktop-view title and navigation-label sources.
- Keep the visual system from `PRODUCT.md` and `DESIGN.md`: violet is brand/focus, status colors remain status-only, no new motion library, and respect `prefers-reduced-motion`.
- Every changed icon-only action needs an accessible name, focus-visible treatment, and an explicit `type` when inside a form.
- Use native `<form>`, `<label>`, `<fieldset>`, `<legend>`, `<button>`, and coherent ARIA patterns; do not mix a listbox contract with non-keyboard-operable options.
- Run all commands through `npm.cmd`; do not use bare `npm` commands in this Windows workspace.

---

## File map

- `src/hooks/useViewRouting.ts`: URL/state transition source for tabs, shortcuts, notification navigation, and browser history.
- `src/AuthenticatedApp.tsx`: owns the current internal scroll container and all desktop/cross-view callbacks.
- `src/components/layout/FinanceViewRouter.tsx`: lazy view switch and the post-mount focus boundary.
- `src/components/layout/TabNavigation.tsx`: desktop tablist overflow and ARIA keyboard model.
- `src/components/modals/HelpModal.tsx`: independent Help tablist.
- `src/hooks/useModalA11y.ts`: shared visible-enabled tabbable selection, trapping, and trigger restoration.
- `src/components/notifications/NotificationCenter.tsx`: portaled notification dialog and row actions.
- `src/components/views/transactions/components/TransactionItem.tsx`: transaction-row interaction boundary.
- `src/components/views/debts/components/NewDebtForm.tsx`, `src/components/views/budgets/BudgetsView.tsx`, `src/components/views/goals/GoalsView.tsx`: critical finance form semantics.
- `src/components/views/transactions/components/FilterDropdown.tsx`: custom transaction filter popup keyboard model.

### Task 1: Centralize view transitions, landmark, and post-lazy focus

**Files:**
- Modify: `src/hooks/useViewRouting.ts:14-106`
- Modify: `src/AuthenticatedApp.tsx:135-250,442-519`
- Modify: `src/components/layout/FinanceViewRouter.tsx:1-115`
- Modify: `src/components/views/transactions/TransactionsView.tsx`
- Modify: `src/components/views/accounts/AccountsView.tsx`
- Modify: `src/components/views/recurring/RecurringPaymentsView.tsx`
- Modify: `src/components/views/debts/DebtsView.tsx`
- Modify: `src/components/views/budgets/BudgetsView.tsx`
- Modify: `src/components/views/goals/GoalsView.tsx`
- Modify: `src/components/views/stats/StatsView.tsx`
- Modify: `src/components/views/financial-plan/FinancialPlanView.tsx`
- Modify: `src/components/layout/MobileNavigation.tsx:16-56`
- Modify: `src/__tests__/hooks/useViewRouting.test.ts`
- Create: `src/__tests__/components/desktopShellNavigation.test.tsx`

**Interfaces:**
- Produces from `useViewRouting.ts`:
  ```ts
  export interface UseViewRoutingOptions {
    onViewChange?: (view: ViewType) => void;
  }
  export function useViewRouting(options?: UseViewRoutingOptions): {
    readonly view: ViewType;
    readonly setView: (view: ViewType) => void;
  };
  ```
- Produces from `FinanceViewRouter.tsx`:
  ```ts
  interface FinanceViewRouterProps {
    view: ViewType;
    transactionsPanel: React.ReactNode;
    pendingBudgetDraft: BudgetDraft | null;
    onBudgetDraftApplied: () => void;
    onOpenFinancialPlan: () => void;
    onUseBudgetSuggestion: (category: string, suggestedLimit: number) => void;
    onViewMounted: (view: ViewType) => void;
  }
  ```
- Consumes in `AuthenticatedApp.tsx`:
  ```ts
  const handleViewChange = useCallback((nextView: ViewType) => {
    pendingFocusViewRef.current = nextView;
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);
  ```
- Every view exposes exactly one entry target: `<h2 id={`view-heading-${view}`} tabIndex={-1}>` with the canonical `sectionTitle(view)` text. Financial Plan retains one entry `h2`; other internal section headings become `h3`.

- [ ] **Step 1: Write the failing routing and shell tests**

  Add these tests to `src/__tests__/hooks/useViewRouting.test.ts` and create `desktopShellNavigation.test.tsx` with a minimal shell harness that renders a `main`, a button calling `setView`, and a lazy view resolving to `<h2 id="view-heading-stats" tabIndex={-1}>Estadísticas</h2>`:

  ```tsx
  it('notifies the shell once for direct navigation and once for browser history', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useViewRouting({ onViewChange }));
    act(() => result.current.setView('stats'));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenLastCalledWith('stats');

    act(() => {
      window.history.pushState({ view: 'accounts' }, '', '/?view=accounts');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(onViewChange).toHaveBeenCalledTimes(2);
    expect(onViewChange).toHaveBeenLastCalledWith('accounts');
  });

  it('provides a skip link, resets the app scroller, and focuses the lazy view heading after mount', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
    render(<DesktopShellHarness initialView="transactions" />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('main'));

    await userEvent.click(screen.getByRole('button', { name: 'Ir a Estadísticas' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(screen.queryByRole('heading', { name: 'Estadísticas' })).toBeNull();
    await screen.findByRole('heading', { name: 'Estadísticas' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Estadísticas' }));
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/hooks/useViewRouting.test.ts src/__tests__/components/desktopShellNavigation.test.tsx
  ```

  Expected: FAIL because `useViewRouting` has no options callback, the shell has no skip link/main landmark, and no lazy-mounted focus callback exists.

- [ ] **Step 3: Write the minimal implementation**

  In `useViewRouting`, hold `onViewChange` in a ref and call it after both the direct state/URL update and `handlePopState`; do not invoke it from `navigateToActionUrl`, because that helper already dispatches `popstate`.

  ```ts
  const onViewChangeRef = useRef(options?.onViewChange);
  onViewChangeRef.current = options?.onViewChange;
  const applyView = useCallback((nextView: ViewType) => {
    setViewState(nextView);
    onViewChangeRef.current?.(nextView);
  }, []);
  ```

  In `AuthenticatedApp`, pass `handleViewChange` to the hook, replace every desktop/shared `setView(...)` callback with the returned setter, place `<a className="skip-link" href="#main-content">Saltar al contenido principal</a>` before `Header`, and replace the scroll-container `<div>` with `<main id="main-content" ref={scrollContainerRef} tabIndex={-1} className="flex-1 min-h-0 overflow-auto">`.

  In `FinanceViewRouter`, put each resolved view inside an internal `FocusedPanel` committed inside its `Suspense`; its effect calls `onViewMounted(view)`. `onViewMounted` in `AuthenticatedApp` only focuses `document.getElementById(`view-heading-${view}`)` when `pendingFocusViewRef.current === view`, then clears the ref. Give every desktop view exactly that `h2`; preserve visual styles and convert duplicated/internal `h2` elements to `h3`.

  Pass the same `setView` callback to `MobileNavigation`; retain its own scroll/menu behavior and do not alter its tab structure.

- [ ] **Step 4: Run the tests to verify they pass**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/hooks/useViewRouting.test.ts src/__tests__/components/desktopShellNavigation.test.tsx
  ```

  Expected: PASS. Direct URL navigation, synthetic notification `popstate`, and browser history each reset/focus through one callback; lazy focus occurs only after the heading exists.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/hooks/useViewRouting.ts src/AuthenticatedApp.tsx src/components/layout/FinanceViewRouter.tsx src/components/layout/MobileNavigation.tsx src/components/views/transactions/TransactionsView.tsx src/components/views/accounts/AccountsView.tsx src/components/views/recurring/RecurringPaymentsView.tsx src/components/views/debts/DebtsView.tsx src/components/views/budgets/BudgetsView.tsx src/components/views/goals/GoalsView.tsx src/components/views/stats/StatsView.tsx src/components/views/financial-plan/FinancialPlanView.tsx src/__tests__/hooks/useViewRouting.test.ts src/__tests__/components/desktopShellNavigation.test.tsx
  git commit -m "feat: centralize accessible view transitions"
  ```

### Task 2: Contain desktop navigation and implement the primary tab keyboard model

**Files:**
- Modify: `src/components/layout/TabNavigation.tsx:1-47`
- Modify: `src/__tests__/components/desktopShellNavigation.test.tsx`

**Interfaces:**
- Consumes: `TabNavigationProps { view: ViewType; setView: (view: ViewType) => void }` unchanged.
- Produces: one desktop tab with `tabIndex={0}`, all other tabs `tabIndex={-1}`, and `onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>)` supporting ArrowLeft, ArrowRight, Home, and End.

- [ ] **Step 1: Write the failing navigation tests**

  Add these cases to `desktopShellNavigation.test.tsx`:

  ```tsx
  it.each([
    ['ArrowRight', 'transactions', 'accounts'],
    ['ArrowLeft', 'transactions', 'goals'],
    ['Home', 'goals', 'transactions'],
    ['End', 'transactions', 'goals'],
  ])('moves %s from %s to %s with roving tabindex', async (key, from, to) => {
    const setView = vi.fn();
    render(<TabNavigation view={from as ViewType} setView={setView} />);
    const current = screen.getByRole('tab', { selected: true });
    current.focus();
    fireEvent.keyDown(current, { key });
    expect(setView).toHaveBeenCalledWith(to);
    expect(screen.getByRole('tab', { name: new RegExp(sectionTitle(to)) })).toHaveFocus();
  });

  it('keeps desktop overflow inside the navigation surface', () => {
    const { container } = render(<TabNavigation view="transactions" setView={vi.fn()} />);
    expect(container.querySelector('[role="tablist"]')).toHaveClass('min-w-max');
    expect(container.querySelector('[data-desktop-tab-scroll]')).toHaveClass('overflow-x-auto');
    expect(container.querySelector('nav')).toHaveClass('max-w-full');
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/desktopShellNavigation.test.tsx
  ```

  Expected: FAIL because tabs have no roving `tabIndex`, keyboard handler, `data-desktop-tab-scroll`, or local overflow container.

- [ ] **Step 3: Write the minimal implementation**

  Add one `useRef<HTMLButtonElement[]>` in `TabNavigation`. Wrap its existing tablist in `<div data-desktop-tab-scroll className="max-w-full overflow-x-auto">`, keep the tablist as `className="flex min-w-max ..."`, and use this handler:

  ```ts
  const nextIndex = key === 'Home' ? 0 : key === 'End' ? NAV_TABS.length - 1 :
    (index + (key === 'ArrowRight' ? 1 : -1) + NAV_TABS.length) % NAV_TABS.length;
  const nextTab = NAV_TABS[nextIndex];
  setView(nextTab.key);
  requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  tabRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  ```

  Ignore all keys except ArrowLeft, ArrowRight, Home, and End; call `event.preventDefault()` for those keys. Set `tabIndex={view === tab.key ? 0 : -1}`.

- [ ] **Step 4: Run the test to verify it passes**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/desktopShellNavigation.test.tsx
  ```

  Expected: PASS. All eight `NAV_TABS` remain reachable without making the main scroller wider.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/components/layout/TabNavigation.tsx src/__tests__/components/desktopShellNavigation.test.tsx
  git commit -m "feat: harden desktop tab navigation"
  ```

### Task 3: Give Help the same complete tab pattern

**Files:**
- Modify: `src/components/modals/HelpModal.tsx:1-172`
- Create: `src/__tests__/components/helpModalTabs.test.tsx`

**Interfaces:**
- Consumes: `HelpModalProps { isOpen: boolean; onClose: () => void }` unchanged.
- Produces: `HELP_TABS` roving tab behavior with `tabIndex`, ArrowLeft/ArrowRight, Home/End, wrapping, selected panel update, and focused tab visibility.

- [ ] **Step 1: Write the failing Help tests**

  ```tsx
  it('wraps Help tabs and updates the selected panel with ArrowRight', () => {
    render(<HelpModal isOpen onClose={vi.fn()} />);
    const first = screen.getByRole('tab', { name: 'Inicio' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Atajos', selected: true })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'help-tab-shortcuts');
  });

  it('uses exactly one tabbable Help tab', () => {
    render(<HelpModal isOpen onClose={vi.fn()} />);
    expect(screen.getAllByRole('tab').filter(tab => tab.getAttribute('tabindex') === '0')).toHaveLength(1);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/helpModalTabs.test.tsx
  ```

  Expected: FAIL because Help tabs change only on click and every tab is tabbable.

- [ ] **Step 3: Write the minimal implementation**

  Add `tabRefs`, a local `selectTab(nextIndex)` callback, and the same four-key handler from Task 2. The handler calls `setActiveTab(HELP_TABS[nextIndex].id)`, focuses that button in `requestAnimationFrame`, and calls `scrollIntoView({ block: 'nearest', inline: 'nearest' })`. Set `tabIndex={activeTab === tab.id ? 0 : -1}` without changing Help content or modal dimensions.

- [ ] **Step 4: Run the test to verify it passes**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/helpModalTabs.test.tsx
  ```

  Expected: PASS. Help has the same complete tab contract as desktop navigation.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/components/modals/HelpModal.tsx src/__tests__/components/helpModalTabs.test.tsx
  git commit -m "feat: add keyboard navigation to help tabs"
  ```

### Task 4: Repair shared modal focus containment and restoration

**Files:**
- Modify: `src/hooks/useModalA11y.ts:23-135`
- Modify: `src/__tests__/hooks/useModalA11y.test.tsx`
- Verify: `src/__tests__/components/modalRobustness.test.tsx`

**Interfaces:**
- Keeps `useModalA11y<T extends HTMLElement = HTMLDivElement>(options): { modalRef; onKeyDown }` unchanged.
- Produces an internal `getTabbableElements(container: HTMLElement): HTMLElement[]` that excludes disabled, hidden, `aria-hidden="true"`, and CSS-invisible descendants.

- [ ] **Step 1: Write the failing modal tests**

  Extend `TestModal` with a hidden button, disabled button, first enabled button, and last enabled button. Add:

  ```tsx
  it('focuses the first visible enabled control instead of hidden or disabled controls', async () => {
    render(<TestModal isOpen onClose={vi.fn()} autoFocusContainer />);
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(screen.getByTestId('first-enabled')).toHaveFocus();
  });

  it('recovers Shift+Tab from the dialog container and outside focus to the last control', () => {
    render(<TestModal isOpen onClose={vi.fn()} />);
    const dialog = screen.getByTestId('dialog');
    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('last')).toHaveFocus();
    document.body.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('last')).toHaveFocus();
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/hooks/useModalA11y.test.tsx src/__tests__/components/modalRobustness.test.tsx
  ```

  Expected: FAIL because opening focuses the dialog container and the trap only wraps when focus is exactly first or last.

- [ ] **Step 3: Write the minimal implementation**

  Replace the raw selector result with:

  ```ts
  function getTabbableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) =>
      !element.hasAttribute('disabled') &&
      !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' &&
      getComputedStyle(element).display !== 'none' &&
      getComputedStyle(element).visibility !== 'hidden'
    );
  }
  ```

  On open, request-animation-frame focus `tabbables[0] ?? modalRef.current`. In `onKeyDown`, treat `document.activeElement === modalRef.current` or `!modalRef.current.contains(document.activeElement)` as a boundary: Shift+Tab focuses last; Tab focuses first. Preserve the existing escape stack, body overflow counter, and trigger restoration.

- [ ] **Step 4: Run the tests to verify they pass**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/hooks/useModalA11y.test.tsx src/__tests__/components/modalRobustness.test.tsx
  ```

  Expected: PASS. Existing stacked modal behavior remains unchanged while all focus boundaries are recoverable.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/hooks/useModalA11y.ts src/__tests__/hooks/useModalA11y.test.tsx
  git commit -m "fix: harden shared modal focus trap"
  ```

### Task 5: Make Notification Center a named keyboard-operable dialog

**Files:**
- Modify: `src/components/notifications/NotificationCenter.tsx:1-227`
- Modify: `src/__tests__/components/NotificationCenterNavigation.test.tsx`

**Interfaces:**
- Consumes: `NotificationCenterProps { isOpen: boolean; onClose: () => void }` unchanged.
- Consumes: `useModalA11y({ isOpen, onClose })` from Task 4.
- Produces: a portaled `<div role="dialog" aria-modal="true" aria-labelledby="notification-center-title">` and one native notification action button per notification.

- [ ] **Step 1: Write the failing Notification Center tests**

  ```tsx
  it('opens a named dialog and focuses its close action', async () => {
    render(<><button>Notificaciones</button><NotificationCenter isOpen onClose={vi.fn()} /></>);
    const dialog = screen.getByRole('dialog', { name: 'Notificaciones' });
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar notificaciones' })).toHaveFocus());
  });

  it('activates and deletes notification actions from the keyboard', async () => {
    const onClose = vi.fn();
    render(<NotificationCenter isOpen onClose={onClose} />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(mocks.markAsRead).toHaveBeenCalledWith('notification-1'));
    render(<NotificationCenter isOpen onClose={vi.fn()} />);
    const deleteButton = screen.getByRole('button', { name: 'Eliminar notificación' });
    expect(deleteButton.className).toContain('focus-visible:ring-2');
    deleteButton.focus();
    await userEvent.keyboard('{Enter}');
    expect(mocks.deleteNotification).toHaveBeenCalledWith('notification-1');
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/NotificationCenterNavigation.test.tsx
  ```

  Expected: FAIL because the portaled panel has no dialog contract and notification rows are clickable `div` elements.

- [ ] **Step 3: Write the minimal implementation**

  Attach `modalRef` and `onKeyDown` from `useModalA11y` to the panel, give the heading `id="notification-center-title"`, and set the close button as the first visible control. Replace the notification row outer `div` with a semantic `<button type="button" aria-label={`Abrir notificación: ${notification.title}`}>`; position the delete button as its sibling in the row so no interactive element nests inside another. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary` to delete and preserve `handleNotificationClick`, `markAsRead`, and `navigateToActionUrl`.

- [ ] **Step 4: Run the test to verify it passes**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/NotificationCenterNavigation.test.tsx
  ```

  Expected: PASS. Mouse navigation, URL behavior, keyboard activation, deletion, Escape, and dialog focus all work.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/components/notifications/NotificationCenter.tsx src/__tests__/components/NotificationCenterNavigation.test.tsx
  git commit -m "feat: make notification center keyboard operable"
  ```

### Task 6: Remove the interactive transaction-row ancestor

**Files:**
- Modify: `src/components/views/transactions/components/TransactionItem.tsx:160-330`
- Modify: `src/__tests__/utils/transactionItemA11y.test.tsx`

**Interfaces:**
- Keeps `TransactionItemProps` unchanged.
- Produces: only the named Chevron button controls `onToggleExpand(transaction.id!)`; the row container is a non-interactive `<div>`.

- [ ] **Step 1: Replace the false-negative test with a failing ancestor assertion**

  Replace the current empty-name role assertion with:

  ```tsx
  it('does not place edit, delete, or expand controls inside an interactive row ancestor', () => {
    renderItem({ isExpanded: false, onToggleExpand: vi.fn() });
    for (const control of [
      screen.getByRole('button', { name: 'Editar transacción' }),
      screen.getByRole('button', { name: 'Eliminar transacción' }),
      screen.getByRole('button', { name: 'Expandir detalle' }),
    ]) {
      expect(control.parentElement?.closest('[role="button"], a[href]')).toBeNull();
    }
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/utils/transactionItemA11y.test.tsx
  ```

  Expected: FAIL because the outer row has `role="button"`, `tabIndex`, click, and keyboard expansion behavior.

- [ ] **Step 3: Write the minimal implementation**

  Remove from the row wrapper `onClick`, `role`, `tabIndex`, `aria-expanded`, and `onKeyDown`; remove the cursor-pointer branch tied to `onToggleExpand`. Keep the existing named Chevron `<button type="button">`, `aria-expanded`, and edit/delete callbacks. Do not alter inline edit behavior, `areEqual`, or transaction persistence callbacks.

- [ ] **Step 4: Run the test to verify it passes**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/utils/transactionItemA11y.test.tsx
  ```

  Expected: PASS. Expansion remains available only through the labeled button and edit/delete behavior is unchanged.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/components/views/transactions/components/TransactionItem.tsx src/__tests__/utils/transactionItemA11y.test.tsx
  git commit -m "fix: remove nested transaction row interactions"
  ```

### Task 7: Make the new-debt form natively semantic

**Files:**
- Modify: `src/components/views/debts/components/NewDebtForm.tsx:1-115`
- Modify: `src/components/views/debts/DebtsView.tsx:64-109`
- Modify: `src/__tests__/components/debtsViewFormBehavior.test.tsx`

**Interfaces:**
- Changes `NewDebtFormProps.onSubmit` from `() => void` to `(event: React.FormEvent<HTMLFormElement>) => void`.
- Produces `handleSubmit(event)` in `DebtsView`, calling `event.preventDefault()` before its existing validation and `addDebt` path.

- [ ] **Step 1: Write failing debt-form accessibility tests**

  ```tsx
  it('names every debt field, groups debt direction, and submits once with Enter', async () => {
    render(<DebtsView />);
    await userEvent.click(screen.getByRole('button', { name: /nuevo/i }));
    expect(screen.getByRole('group', { name: 'Tipo de deuda' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la persona')).toBeInTheDocument();
    expect(screen.getByLabelText('Monto')).toBeInTheDocument();
    expect(screen.getByLabelText('Cuenta asociada')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nombre de la persona'), 'Ana{Enter}');
    expect(mocks.addDebt).toHaveBeenCalledTimes(0);
    expect(screen.getByLabelText('Nombre de la persona')).toHaveAttribute('aria-invalid', 'false');
  });

  it('associates an existing validation error with the invalid field', async () => {
    render(<DebtsView />);
    await userEvent.click(screen.getByRole('button', { name: /nuevo/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    const name = screen.getByLabelText('Nombre de la persona');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(name.getAttribute('aria-describedby')!)).toHaveTextContent('Ingresa el nombre de la persona');
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/debtsViewFormBehavior.test.tsx
  ```

  Expected: FAIL because NewDebtForm is a `div`, text/select fields are unnamed, direction buttons are ungrouped, and errors are toast-only.

- [ ] **Step 3: Write the minimal implementation**

  Make the outer element `<form onSubmit={onSubmit}>`; give fields stable ids and `label htmlFor`. Wrap the lent/borrowed buttons in `<fieldset><legend>Tipo de deuda</legend>`, use `aria-pressed`, and set their type to `button`. Keep one local `error` state in `DebtsView` with exact messages already used by validation; set `aria-invalid` and `aria-describedby` only for the failing field, render `<p id="new-debt-person-error" role="alert">…</p>`, and still call `showToast.error(error)` to preserve current feedback. Set Registrar `type="submit"` and Cancel `type="button"`.

- [ ] **Step 4: Run the test to verify it passes**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/debtsViewFormBehavior.test.tsx
  ```

  Expected: PASS. Existing debt creation behavior remains unchanged; accessible names, group state, Enter submission, and error state now exist.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/components/views/debts/components/NewDebtForm.tsx src/components/views/debts/DebtsView.tsx src/__tests__/components/debtsViewFormBehavior.test.tsx
  git commit -m "feat: add semantic debt form controls"
  ```

### Task 8: Make budget and goal creation/contribution forms semantic

**Files:**
- Modify: `src/components/views/budgets/BudgetsView.tsx:75-237`
- Modify: `src/components/views/goals/GoalsView.tsx:44-245,280-340`
- Modify: `src/__tests__/components/budgetsViewPlanActions.test.tsx`
- Modify: `src/__tests__/utils/goalsDisclosure.test.tsx`
- Create: `src/__tests__/components/financeFormsA11y.test.tsx`

**Interfaces:**
- Keeps `BudgetsViewProps` and `GoalsView` public props unchanged.
- Produces native `onSubmit(event: React.FormEvent<HTMLFormElement>)` wrappers that preserve `handleBudgetSubmit`, `handleSubmit`, and `handleAddSavings` domain calls.

- [ ] **Step 1: Write failing budget and goal tests**

  ```tsx
  it('names budget category and monthly limit and prevents support actions from submitting', async () => {
    render(<BudgetsView />);
    await userEvent.click(screen.getByRole('button', { name: /nuevo/i }));
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument();
    expect(screen.getByLabelText('Límite mensual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute('type', 'button');
  });

  it('names goal creation and contribution fields and submits each native form once', async () => {
    render(<GoalsView />);
    await userEvent.click(screen.getByRole('button', { name: /nueva meta/i }));
    expect(screen.getByLabelText('Nombre de la meta')).toBeInTheDocument();
    expect(screen.getByLabelText('Monto objetivo')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha límite')).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/budgetsViewPlanActions.test.tsx src/__tests__/utils/goalsDisclosure.test.tsx src/__tests__/components/financeFormsA11y.test.tsx
  ```

  Expected: FAIL because the forms are `div` blocks with placeholder-only fields and implicit button types.

- [ ] **Step 3: Write the minimal implementation**

  In Budget and Goal creation, use `<form onSubmit={(event) => { event.preventDefault(); void handleBudgetSubmit(); }}>` and the equivalent goal callback. Add ids, associated labels, existing-validation error state/`aria-describedby`, `aria-invalid`, submit type, and cancel type. Set type `button` for the budget heading toggle, recommendation “Usar”, plan link, goal show/hide controls, and every icon action that is not submitting. Wrap the per-goal “Agregar ahorro” controls in its own form with label `Monto a ahorrar para ${goal.name}` and `onSubmit` calling existing `handleAddSavings(goal.id!)`; do not change the disclosure that savings do not move account balances.

- [ ] **Step 4: Run the tests to verify they pass**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/budgetsViewPlanActions.test.tsx src/__tests__/utils/goalsDisclosure.test.tsx src/__tests__/components/financeFormsA11y.test.tsx
  ```

  Expected: PASS. Existing budget/goal behavior and disclosure remain intact while controls are queryable and keyboard-submittable.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/components/views/budgets/BudgetsView.tsx src/components/views/goals/GoalsView.tsx src/__tests__/components/budgetsViewPlanActions.test.tsx src/__tests__/utils/goalsDisclosure.test.tsx src/__tests__/components/financeFormsA11y.test.tsx
  git commit -m "feat: add semantic budget and goal forms"
  ```

### Task 9: Complete the transaction filter listbox keyboard model

**Files:**
- Modify: `src/components/views/transactions/components/FilterDropdown.tsx:1-146`
- Modify: `src/__tests__/utils/filterDropdownA11y.test.tsx`

**Interfaces:**
- Keeps `FilterDropdownProps` unchanged.
- Produces trigger focus restoration after selection/Escape and keyboard movement among option buttons with `role="option"`.

- [ ] **Step 1: Write failing filter keyboard tests**

  ```tsx
  it.each([
    ['ArrowDown', 'Cuenta (Todos)', 'Cuenta A'],
    ['ArrowUp', 'Cuenta (Todos)', 'Cuenta B'],
    ['End', 'Cuenta (Todos)', 'Cuenta B'],
    ['Home', 'Cuenta B', 'Cuenta (Todos)'],
  ])('moves %s from %s to %s', (key, from, to) => {
    renderDropdown({ isOpen: true });
    const current = screen.getByRole('option', { name: from });
    current.focus();
    fireEvent.keyDown(screen.getByRole('listbox'), { key });
    expect(screen.getByRole('option', { name: to })).toHaveFocus();
  });

  it('returns focus to trigger after Escape and after selecting with Enter', () => {
    const { onClose, onChange } = renderDropdown({ isOpen: true });
    const trigger = screen.getByRole('button', { name: /Cuenta/ });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('option', { name: 'Cuenta A' }), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('a');
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/utils/filterDropdownA11y.test.tsx
  ```

  Expected: FAIL because FilterDropdown only closes on Escape and options have no keyboard movement/selection/focus restoration.

- [ ] **Step 3: Write the minimal implementation**

  Add trigger and option refs. Give each option button `tabIndex={isOpen ? 0 : -1}` and an `onKeyDown` that delegates to the listbox handler. Flatten the “Todos” option plus `optionGroups` into one ordered `Option[]` before rendering. On ArrowUp/Down use modulo wrap; Home selects index 0; End selects final index. On Enter or Space call the existing `onChange(value)` then `onClose()` then `requestAnimationFrame(() => triggerRef.current?.focus())`. Escape does the same close/focus restoration. Keep listbox/listoption roles, selection values, grouped headings, and filtering callbacks unchanged.

- [ ] **Step 4: Run the test to verify it passes**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/utils/filterDropdownA11y.test.tsx
  ```

  Expected: PASS. Popup role, Arrow/Home/End movement, keyboard selection, Escape, and trigger return form one coherent listbox model.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/components/views/transactions/components/FilterDropdown.tsx src/__tests__/utils/filterDropdownA11y.test.tsx
  git commit -m "feat: complete transaction filter keyboard controls"
  ```

### Task 10: Run shared mobile regressions and full verification

**Files:**
- Verify only: all files changed in Tasks 1-9

**Interfaces:**
- Consumes all completed task interfaces; produces no new code.

- [ ] **Step 1: Write the focused mobile regression assertions**

  Add `window.matchMedia` mocks and assertions to the existing changed-control tests, keeping the mobile navigation test target explicit:

  ```tsx
  it('keeps mobile navigation structure unchanged while shared semantics remain operable', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    render(<MobileNavigation view="transactions" setView={vi.fn()} scrollContainerRef={{ current: null }} />);
    expect(screen.getByRole('navigation', { name: /navegación principal/i })).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
  ```

  Add equivalent narrow-viewport assertions to the NotificationCenter, TransactionItem, finance form, and FilterDropdown suites: their named controls remain present and keyboard-operable; do not assert a desktop-only visual layout.

- [ ] **Step 2: Run focused shared-control and mobile characterization tests**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/desktopShellNavigation.test.tsx src/__tests__/components/helpModalTabs.test.tsx src/__tests__/hooks/useModalA11y.test.tsx src/__tests__/components/modalRobustness.test.tsx src/__tests__/components/NotificationCenterNavigation.test.tsx src/__tests__/utils/transactionItemA11y.test.tsx src/__tests__/components/debtsViewFormBehavior.test.tsx src/__tests__/components/budgetsViewPlanActions.test.tsx src/__tests__/utils/goalsDisclosure.test.tsx src/__tests__/components/financeFormsA11y.test.tsx src/__tests__/utils/filterDropdownA11y.test.tsx
  ```

  Expected: PASS after Tasks 1-9. These assertions characterize the preserved
  mobile structure and shared-control semantics. If one fails, keep the
  failing assertion and proceed to Step 3 with the smallest shared fix.

- [ ] **Step 3: Write the minimal implementation only if a regression failed**

  Correct only the shared semantic or accessibility regression exposed in
  Step 2. Do not edit production mobile navigation structure or introduce a
  mobile-specific layout change.

- [ ] **Step 4: Run focused, static, build, and full tests**

  Run:

  ```powershell
  npm.cmd exec vitest -- run --config vitest.config.mjs --configLoader runner src/__tests__/components/desktopShellNavigation.test.tsx src/__tests__/components/helpModalTabs.test.tsx src/__tests__/hooks/useViewRouting.test.ts src/__tests__/hooks/useModalA11y.test.tsx src/__tests__/components/modalRobustness.test.tsx src/__tests__/components/NotificationCenterNavigation.test.tsx src/__tests__/utils/transactionItemA11y.test.tsx src/__tests__/components/debtsViewFormBehavior.test.tsx src/__tests__/components/budgetsViewPlanActions.test.tsx src/__tests__/utils/goalsDisclosure.test.tsx src/__tests__/components/financeFormsA11y.test.tsx src/__tests__/utils/filterDropdownA11y.test.tsx
  npm.cmd run typecheck
  npm.cmd run lint
  npm.cmd run build
  npm.cmd run test:run
  ```

  Expected: every command exits 0.

  Then manually verify in the running desktop app at 1024×768, 1280×720, and 1440×900: no page-level horizontal scroll; all desktop tabs reachable; skip link, heading focus, and reset scroll work from tabs, keyboard shortcuts, notification, history, and cross-view actions; dialog focus returns to trigger; and Help/filter keyboard patterns work. At a mobile width, verify the existing bottom navigation structure is unchanged and each changed shared control remains operable.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/__tests__/components/desktopShellNavigation.test.tsx src/__tests__/components/NotificationCenterNavigation.test.tsx src/__tests__/utils/transactionItemA11y.test.tsx src/__tests__/components/debtsViewFormBehavior.test.tsx src/__tests__/components/budgetsViewPlanActions.test.tsx src/__tests__/utils/goalsDisclosure.test.tsx src/__tests__/components/financeFormsA11y.test.tsx src/__tests__/utils/filterDropdownA11y.test.tsx
  git commit -m "test: cover desktop and mobile operability regressions"
  ```

## Spec coverage review

- Desktop overflow and complete primary/Help keyboard tabs: Tasks 2 and 3.
- Main landmark, skip link, one canonical heading, scroll reset, focus after lazy mount, shortcuts, notifications, history, and cross-view actions: Task 1.
- Visible enabled modal focus, forward/reverse/outside trapping, and restoration: Task 4.
- Named, operable Notification Center: Task 5.
- No nested interactive transaction row: Task 6.
- Debt, budget, goal creation/contribution labels, fieldsets, submit semantics, explicit buttons, and error state: Tasks 7 and 8.
- Coherent transaction filter popup keyboard model: Task 9.
- Desktop visual scope and shared mobile regressions: Task 10.

## Self-review

- No dependency, data-model, or financial-write change is planned.
- Every implementation task has a RED command, explicit expected failure, minimal code direction, GREEN command, and commit command.
- Interfaces are defined before their consuming task: `useViewRouting` and `FinanceViewRouter` in Task 1, `useModalA11y` in Task 4, and unchanged public component props elsewhere.
