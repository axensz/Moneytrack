# Responsive Shell and AI Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Keep MoneyTrack inside narrow viewports and replace floating AI launchers with a shell-owned, accessible, bounded assistant panel.

**Architecture:** Header owns the presentation and routing of account/assistant entry actions. FinanceTrackerContent owns controlled assistant visibility and the persistent return-focus element. The lazy AIChatBot retains conversation state and renders a non-modal panel inside a relative shell workspace. Existing semantic tokens and native React/CSS behavior are reused; no new dependency, global state, collision engine, or modal abstraction is introduced.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4 utilities, Vitest 4, Testing Library, OpenSpec 1.6, Chrome extension inspection.

## Global Constraints

- Below 640px, direct logout is visually removed from the header and Cerrar sesión remains available in Settings; at and above 640px, direct logout remains visible.
- At and above 1024px, expose a dedicated labeled assistant action; below 1024px, Settings remains the labeled assistant entry.
- Preserve the relative order of theme, privacy, notifications, settings, and direct logout controls.
- Header utility controls remain at least 44×44 CSS pixels; the shell must not horizontally overflow at 320px, 390px, or 639px.
- The panel is named Asistente MoneyTrack, has aria-modal="false", focuses the composer or first enabled action, closes with Cerrar chat or Escape, and restores focus to the persistent opening control.
- Preserve AI authentication, consent, Gemini configuration, conversation state, action confirmation, rejection, and financial write safeguards.
- Do not edit src/hooks/useModalA11y.ts, src/__tests__/hooks/useModalA11y.test.tsx, harden-desktop-shell-and-interactions, align-desktop-states-and-help, or review-debts-view-refactor.
- Preserve the approved shell, .btn-primary, .card-balance, and RecurringStatsCards gradients. Remove only assistant-specific decorative gradients, shimmer, pulse, bounce, elastic, rotation, and overscaling.
- Use existing theme.css semantic tokens; violet is brand/action/selection, while green/red/amber communicate status.
- Add no dependency and change no financial model, persistence, authentication, navigation destination, or Gemini request/response contract.
- Use TDD for every behavior change: write the focused test, observe the expected failure, implement the minimum, and observe the focused pass before the task commit.
- Preserve all pre-existing dirty and untracked user files. Stage only files named by the current task.

## File Map

- Modify src/components/layout/Header.tsx: compact composition, logout placement, state-aware assistant entries.
- Modify app/styles/components.css: enforce the shared minimum target through the existing .header-icon recipe.
- Modify src/AuthenticatedApp.tsx: controlled assistant state, persistent trigger ref, relative workspace, lazy panel mounting.
- Modify src/components/chat/AIChatBot.tsx: controlled visibility, dialog/focus behavior, bounded layout, tokenized visuals.
- Delete src/components/chat/AITeaserButton.tsx: floating entry replaced by shell entries.
- Modify src/__tests__/components/Header.test.tsx: responsive and state-routing regressions.
- Create src/__tests__/components/AIChatBot.test.tsx: control, accessibility, focus, layout, and visual contracts.
- Delete src/__tests__/utils/aiTeaserButton.test.tsx: obsolete launcher tests.
- Modify openspec/changes/stabilize-responsive-shell-and-ai-overlays/tasks.md: evidence only after validation.

---

### Task 1: Contain the compact Header and relocate logout

**Files:**
- Modify: src/components/layout/Header.tsx
- Modify: app/styles/components.css
- Test: src/__tests__/components/Header.test.tsx

**Interfaces:**
- Consumes: existing HeaderProps, menuItemClass, and .header-icon recipe.
- Produces: data-header-action="logout", data-settings-action="logout", and a compact header that later tasks extend without changing existing utility order.

- [ ] **Step 1: Add the failing compact/logout regression**

Extend the notification mock and add a reusable authenticated render helper:

~~~tsx
import type { User } from 'firebase/auth';

vi.mock('../../components/notifications/NotificationCenter', () => ({
  NotificationBell: () => (
    <button type="button" aria-label="Abrir notificaciones" className="header-icon" />
  ),
  NotificationCenter: () => null,
}));

vi.mock('../../components/theme/ThemeToggle', () => ({
  ThemeToggle: () => (
    <button type="button" aria-label="Cambiar tema" className="header-icon" />
  ),
}));

const authenticatedUser = {
  uid: 'user-1',
  displayName: 'Camilo',
  email: 'camilo@example.com',
  photoURL: null,
} as User;

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
    user: authenticatedUser,
    setIsAuthModalOpen: vi.fn(),
    showSettingsMenu: true,
    setShowSettingsMenu: vi.fn(),
    showNotifications: false,
    setShowNotifications: vi.fn(),
    onOpenHelp: vi.fn(),
    onOpenCategories: vi.fn(),
    onOpenNotificationPreferences: vi.fn(),
    onOpenAISettings: vi.fn(),
    onLogout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    ...render(<UIPreferencesProvider><Header {...props} /></UIPreferencesProvider>),
    props,
  };
}

it('keeps compact utility actions reachable and relocates logout through responsive affordances', () => {
  const { container } = renderHeader();

  for (const name of ['Cambiar tema', 'Ocultar valores', 'Abrir notificaciones', 'Abrir menú de ajustes']) {
    expect(screen.getByRole('button', { name })).toHaveClass('header-icon');
  }

  expect(container.querySelector('[data-header-action="logout"]'))
    .toHaveClass('hidden', 'sm:inline-flex');
  expect(container.querySelector('[data-settings-action="logout"]'))
    .toHaveTextContent('Cerrar sesión');
  expect(container.querySelector('header'))
    .toHaveClass('min-w-0', 'max-w-full', 'overflow-x-clip');

  const orderedExistingActions = [
    screen.getByRole('button', { name: 'Cambiar tema' }),
    screen.getByRole('button', { name: 'Ocultar valores' }),
    screen.getByRole('button', { name: 'Abrir notificaciones' }),
    screen.getByRole('button', { name: 'Abrir menú de ajustes' }),
    container.querySelector<HTMLElement>('[data-header-action="logout"]')!,
  ];
  orderedExistingActions.slice(1).forEach((action, index) => {
    expect(
      orderedExistingActions[index].compareDocumentPosition(action)
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify RED**

~~~powershell
npm.cmd run test:run -- src/__tests__/components/Header.test.tsx
~~~

Expected: FAIL because the reciprocal logout paths and containment classes do not exist.

- [ ] **Step 3: Implement the minimum compact composition**

Use these exact structural classes in Header.tsx:

~~~tsx
<header className="w-full min-w-0 max-w-full overflow-x-clip flex items-center pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 sm:pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pb-3 bg-card/90 backdrop-blur-md border-b border-border z-[100] shadow-sm shrink-0">
  <div className="w-full min-w-0 px-3 sm:px-4 md:px-6 lg:px-8">
    <div className="flex min-w-0 justify-between items-center">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3 flex-1">
        <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold leading-none whitespace-nowrap">
~~~

Make the utility group non-growing:

~~~tsx
<div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
~~~

Add the menu logout after Help:

~~~tsx
{user && (
  <>
    <div className="my-1 border-t border-border" aria-hidden="true" />
    <button
      type="button"
      data-settings-action="logout"
      onClick={() => {
        setShowSettingsMenu(false);
        void onLogout();
      }}
      className={menuItemClass + ' text-destructive'}
      role="menuitem"
    >
      <LogOut size={18} aria-hidden="true" />
      <span>Cerrar sesión</span>
    </button>
  </>
)}
~~~

Keep the direct action from sm upward:

~~~tsx
<button
  type="button"
  data-header-action="logout"
  onClick={() => void onLogout()}
  className="header-icon hidden sm:inline-flex hover:text-destructive"
  aria-label="Cerrar sesión"
>
  <LogOut size={20} aria-hidden="true" />
</button>
~~~

Update components.css:

~~~css
.header-icon {
  @apply relative inline-flex min-w-[44px] min-h-[44px] items-center justify-center p-2 sm:p-2.5 rounded-lg text-muted-foreground transition-colors;
  cursor: pointer;
}
~~~

- [ ] **Step 4: Run the focused test and verify GREEN**

~~~powershell
npm.cmd run test:run -- src/__tests__/components/Header.test.tsx
~~~

Expected: the Header test file passes.

- [ ] **Step 5: Commit only Task 1 files**

~~~powershell
git add src/components/layout/Header.tsx app/styles/components.css src/__tests__/components/Header.test.tsx
git diff --cached --check
git commit -m "fix: contain compact header actions"
~~~

---

### Task 2: Move assistant entry and controlled state into the shell

**Files:**
- Modify: src/components/layout/Header.tsx
- Modify: src/AuthenticatedApp.tsx
- Modify: src/components/chat/AIChatBot.tsx
- Delete: src/components/chat/AITeaserButton.tsx
- Modify: src/__tests__/components/Header.test.tsx
- Create: src/__tests__/components/AIChatBot.test.tsx
- Delete: src/__tests__/utils/aiTeaserButton.test.tsx

**Interfaces:**
- Consumes: Task 1 Header composition and existing aiKeyConfigured/aiHasConsent truth.
- Produces: HeaderProps.aiReady, HeaderProps.onOpenAssistant, and controlled AIChatBotProps.

- [ ] **Step 1: Add failing state-routing and controlled-state tests**

Add these Header defaults:

~~~tsx
aiReady: false,
onOpenAssistant: vi.fn(),
~~~

Add focused Header tests:

~~~tsx
it('routes the guest assistant entry to authentication', () => {
  const setIsAuthModalOpen = vi.fn();
  const { container } = renderHeader({ user: null, showSettingsMenu: false, setIsAuthModalOpen });
  fireEvent.click(container.querySelector('[data-header-action="assistant"]')!);
  expect(setIsAuthModalOpen).toHaveBeenCalledWith(true);
});

it('routes the unconfigured authenticated assistant entry to AI settings', () => {
  const onOpenAISettings = vi.fn();
  const { container } = renderHeader({ aiReady: false, showSettingsMenu: false, onOpenAISettings });
  fireEvent.click(container.querySelector('[data-header-action="assistant"]')!);
  expect(onOpenAISettings).toHaveBeenCalledTimes(1);
});

it('routes a configured assistant entry to the controlled panel trigger', () => {
  const onOpenAssistant = vi.fn();
  const { container } = renderHeader({ aiReady: true, showSettingsMenu: false, onOpenAssistant });
  const entry = container.querySelector<HTMLElement>('[data-header-action="assistant"]')!;
  fireEvent.click(entry);
  expect(onOpenAssistant).toHaveBeenCalledWith(entry);
  expect(entry).toHaveClass('hidden', 'lg:inline-flex');
});

it('uses the labeled Settings action as the compact configured entry', () => {
  const onOpenAssistant = vi.fn();
  renderHeader({ aiReady: true, showSettingsMenu: true, onOpenAssistant });
  const settingsTrigger = screen.getByRole('button', { name: 'Abrir menú de ajustes' });

  fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir asistente IA' }));

  expect(onOpenAssistant).toHaveBeenCalledWith(settingsTrigger);
});
~~~

Create AIChatBot.test.tsx:

~~~tsx
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
});
~~~

- [ ] **Step 2: Run focused tests and verify RED**

~~~powershell
npm.cmd run test:run -- src/__tests__/components/Header.test.tsx src/__tests__/components/AIChatBot.test.tsx
~~~

Expected: FAIL because Header has no assistant shell contract and AIChatBot is not controlled.

- [ ] **Step 3: Implement state-aware Header entries**

Extend HeaderProps:

~~~tsx
aiReady: boolean;
onOpenAssistant: (returnFocusTo: HTMLElement) => void;
~~~

Derive one label and routing function:

~~~tsx
const assistantLabel = !user
  ? 'Inicia sesión para usar el asistente IA'
  : aiReady
    ? 'Abrir asistente IA'
    : 'Activar asistente IA';

const activateAssistant = useCallback((returnFocusTo: HTMLElement) => {
  if (!user) setIsAuthModalOpen(true);
  else if (!aiReady) onOpenAISettings();
  else onOpenAssistant(returnFocusTo);
}, [aiReady, onOpenAISettings, onOpenAssistant, setIsAuthModalOpen, user]);
~~~

Insert the dedicated entry after notifications and before settings:

~~~tsx
<button
  type="button"
  data-header-action="assistant"
  onClick={(event) => activateAssistant(event.currentTarget)}
  className="header-icon hidden lg:inline-flex"
  aria-label={assistantLabel}
  title={assistantLabel}
>
  <Sparkles size={20} aria-hidden="true" />
</button>
~~~

Use the same label in Settings and pass the persistent settings trigger:

~~~tsx
<button
  onClick={(event) => {
    const returnFocusTo = settingsButtonRef.current ?? event.currentTarget;
    setShowSettingsMenu(false);
    activateAssistant(returnFocusTo);
  }}
  className={menuItemClass}
  role="menuitem"
>
  <Sparkles size={18} aria-hidden="true" />
  <span>{assistantLabel}</span>
  {aiAuthPending && (
    <span
      className="ml-auto w-2 h-2 rounded-full bg-destructive"
      title="Autorización de IA pendiente"
      aria-label="Autorización de IA pendiente"
    />
  )}
</button>
~~~

- [ ] **Step 4: Lift controlled assistant state into FinanceTrackerContent**

Add state beside existing overlay state:

~~~tsx
const aiReady = Boolean(user && aiKeyConfigured && aiHasConsent);
const [isAssistantOpen, setIsAssistantOpen] = useState(false);
const [hasMountedAssistant, setHasMountedAssistant] = useState(false);
const assistantTriggerRef = useRef<HTMLElement | null>(null);

const handleOpenAssistant = useCallback((returnFocusTo: HTMLElement) => {
  assistantTriggerRef.current = returnFocusTo;
  setHasMountedAssistant(true);
  setIsAssistantOpen(true);
}, []);
~~~

Pass Header:

~~~tsx
aiReady={aiReady}
onOpenAssistant={handleOpenAssistant}
~~~

Replace both floating launcher branches:

~~~tsx
{hasMountedAssistant && aiReady && (
  <Suspense fallback={null}>
    <AIChatBot
      isOpen={isAssistantOpen}
      onClose={() => setIsAssistantOpen(false)}
      returnFocusRef={assistantTriggerRef}
    />
  </Suspense>
)}
~~~

- [ ] **Step 5: Make AIChatBot controlled without resetting state**

Use this props contract:

~~~tsx
interface AIChatBotProps {
  isOpen: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}

export const AIChatBot: React.FC<AIChatBotProps> = memo(({
  isOpen,
  onClose,
  returnFocusRef,
}) => {
~~~

Delete the internal isOpen state and the closed floating-button branch. Change the visible close button to onClick={onClose}. Keep component state alive with:

~~~tsx
if (!configured || !isOpen) return null;
~~~

Delete AITeaserButton.tsx, its import/render path, and aiTeaserButton.test.tsx only after replacement tests exist.

- [ ] **Step 6: Run focused tests, verify GREEN, and commit**

~~~powershell
npm.cmd run test:run -- src/__tests__/components/Header.test.tsx src/__tests__/components/AIChatBot.test.tsx
rg -n "AITeaserButton" src
git add src/AuthenticatedApp.tsx src/components/layout/Header.tsx src/components/chat/AIChatBot.tsx src/components/chat/AITeaserButton.tsx src/__tests__/components/Header.test.tsx src/__tests__/components/AIChatBot.test.tsx src/__tests__/utils/aiTeaserButton.test.tsx
git diff --cached --check
git commit -m "feat: move assistant entry into shell"
~~~

Expected: focused tests pass and rg returns no matches.

---

### Task 3: Bound the panel and implement non-modal focus behavior

**Files:**
- Modify: src/AuthenticatedApp.tsx
- Modify: src/components/chat/AIChatBot.tsx
- Test: src/__tests__/components/AIChatBot.test.tsx

**Interfaces:**
- Consumes: Task 2 controlled AIChatBotProps and persistent returnFocusRef.
- Produces: named non-modal dialog, initial focus, one close path, return focus, one message scroll owner, workspace-relative positioning.

- [ ] **Step 1: Add failing accessibility/focus tests**

Import waitFor and add this harness:

~~~tsx
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
~~~

Add the behavior tests:

~~~tsx
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
~~~

- [ ] **Step 2: Add the failing layout-contract test**

~~~tsx
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
~~~

- [ ] **Step 3: Run the assistant tests and verify RED**

~~~powershell
npm.cmd run test:run -- src/__tests__/components/AIChatBot.test.tsx
~~~

Expected: FAIL on dialog semantics, focus restoration, workspace positioning, and part contracts.

- [ ] **Step 4: Implement one feature-local close/focus path**

Add:

~~~tsx
const panelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!isOpen) return;
  const composer = inputRef.current;
  const fallback = panelRef.current?.querySelector<HTMLButtonElement>(
    '[data-assistant-focus-fallback]:not([disabled])',
  );
  (composer && !composer.disabled ? composer : fallback)?.focus();
}, [isOpen]);

const requestClose = useCallback(() => {
  onClose();
  queueMicrotask(() => {
    const trigger = returnFocusRef.current;
    if (trigger?.isConnected) trigger.focus();
  });
}, [onClose, returnFocusRef]);

const handlePanelKeyDown = useCallback(
  (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    requestClose();
  },
  [requestClose],
);
~~~

Use this root contract:

~~~tsx
<div
  ref={panelRef}
  role="dialog"
  aria-modal="false"
  aria-labelledby="assistant-title"
  onKeyDown={handlePanelKeyDown}
  className="absolute inset-x-3 top-3 bottom-[calc(var(--shell-nav-h,72px)+env(safe-area-inset-bottom))] sm:left-auto sm:right-4 sm:bottom-4 sm:w-[420px] z-[80] flex flex-col min-w-0 max-w-[calc(100%-1.5rem)] bg-card text-card-foreground rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200"
>
~~~

Apply these exact edits to the existing title, controls, message-region opening tag, composer opening tag, and input:

~~~diff
- <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white shrink-0 relative overflow-hidden">
+ <div data-assistant-titlebar className="flex items-center justify-between px-4 py-3 bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white shrink-0 relative overflow-hidden">

- <h3 className="text-sm font-semibold drop-shadow-sm">Asistente MoneyTrack</h3>
+ <h2 id="assistant-title" className="text-sm font-semibold drop-shadow-sm">Asistente MoneyTrack</h2>

- <button onClick={handleClearChat}
+ <button data-assistant-focus-fallback onClick={handleClearChat}

- <button onClick={onClose}
+ <button onClick={requestClose}

- <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 min-h-0 bg-gradient-to-b from-gray-50/50 to-transparent dark:from-gray-800/30 dark:to-transparent scrollbar-thin">
+ <div data-assistant-messages className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 bg-gradient-to-b from-gray-50/50 to-transparent dark:from-gray-800/30 dark:to-transparent scrollbar-thin">

- <div className="border-t border-gray-200 dark:border-gray-700 p-3 shrink-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
+ <div data-assistant-composer className="border-t border-gray-200 dark:border-gray-700 p-3 shrink-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">

  <input
    ref={inputRef}
    aria-label="Mensaje para el asistente"
    type="text"
~~~

- [ ] **Step 5: Introduce the relative shell workspace**

Insert this opening wrapper immediately before the existing main element, without changing that main element or its descendants:

~~~tsx
<div className="relative flex flex-col flex-1 min-h-0 min-w-0">
~~~

Immediately after the existing main closing tag, insert the controlled panel and close the wrapper:

~~~tsx
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
~~~

Remove the old assistant render below main. Add w-full min-w-0 overflow-x-hidden to the authenticated shell root while preserving its approved gradient.

- [ ] **Step 6: Run focused tests, verify GREEN, and commit**

~~~powershell
npm.cmd run test:run -- src/__tests__/components/AIChatBot.test.tsx src/__tests__/components/desktopShellNavigation.test.tsx
git add src/AuthenticatedApp.tsx src/components/chat/AIChatBot.tsx src/__tests__/components/AIChatBot.test.tsx
git diff --cached --check
git commit -m "fix: bound assistant panel to shell"
~~~

---

### Task 4: Align assistant visuals and motion to semantic tokens

**Files:**
- Modify: src/components/chat/AIChatBot.tsx
- Test: src/__tests__/components/AIChatBot.test.tsx

**Interfaces:**
- Consumes: Task 3 real rendered panel and existing semantic CSS variables/classes.
- Produces: no decorative assistant gradient/shimmer/pulse/rotation/overscaling and a 200ms non-bouncing panel transition.

- [ ] **Step 1: Add the failing rendered visual-contract test**

~~~tsx
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
~~~

- [ ] **Step 2: Run the assistant test and verify RED**

~~~powershell
npm.cmd run test:run -- src/__tests__/components/AIChatBot.test.tsx
~~~

Expected: FAIL because assistant descendants still contain gradients, shimmer, and scale/rotation motion.

- [ ] **Step 3: Replace assistant-only recipes with semantic roles**

Use these exact recipes:

~~~tsx
// Expandable token details
className="mt-1.5 p-2.5 bg-muted rounded-lg text-[10px] text-foreground space-y-1 border border-border animate-in fade-in duration-200"

// Action confirmation
className="bg-muted border border-border rounded-xl p-3 space-y-2.5 shadow-sm animate-in fade-in duration-200"

// Confirm / cancel
className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-success text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-card text-foreground border border-border hover:bg-muted disabled:opacity-50 transition-colors"

// Solid title bar and actions
className="flex items-center justify-between px-4 py-3 bg-primary-solid text-primary-foreground shrink-0"
className="p-2 rounded-lg hover:bg-white/15 transition-colors"

// Model / user identity and bubbles
className="shrink-0 w-7 h-7 rounded-full bg-surface-primary text-primary-text flex items-center justify-center mt-1 border border-border-accent"
className="bg-card text-card-foreground rounded-bl-md border border-border"
className="bg-primary-solid text-primary-foreground rounded-br-md whitespace-pre-wrap"

// Suggestions
className="text-xs px-3 py-1.5 rounded-full bg-muted text-primary hover:bg-surface-primary transition-colors border border-border-accent"

// Composer
className="border-t border-border p-3 shrink-0 bg-card"
className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 transition-[border-color,box-shadow]"
className="p-2.5 rounded-xl bg-primary-solid text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"

// Error
className="text-center px-3 py-2 text-xs text-destructive bg-destructive-muted rounded-lg border border-destructive animate-in fade-in duration-200"
~~~

Remove assistant-only shimmer nodes, backdrop blur, purple/gray hard-coded gradients, hover:scale, active:scale, and rotation. Retain animate-spin only for actual loading and rely on the existing global prefers-reduced-motion rule.

- [ ] **Step 4: Run focused tests and deterministic detector**

~~~powershell
npm.cmd run test:run -- src/__tests__/components/AIChatBot.test.tsx
node .agents/skills/impeccable/scripts/detect.mjs --json src/components/chat/AIChatBot.tsx src/components/layout/Header.tsx src/AuthenticatedApp.tsx
~~~

Expected: focused tests pass. Any shell-gradient finding is classified as approved and unchanged; no real assistant-specific decorative finding remains.

- [ ] **Step 5: Commit only Task 4 files**

~~~powershell
git add src/components/chat/AIChatBot.tsx src/__tests__/components/AIChatBot.test.tsx
git diff --cached --check
git commit -m "style: align assistant with product tokens"
~~~

---

### Task 5: Verify in automation and Chrome, then reconcile OPSX evidence

**Files:**
- Modify: openspec/changes/stabilize-responsive-shell-and-ai-overlays/tasks.md
- Inspect only: every dirty/untracked file outside this change.

**Interfaces:**
- Consumes: Tasks 1–4 commits and the OpenSpec scenarios.
- Produces: fresh automated, build, detector, Chrome, graph, and strict OpenSpec evidence; checked tasks only where evidence exists.

- [ ] **Step 1: Run focused and regression suites**

~~~powershell
npm.cmd run test:run -- src/__tests__/components/Header.test.tsx src/__tests__/components/AIChatBot.test.tsx src/__tests__/components/desktopShellNavigation.test.tsx src/__tests__/components/modalRobustness.test.tsx src/__tests__/hooks/useModalA11y.test.tsx
~~~

Expected: all selected files pass, including the untouched local modal work.

- [ ] **Step 2: Run static and full automated validation**

~~~powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:run -- --reporter=dot
npx.cmd --no-install next build
~~~

Before and after build, record git status --short --untracked-files=all and git diff -- public/sw.js. public/sw.js and unrelated user files must remain unchanged.

- [ ] **Step 3: Refresh the graph and review impact**

Run the incremental graph update, detect_changes from the Task 1 base, get_affected_flows, and tests_for queries for Header and AIChatBot. Resolve any real test gap before continuing.

- [ ] **Step 4: Verify localhost through the Chrome extension**

Check:

~~~text
390×844 light
390×844 dark
1270×571 light
1270×571 dark
1440×900 light sanity check
~~~

At each required size verify document.documentElement.scrollWidth <= document.documentElement.clientWidth, no header action is clipped, and no closed floating assistant control covers content. Verify the state-appropriate entry, open Asistente MoneyTrack, confirm title/clear/close/messages/composer are reachable, press Escape, and confirm focus returns to the persistent shell trigger. At 390×844 confirm the panel stays above mobile navigation. At 1270×571 confirm the header cannot cover the close control.

- [ ] **Step 5: Reconcile OpenSpec tasks and validate strictly**

Mark a checkbox only when its evidence exists, then run:

~~~powershell
openspec.cmd validate stabilize-responsive-shell-and-ai-overlays --type change --strict --no-interactive
openspec.cmd validate --changes --strict --no-interactive
~~~

Expected: the current change and all active changes validate with zero issues. Leave other change task states untouched.

- [ ] **Step 6: Commit the evidence reconciliation**

~~~powershell
git add openspec/changes/stabilize-responsive-shell-and-ai-overlays/tasks.md
git diff --cached --check
git commit -m "docs: record responsive shell validation"
~~~

Final preservation check:

~~~powershell
git status --short --branch --untracked-files=all
git diff -- src/hooks/useModalA11y.ts src/__tests__/hooks/useModalA11y.test.tsx
git status --short -- openspec/changes/review-debts-view-refactor
~~~

The pre-existing modal diff and untracked debts change remain present and never appear in a task commit.
